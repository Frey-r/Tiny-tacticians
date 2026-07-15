import { redis } from '../devvitProxy/index.ts';
import { keys } from './keys.ts';
import { DeckSnapshot, ActionLog, General, Consejero } from '../../shared/types/index.ts';
import { simulateRun } from '../../shared/sim/simulateRun.ts';
import { getUserConsejeros, getUserProfile } from './rewards.ts';
import { checkRateLimit } from './rateLimit.ts';
import { LOADOUT_SIZE } from '../../shared/sim/balance.ts';

const RUN_TTL_SECONDS = 1800; // 30 minutes
const GENERAL_TTL_SECONDS = 30 * 24 * 3600; // 30 days
const MAX_RUNS_PER_HOUR = 10;

export async function startRun(
  userId: string,
  requestedDeck: DeckSnapshot
): Promise<{ runId: string; seed: string; deckSnapshot: DeckSnapshot }> {
  // 1. Throttling / Rate limiting (10 runs per hour)
  await checkRateLimit('run', userId, MAX_RUNS_PER_HOUR, 3600_000);

  // 2. Validar propiedad y tamaño del loadout, y RECONSTRUIR el deck autoritativo
  //    desde Redis. El cliente solo elige IDS; nivel/afinidad los pone el servidor,
  //    así un cliente no puede inyectar consejeros que no posee ni inflar niveles
  //    (run-training.spec §Start Run + security.spec §Server-Authoritative State).
  if (!Array.isArray(requestedDeck)) {
    throw new Error('INVALID_LOADOUT: El loadout debe ser un arreglo.');
  }
  const requestedIds = requestedDeck.map((c) => c?.id);
  if (requestedIds.length !== LOADOUT_SIZE) {
    throw new Error(`INVALID_LOADOUT: El loadout debe tener exactamente ${LOADOUT_SIZE} consejeros.`);
  }
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new Error('INVALID_LOADOUT: No se permiten consejeros repetidos en el loadout.');
  }

  const owned = await getUserConsejeros(userId);
  const ownedById = new Map(owned.map((c) => [c.id, c]));

  const deckSnapshot: DeckSnapshot = requestedIds.map((id) => {
    const advisor = ownedById.get(id as string);
    if (!advisor) {
      throw new Error(`FORBIDDEN_ADVISOR: No posees el consejero '${id}'.`);
    }
    // Copia autoritativa (ignora cualquier nivel/afinidad enviado por el cliente).
    const authoritative: Consejero = {
      id: advisor.id,
      name: advisor.name,
      affinity: advisor.affinity,
      level: advisor.level,
    };
    return authoritative;
  });

  // 3. Generate runId and seed
  // Standard UUID replacement for safe serverless usage
  const runId = `run_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
  const seed = `seed_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`;

  // 3. Persist run with TTL
  const runState = {
    runId,
    seed,
    deckSnapshot,
    ownerId: userId,
    status: 'OPEN',
    createdAt: Date.now(),
  };

  const runKey = `run:${runId}`;
  await redis.set(runKey, JSON.stringify(runState), { expiration: RUN_TTL_SECONDS });

  return { runId, seed, deckSnapshot };
}

export async function submitRun(
  userId: string,
  runId: string,
  actionLog: ActionLog,
  name?: string
): Promise<General> {
  const runKey = `run:${runId}`;
  const runData = await redis.get(runKey);

  if (!runData) {
    throw new Error('RUN_NOT_FOUND: La run no existe o ha expirado.');
  }

  const run = JSON.parse(runData);

  if (run.status !== 'OPEN') {
    throw new Error('RUN_ALREADY_SUBMITTED: Esta run ya fue completada.');
  }

  if (run.ownerId !== userId) {
    throw new Error('FORBIDDEN: You do not own this run.');
  }

  if (Date.now() - run.createdAt > RUN_TTL_SECONDS * 1000) {
    throw new Error('RUN_EXPIRED: La run ha expirado.');
  }

  // 1. Simulate the run server-side to get authoritative stats
  const general = simulateRun(run.seed, run.deckSnapshot, actionLog, name);
  
  // 2. Fill owner and timestamps
  general.ownerId = userId;
  general.createdAt = Date.now();

  // 3. Persist the minted General
  const generalKey = keys.general(general.id);
  await redis.set(generalKey, JSON.stringify(general), { expiration: GENERAL_TTL_SECONDS });

  // 4. Register ownership in user's general list
  const userGeneralsKey = keys.userGenerals(userId);
  await redis.zAdd(userGeneralsKey, { member: general.id, score: general.createdAt });

  // 5. Add to the matchmaking pool
  const poolKey = keys.poolPower();
  await redis.zAdd(poolKey, { member: general.id, score: general.power });

  // 6. Cap matchmaking pool size to prevent infinite Redis growth (e.g. cap at 500)
  const poolSize = await redis.zCard(poolKey);
  if (poolSize > 500) {
    // remove the ones with lowest power
    await redis.zRemRangeByRank(poolKey, 0, poolSize - 501);
  }

  // 7. Consume the run (delete it so it cannot be replayed)
  await redis.del(runKey);

  // 8. Marcar el onboarding como completado en la PRIMERA acuñación. Ata el flag
  //    "onboardedAt" a "completó la primera run y acuñó un general": mientras esté
  //    ausente, el cliente muestra la cinemática de intro + tutorial guiado.
  const profile = await getUserProfile(userId);
  if (!profile.onboardedAt) {
    await redis.hSet(keys.user(userId), { onboardedAt: String(Date.now()) });
  }

  return general;
}
