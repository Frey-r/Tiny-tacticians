/* ============================================================
   Reclutamiento de consejeros (meta-progresión).

   Dos vías para conseguir consejeros del pool adquirible (c4..c9):
   1) PETICIÓN DIARIA: préstamo TEMPORAL de un consejero al azar de los
      que faltan, vigente 24h (la clave Redis caduca sola; su presencia
      es el cooldown). No es desbloqueo permanente.
   2) CONTRATOS: el reto diario entrega un contrato (color según su
      modificador). Contrato + oro desbloquea PERMANENTEMENTE un
      consejero a elección cuyo color coincida (blanco = comodín).
   Toda autoridad vive en el servidor.
   ============================================================ */
import { redis } from '../devvitProxy/index.ts';
import { keys } from './keys.ts';
import { getUserProfile } from './rewards.ts';
import { ACQUIRABLE_CONSEJEROS, ADVISOR_CATALOG } from './advisors.ts';
import { PRNG } from '../../shared/sim/prng.ts';
import {
  Consejero,
  Contracts,
  ContractColor,
  CONTRACT_COLORS,
  contractMatches,
  RecruitCandidate,
  RecruitmentState,
} from '../../shared/types/index.ts';

export const CONTRACT_UNLOCK_GOLD = 600; // oro por desbloqueo con contrato (tunable)
const LOAN_TTL_SECONDS = 24 * 3600;

/** Fecha canónica (UTC YYYY-MM-DD); local para no acoplar con daily.ts (evita ciclo). */
function canonicalDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Modificador del reto diario -> color de contrato que entrega. */
const MOD_CONTRACT: Record<string, ContractColor> = {
  mod_cab: 'red', // Caballería (OFE)
  mod_mur: 'blue', // Muralla (DEF)
  mod_man: 'purple', // Maestría (MAN)
  mod_horda: 'white', // Horda (comodín)
};
export function contractColorForModifier(modifierId: string): ContractColor {
  return MOD_CONTRACT[modifierId] ?? 'white';
}

export async function getContracts(userId: string): Promise<Contracts> {
  const raw = await redis.hGetAll(keys.userContracts(userId));
  const c: Contracts = { white: 0, red: 0, blue: 0, purple: 0 };
  for (const color of CONTRACT_COLORS) {
    const v = parseInt(raw[color] ?? '0', 10);
    c[color] = Number.isFinite(v) && v > 0 ? v : 0;
  }
  return c;
}

/** Suma 1 contrato del color dado de forma atómica. Devuelve el conteo nuevo. */
export async function grantContract(userId: string, color: ContractColor): Promise<Contracts> {
  const key = keys.userContracts(userId);
  for (let attempt = 0; attempt < 10; attempt++) {
    await redis.watch(key);
    const current = await getContracts(userId);
    const next: Contracts = { ...current, [color]: current[color] + 1 };
    const txn = redis.multi();
    txn.hSet(key, { [color]: String(next[color]) });
    const res = await txn.exec();
    if (res && res.length > 0) return next;
  }
  throw new Error('CONCURRENCY_ERROR: Conflicto al entregar el contrato. Inténtalo de nuevo.');
}

export async function getActiveLoan(
  userId: string
): Promise<{ advisorId: string; expiresAt: number } | null> {
  const raw = await redis.get(keys.userLoan(userId));
  if (!raw) return null;
  try {
    const l = JSON.parse(raw) as { advisorId: string; expiresAt: number };
    return { advisorId: l.advisorId, expiresAt: l.expiresAt };
  } catch {
    return null;
  }
}

/** Petición diaria: presta un consejero aleatorio FALTANTE por 24h. */
export async function requestDailyLoan(userId: string): Promise<Consejero> {
  await getUserProfile(userId); // asegura inicialización
  if (await getActiveLoan(userId)) {
    throw new Error('LOAN_ACTIVE: Ya tienes un préstamo activo. Vuelve cuando expire.');
  }
  const owned = await redis.hGetAll(keys.userConsejeros(userId));
  const pool = ACQUIRABLE_CONSEJEROS.filter((a) => !(a.id in owned));
  if (pool.length === 0) {
    throw new Error('NO_CANDIDATES: Ya tienes todos los consejeros disponibles.');
  }
  const prng = new PRNG(`loan_${canonicalDate()}_${userId}`);
  const pick = pool[prng.nextInt(0, pool.length - 1)];
  const expiresAt = Date.now() + LOAN_TTL_SECONDS * 1000;
  await redis.set(keys.userLoan(userId), JSON.stringify({ advisorId: pick.id, expiresAt }), {
    expiration: LOAN_TTL_SECONDS,
  });
  return { id: pick.id, name: pick.name, affinity: pick.affinity, level: 1, temporary: true, expiresAt };
}

/** Desbloqueo PERMANENTE con contrato + oro. Atómico (oro + contrato + posesión). */
export async function unlockWithContract(
  userId: string,
  advisorId: string,
  color: ContractColor
): Promise<{ advisor: Consejero; contracts: Contracts; newGold: number }> {
  const base = ACQUIRABLE_CONSEJEROS.find((a) => a.id === advisorId);
  if (!base) throw new Error('ADVISOR_NOT_FOUND: Ese consejero no se puede reclutar.');
  if (!CONTRACT_COLORS.includes(color)) throw new Error('INVALID_CONTRACT: Color de contrato inválido.');
  if (!contractMatches(color, base.affinity)) {
    throw new Error('CONTRACT_MISMATCH: El color del contrato no coincide con la afinidad del consejero.');
  }

  const userKey = keys.user(userId);
  const contractsKey = keys.userContracts(userId);
  const consejerosKey = keys.userConsejeros(userId);
  await getUserProfile(userId); // init

  for (let attempt = 0; attempt < 10; attempt++) {
    await redis.watch([userKey, contractsKey, consejerosKey]);

    const ownedLvl = await redis.hGet(consejerosKey, advisorId);
    if (ownedLvl) {
      await redis.unwatch();
      throw new Error('ALREADY_OWNED: Ya tienes este consejero.');
    }
    const contracts = await getContracts(userId);
    if (contracts[color] < 1) {
      await redis.unwatch();
      throw new Error(`NO_CONTRACT: No tienes un contrato ${color}.`);
    }
    const profile = await getUserProfile(userId);
    if (profile.gold < CONTRACT_UNLOCK_GOLD) {
      await redis.unwatch();
      throw new Error(`INSUFFICIENT_FUNDS: Necesitas ${CONTRACT_UNLOCK_GOLD} oro (tienes ${profile.gold}).`);
    }

    const newGold = profile.gold - CONTRACT_UNLOCK_GOLD;
    const txn = redis.multi();
    txn.hSet(userKey, { gold: String(newGold) });
    txn.hSet(contractsKey, { [color]: String(contracts[color] - 1) });
    txn.hSet(consejerosKey, { [advisorId]: '1' });
    const res = await txn.exec();
    if (res && res.length > 0) {
      return {
        advisor: { id: base.id, name: base.name, affinity: base.affinity, level: 1 },
        contracts: { ...contracts, [color]: contracts[color] - 1 },
        newGold,
      };
    }
  }
  throw new Error('CONCURRENCY_ERROR: Conflicto al reclutar. Inténtalo de nuevo.');
}

/** Estado consolidado para la pantalla de reclutamiento. */
export async function getRecruitmentState(userId: string): Promise<RecruitmentState> {
  const profile = await getUserProfile(userId);
  const contracts = await getContracts(userId);
  const owned = await redis.hGetAll(keys.userConsejeros(userId));
  const active = await getActiveLoan(userId);

  let loan: RecruitmentState['loan'] = null;
  if (active) {
    const b = ADVISOR_CATALOG[active.advisorId];
    if (b) loan = { advisorId: b.id, name: b.name, affinity: b.affinity, expiresAt: active.expiresAt };
  }

  const candidates: RecruitCandidate[] = ACQUIRABLE_CONSEJEROS.map((a) => ({
    id: a.id,
    name: a.name,
    affinity: a.affinity,
    owned: a.id in owned,
    onLoan: !!active && active.advisorId === a.id && !(a.id in owned),
  }));
  const poolEmpty = ACQUIRABLE_CONSEJEROS.every((a) => a.id in owned);

  return {
    gold: profile.gold,
    contracts,
    loan,
    loanAvailable: !active && !poolEmpty,
    unlockCost: CONTRACT_UNLOCK_GOLD,
    candidates,
  };
}
