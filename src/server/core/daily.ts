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
import { adjustGold, grantConsejero } from './rewards.ts';
import { checkRateLimit } from './rateLimit.ts';
import { checkAndLockIdempotency, saveIdempotency } from './idempotency.ts';
import { ACQUIRABLE_CONSEJEROS } from './advisors.ts';
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
  Consejero,
  DailyChallenge,
  DailyModifier,
  DailyStatus,
  DailyClaimResult,
} from '../../shared/types/index.ts';

const DAILY_TTL_SECONDS = 2 * 24 * 3600; // el reto y sus marcadores viven 2 días
const BATTLE_TTL_SECONDS = 86400; // 24h de replay
const DAILY_GOLD = 100;
const DAILY_SCORE = 5;
const DAILY_CONSEJERO_CHANCE = 0.25; // 25% de conceder un consejero al reclamar
const DAILY_BATTLE_LIMIT = 30; // combates diarios por hora (anti-abuso)

// Modificadores del día: cada uno sesga la generación del enemigo de forma temática.
const DAILY_MODIFIERS: (DailyModifier & { apply: (s: GeneralStats) => void })[] = [
  {
    id: 'mod_cab',
    name: 'Doctrina de Caballería',
    description: 'El enemigo carga con fuerza. +12 Ofensiva.',
    apply: (s) => { s.ofe += 12; },
  },
  {
    id: 'mod_mur',
    name: 'Muralla de Escudos',
    description: 'El enemigo se atrinchera. +12 Defensiva.',
    apply: (s) => { s.def += 12; },
  },
  {
    id: 'mod_man',
    name: 'Maestría Táctica',
    description: 'El enemigo maniobra con astucia. +12 Mando.',
    apply: (s) => { s.man += 12; },
  },
  {
    id: 'mod_horda',
    name: 'Horda Veterana',
    description: 'Tropas curtidas en todos los frentes. +6 a todas las estadísticas.',
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
    name: `Orden Carmesí (${modifier.name})`,
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
    throw new Error('FORBIDDEN: No eres el dueño de este general.');
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

async function rollAndGrantConsejero(userId: string, prng: PRNG): Promise<Consejero | null> {
  const ownedMap = await redis.hGetAll(keys.userConsejeros(userId));
  const candidates = ACQUIRABLE_CONSEJEROS.filter((a) => !(a.id in ownedMap));
  if (candidates.length === 0) return null;
  const pick = candidates[prng.nextInt(0, candidates.length - 1)];
  return grantConsejero(userId, pick.id);
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
    throw new Error('DAILY_EXPIRED: Este reto diario ya está cerrado.');
  }

  // Elegibilidad: debe haber completado el objetivo de hoy.
  const completed = await redis.get(keys.dailyCompletion(date, userId));
  if (!completed) {
    throw new Error('DAILY_NOT_ELIGIBLE: Aún no has completado el reto diario de hoy.');
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

  // Tirada sembrada de consejero: decidida por el servidor, no por el cliente.
  let consejeroGranted: Consejero | null = null;
  const prng = new PRNG(`claim_${date}_${userId}`);
  if (prng.nextFloat() < DAILY_CONSEJERO_CHANCE) {
    consejeroGranted = await rollAndGrantConsejero(userId, prng);
  }

  const result: DailyClaimResult = {
    date,
    goldEarned: DAILY_GOLD,
    scoreEarned: DAILY_SCORE,
    newGoldTotal,
    consejeroGranted,
  };

  await saveIdempotency(token, JSON.stringify(result), DAILY_TTL_SECONDS);
  return result;
}
