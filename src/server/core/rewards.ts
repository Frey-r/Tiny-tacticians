import { redis } from '../devvitProxy/index.ts';
import { keys } from './keys.ts';
import { UserProfile, Consejero } from '../../shared/types/index.ts';
import {
  DEFAULT_CONSEJEROS,
  ADVISOR_CATALOG,
  advisorOrder,
  MAX_CONSEJERO_LEVEL,
} from './advisors.ts';

const INITIAL_GOLD = 1000;
const INITIAL_SETTLEMENT_LEVEL = 1;

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const userKey = keys.user(userId);
  const data = await redis.hGet(userKey, 'userId');

  if (!data) {
    // Initialize profile
    const profile: UserProfile = {
      userId,
      gold: INITIAL_GOLD,
      settlementLevel: INITIAL_SETTLEMENT_LEVEL,
      schemaVersion: 1,
    };

    await redis.hSet(userKey, {
      userId: profile.userId,
      gold: String(profile.gold),
      settlementLevel: String(profile.settlementLevel),
      schemaVersion: String(profile.schemaVersion),
    });

    // Initialize default level 1 advisors
    const advisorsKey = keys.userConsejeros(userId);
    const advisorMap: Record<string, string> = {};
    for (const c of DEFAULT_CONSEJEROS) {
      advisorMap[c.id] = '1';
    }
    await redis.hSet(advisorsKey, advisorMap);

    return profile;
  }

  const goldStr = await redis.hGet(userKey, 'gold');
  const levelStr = await redis.hGet(userKey, 'settlementLevel');

  return {
    userId,
    gold: goldStr ? parseInt(goldStr, 10) : INITIAL_GOLD,
    settlementLevel: levelStr ? parseInt(levelStr, 10) : INITIAL_SETTLEMENT_LEVEL,
    schemaVersion: 1,
  };
}

export async function getUserConsejeros(userId: string): Promise<Consejero[]> {
  const advisorsKey = keys.userConsejeros(userId);
  await getUserProfile(userId); // Ensures initialization (seeds default advisors)

  // Enumerar TODOS los consejeros poseídos (incluye los adquiridos vía reto diario),
  // resolviendo identidad desde el catálogo. El hash guarda solo id -> nivel.
  const owned = await redis.hGetAll(advisorsKey);

  const results: Consejero[] = [];
  for (const [id, lvlStr] of Object.entries(owned)) {
    const base = ADVISOR_CATALOG[id];
    if (!base) continue; // id desconocido (dato corrupto/legado): se ignora con seguridad
    const level = parseInt(lvlStr, 10);
    results.push({
      id: base.id,
      name: base.name,
      affinity: base.affinity,
      level: Number.isFinite(level) && level > 0 ? level : 1,
    });
  }

  results.sort((a, b) => advisorOrder(a.id) - advisorOrder(b.id));
  return results;
}

/**
 * Concede un consejero al usuario (nivel 1) si aún no lo posee. Idempotente
 * respecto a la posesión: si ya lo tiene, no hace nada y devuelve null.
 * La identidad se resuelve desde el catálogo.
 */
export async function grantConsejero(
  userId: string,
  advisorId: string
): Promise<Consejero | null> {
  const base = ADVISOR_CATALOG[advisorId];
  if (!base) return null;

  const advisorsKey = keys.userConsejeros(userId);
  await getUserProfile(userId); // Ensure init

  const existing = await redis.hGet(advisorsKey, advisorId);
  if (existing) return null; // ya lo posee

  await redis.hSet(advisorsKey, { [advisorId]: '1' });
  return { id: base.id, name: base.name, affinity: base.affinity, level: 1 };
}

export async function adjustGold(userId: string, amount: number): Promise<number> {
  const userKey = keys.user(userId);

  for (let attempt = 0; attempt < 10; attempt++) {
    await redis.watch(userKey);
    const profile = await getUserProfile(userId);
    const newGold = profile.gold + amount;

    if (newGold < 0) {
      await redis.unwatch();
      throw new Error(`INSUFFICIENT_FUNDS: No tienes suficiente oro (requerido: ${Math.abs(amount)}, disponible: ${profile.gold}).`);
    }

    const txn = redis.multi();
    txn.hSet(userKey, { gold: String(newGold) });
    const res = await txn.exec();

    if (res && res.length > 0) {
      return newGold;
    }
    // Conflict, retry
  }

  throw new Error('CONCURRENCY_ERROR: Conflicto al actualizar tu saldo de oro. Inténtalo de nuevo.');
}

export async function recordBattleRewards(
  userId: string,
  isWinner: boolean,
  generalId: string
): Promise<{ goldEarned: number; newGoldTotal: number; scoreEarned: number }> {
  // Win: +200 gold, +15 score points. Loss: +50 gold, +2 score points.
  const goldEarned = isWinner ? 200 : 50;
  const scoreEarned = isWinner ? 15 : 2;

  // 1. Adjust Gold atomically
  const newGoldTotal = await adjustGold(userId, goldEarned);

  // 2. Update atomic leaderboard score
  const lbKey = keys.lbSeason(1);
  await redis.zIncrBy(lbKey, userId, scoreEarned);

  return { goldEarned, newGoldTotal, scoreEarned };
}

export async function levelConsejero(
  userId: string,
  advisorId: string
): Promise<{ advisorId: string; newLevel: number; cost: number }> {
  const userKey = keys.user(userId);
  const advisorsKey = keys.userConsejeros(userId);

  // Validate advisor exists in the catalog
  const baseAdvisor = ADVISOR_CATALOG[advisorId];
  if (!baseAdvisor) {
    throw new Error('ADVISOR_NOT_FOUND: El consejero especificado no existe.');
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    await redis.watch([userKey, advisorsKey]);

    const profile = await getUserProfile(userId);
    const lvlStr = await redis.hGet(advisorsKey, advisorId);

    // Ownership: solo puedes subir de nivel consejeros que posees (security.spec).
    if (!lvlStr) {
      await redis.unwatch();
      throw new Error('FORBIDDEN: No posees este consejero.');
    }

    const currentLevel = parseInt(lvlStr, 10) || 1;

    // Tope de nivel máximo (meta-progression.spec §Consejero Leveling sad path).
    if (currentLevel >= MAX_CONSEJERO_LEVEL) {
      await redis.unwatch();
      throw new Error(`MAX_LEVEL_REACHED: El consejero ya está en su nivel máximo (${MAX_CONSEJERO_LEVEL}).`);
    }

    // Cost formula: level * 150 gold
    const cost = currentLevel * 150;

    if (profile.gold < cost) {
      await redis.unwatch();
      throw new Error(`INSUFFICIENT_FUNDS: No tienes suficiente oro para subir de nivel a este consejero (requerido: ${cost}, disponible: ${profile.gold}).`);
    }

    const newLevel = currentLevel + 1;
    const newGold = profile.gold - cost;

    const txn = redis.multi();
    txn.hSet(userKey, { gold: String(newGold) });
    txn.hSet(advisorsKey, { [advisorId]: String(newLevel) });
    const res = await txn.exec();

    if (res && res.length > 0) {
      return { advisorId, newLevel, cost };
    }
  }

  throw new Error('CONCURRENCY_ERROR: Conflicto al subir de nivel al consejero. Inténtalo de nuevo.');
}
