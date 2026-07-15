/* ============================================================
   Daily Events (capability daily-events).
   Reto diario sembrado por el servidor: generación idempotente por
   fecha canónica (UTC), combate diario con semilla reproducible,
   y reclamo único por usuario/día (oro + tirada sembrada de
   consejero). Toda autoridad vive en el servidor; el cliente no
   puede forzar ni predecir la concesión.
   ============================================================ */
import { redis } from '../devvitProxy/index.ts';
import { keys } from './keys.ts';
import { getGeneral } from './generals.ts';
import { adjustGold } from './rewards.ts';
import { checkRateLimit } from './rateLimit.ts';
import { checkAndLockIdempotency, saveIdempotency } from './idempotency.ts';
import { grantContract, contractColorForModifier } from './recruitment.ts';
import { PRNG } from '../../shared/sim/prng.ts';
import { simulateBattle } from '../../shared/sim/simulateBattle.ts';
import {
  BASE_STAT,
  MAX_STAT,
  MIN_STAT,
  calculatePower,
  calculateTier,
  deriveAbilities,
} from '../../shared/sim/balance.ts';
import {
  General,
  GeneralStats,
  DailyChallenge,
  DailyModifier,
  DailyStatus,
  DailyClaimResult,
} from '../../shared/types/index.ts';

const DAILY_TTL_SECONDS = 2 * 24 * 3600; // el reto y sus marcadores viven 2 días
const BATTLE_TTL_SECONDS = 86400; // 24h de replay
const DAILY_GOLD = 100;
const DAILY_SCORE = 5;
const DAILY_BATTLE_LIMIT = 30; // combates diarios por hora (anti-abuso)

// Modificadores del día: cada uno sesga la generación del enemigo de forma temática.
const DAILY_MODIFIERS: (DailyModifier & { apply: (s: GeneralStats) => void })[] = [
  {
    id: 'mod_cab',
    name: 'Cavalry Doctrine',
    description: 'The enemy charges hard. +12 Offense.',
    apply: (s) => { s.ofe += 12; },
  },
  {
    id: 'mod_mur',
    name: 'Shield Rampart',
    description: 'The enemy digs in. +12 Defense.',
    apply: (s) => { s.def += 12; },
  },
  {
    id: 'mod_man',
    name: 'Tactical Mastery',
    description: 'The enemy maneuvers cunningly. +12 Command.',
    apply: (s) => { s.man += 12; },
  },
  {
    id: 'mod_horda',
    name: 'Veteran Horde',
    description: 'Battle-hardened on all fronts. +6 to all stats.',
    apply: (s) => { s.ofe += 6; s.def += 6; s.man += 6; },
  },
];

/** Fecha canónica del reto: UTC YYYY-MM-DD. */
export function getCanonicalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function clampStats(s: GeneralStats): void {
  s.ofe = Math.max(MIN_STAT, Math.min(MAX_STAT, Math.round(s.ofe)));
  s.def = Math.max(MIN_STAT, Math.min(MAX_STAT, Math.round(s.def)));
  s.man = Math.max(MIN_STAT, Math.min(MAX_STAT, Math.round(s.man)));
}

function buildDailyEnemy(
  date: string,
  seed: string,
  prng: PRNG,
  modifier: DailyModifier & { apply: (s: GeneralStats) => void }
): General {
  const stats: GeneralStats = {
    ofe: BASE_STAT + prng.nextInt(15, 45),
    def: BASE_STAT + prng.nextInt(15, 45),
    man: BASE_STAT + prng.nextInt(10, 40),
  };
  modifier.apply(stats);
  clampStats(stats);

  return {
    id: `daily_${date}`,
    ownerId: 'daily',
    name: `Crimson Order (${modifier.name})`,
    stats,
    power: calculatePower(stats),
    tier: calculateTier(calculatePower(stats)),
    abilities: deriveAbilities(stats),
    seed,
    schemaVersion: 1,
    createdAt: Date.now(),
  };
}

/** Adjunta el postId guardado (si el cron ya publicó el post) a la copia del reto. */
async function withPostId(challenge: DailyChallenge, date: string): Promise<DailyChallenge> {
  const postId = await redis.get(keys.dailyPost(date));
  return postId ? { ...challenge, postId } : challenge;
}

/**
 * Devuelve el reto del día, creándolo perezosamente de forma idempotente si no
 * existe (p. ej. el cron no se disparó). Una segunda creación para la misma fecha
 * es un no-op: se conserva el primer reto persistido.
 */
export async function getOrCreateDailyChallenge(
  date: string = getCanonicalDate()
): Promise<DailyChallenge> {
  const key = keys.dailyChallenge(date);

  const existing = await redis.get(key);
  if (existing) return withPostId(JSON.parse(existing) as DailyChallenge, date);

  const seed = `daily_${date}`;
  const prng = new PRNG(seed);
  const modifier = DAILY_MODIFIERS[prng.nextInt(0, DAILY_MODIFIERS.length - 1)];
  const enemy = buildDailyEnemy(date, seed, prng, modifier);

  const challenge: DailyChallenge = {
    date,
    seed,
    enemy,
    modifier: { id: modifier.id, name: modifier.name, description: modifier.description },
    schemaVersion: 1,
  };

  // NX: si otro request lo creó primero, el suyo gana; releemos el canónico.
  await redis.set(key, JSON.stringify(challenge), { nx: true, expiration: DAILY_TTL_SECONDS });
  const canonical = await redis.get(key);
  const finalChallenge = canonical ? (JSON.parse(canonical) as DailyChallenge) : challenge;
  return withPostId(finalChallenge, date);
}

/** Estado por usuario del reto de hoy: si lo completó y si ya reclamó. */
export async function getDailyStatus(
  userId: string,
  date: string = getCanonicalDate()
): Promise<DailyStatus> {
  const completed = !!(await redis.get(keys.dailyCompletion(date, userId)));
  const claimRaw = await redis.get(keys.idemp(keys.dailyClaimToken(date, userId)));
  const claimed = !!claimRaw && claimRaw !== 'PENDING';
  return { completed, claimed };
}

/**
 * Resuelve el combate diario del usuario contra el enemigo del reto con una
 * semilla reproducible derivada de (fecha, general atacante). Marca el objetivo
 * como completado si el atacante gana. No acredita recursos (eso es el reclamo).
 */
export async function resolveDailyBattle(
  userId: string,
  attackerId: string,
  date: string = getCanonicalDate()
): Promise<{ battleResult: ReturnType<typeof simulateBattle>; completed: boolean }> {
  await checkRateLimit('daily-battle', userId, DAILY_BATTLE_LIMIT, 3600_000);

  const challenge = await getOrCreateDailyChallenge(date);

  const attacker = await getGeneral(attackerId);
  if (!attacker) {
    throw new Error('GENERAL_NOT_FOUND: General atacante no encontrado.');
  }
  if (attacker.ownerId !== userId) {
    throw new Error('FORBIDDEN: You do not own this general.');
  }

  // Semilla reproducible derivada de las entradas + contexto (fecha del reto).
  const battleSeed = `dbat_${date}_${attackerId}`;
  const battleResult = simulateBattle(battleSeed, attacker, challenge.enemy);

  await redis.set(keys.battle(battleResult.battleId), JSON.stringify(battleResult), {
    expiration: BATTLE_TTL_SECONDS,
  });

  const won = battleResult.winnerId === attacker.id;
  if (won) {
    await redis.set(keys.dailyCompletion(date, userId), '1', {
      nx: true,
      expiration: DAILY_TTL_SECONDS,
    });
  }

  const completed = !!(await redis.get(keys.dailyCompletion(date, userId)));
  return { battleResult, completed };
}

/**
 * Reclama la recompensa diaria una sola vez por usuario y fecha, de forma
 * atómica e idempotente. Requiere haber completado el reto de hoy.
 */
export async function claimDaily(
  userId: string,
  date: string = getCanonicalDate()
): Promise<DailyClaimResult> {
  // Rechazar retos pasados o expirados.
  if (date !== getCanonicalDate()) {
    throw new Error('DAILY_EXPIRED: This daily challenge is already closed.');
  }

  // Elegibilidad: debe haber completado el objetivo de hoy.
  const completed = await redis.get(keys.dailyCompletion(date, userId));
  if (!completed) {
    throw new Error("DAILY_NOT_ELIGIBLE: You haven't completed today's daily challenge yet.");
  }

  // Candado idempotente: el primero gana, el resto se rechaza (sin doble crédito).
  const token = keys.dailyClaimToken(date, userId);
  const lock = await checkAndLockIdempotency(token, DAILY_TTL_SECONDS);
  if (!lock.isNew) {
    throw new Error('DAILY_ALREADY_CLAIMED: Ya reclamaste la recompensa de hoy.');
  }

  // Acreditar oro (atómico, no permite negativos) y puntos de leaderboard.
  const newGoldTotal = await adjustGold(userId, DAILY_GOLD);
  await redis.zIncrBy(keys.lbSeason(1), userId, DAILY_SCORE);

  // El reto diario entrega un CONTRATO (color según el modificador del día),
  // canjeable luego por un consejero a elección en Reclutamiento.
  const challenge = await getOrCreateDailyChallenge(date);
  const contractGranted = contractColorForModifier(challenge.modifier.id);
  await grantContract(userId, contractGranted);

  const result: DailyClaimResult = {
    date,
    goldEarned: DAILY_GOLD,
    scoreEarned: DAILY_SCORE,
    newGoldTotal,
    contractGranted,
  };

  await saveIdempotency(token, JSON.stringify(result), DAILY_TTL_SECONDS);
  return result;
}
