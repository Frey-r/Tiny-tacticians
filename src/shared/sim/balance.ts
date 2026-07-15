import { GeneralStats, Consejero, Affinity, General } from '../types/index.ts';
import { PRNG } from './prng.ts';
import {
  DiceRoll,
  OutcomeBand,
  baseRoll,
  restrictRange,
  shiftThresholds,
  addDice,
} from './dice.ts';
import { consejeroDef, RUN_EFFECTS, RunEffectId } from './consejeroCatalog.ts';

/** Versión de simulación. Bump rompe actionLogs/replays previos (ver decisions/0012). */
export const SIM_VERSION = 4;

export const BASE_STAT = 10;
export const MAX_STAT = 100;
export const MIN_STAT = 1;
export const RUN_TURNS = 16;
export const LOADOUT_SIZE = 3; // consejeros exactos que componen el loadout de una run
export const MATCHMAKING_POWER_BAND = 15; // standard [P - 15, P + 15]

/* ---- Economía de energía (ahora REAL, parte de la simulación) ---- */
export const ENERGY_MAX = 100;
export const TRAIN_COST = 12; // energía que cuesta un entrenamiento
export const REST_GAIN = 45; // energía que recupera un descanso (consume el turno)

/* ---- Riesgo: fallo / crítico ------------------------------------- */
/** Por encima de este nivel de energía el riesgo de fallo es mínimo. */
export const SAFE_ENERGY = 55;
export const CRIT_MULT = 1.5; // multiplicador de ganancia en crítico
export const EVENT_COUNT = 3; // turnos de evento por run

/* ---- Ánimo (moral): variable de simulación que REFORMA el dado --------
   Vive en stepRun (determinista, como la energía). NO multiplica la
   ganancia: desplaza los umbrales del d6 (alto → menos fallo / más
   crítico; bajo → más fallo). Como shiftThresholds no consume PRNG, la
   secuencia de caras no cambia: solo qué banda le toca a cada cara. */
export const MOOD_START = 1.0;
export const MOOD_MIN = 0.5;
export const MOOD_MAX = 1.5;
export const MOOD_CRIT = 0.1; // entrenamiento crítico sube el ánimo
export const MOOD_FAIL = -0.15; // entrenamiento fallido lo baja
export const MOOD_REST = 0.05; // descansar lo recupera un poco
export const MOOD_EVENT = 0.1; // resultado de evento (±)
export const MOOD_ENCOUNTER_LOSS = -0.5; // perder un encuentro lo DESPLOMA
export const MOOD_ENCOUNTER_WIN = 0.1; // ganar un encuentro lo sube

export type MoodEvent =
  | 'crit'
  | 'fail'
  | 'rest'
  | 'eventPos'
  | 'eventNeg'
  | 'encounterLoss'
  | 'encounterWin';

const MOOD_DELTA: Record<MoodEvent, number> = {
  crit: MOOD_CRIT,
  fail: MOOD_FAIL,
  rest: MOOD_REST,
  eventPos: MOOD_EVENT,
  eventNeg: -MOOD_EVENT,
  encounterLoss: MOOD_ENCOUNTER_LOSS,
  encounterWin: MOOD_ENCOUNTER_WIN,
};

/** Aplica el delta de ánimo del evento dado y acota a [MOOD_MIN, MOOD_MAX]. */
export function nextMood(mood: number, event: MoodEvent): number {
  return Math.max(MOOD_MIN, Math.min(MOOD_MAX, mood + MOOD_DELTA[event]));
}

/**
 * El ánimo reforma el d6 (deltas enteros de umbral, neutro en 1.0):
 * alto → baja failMax y/o critMin (menos fallo, más crítico);
 * bajo → sube failMax (más fallo). Se pliega en planTrainTurn.
 */
export function moodDiceShift(mood: number): { failMaxDelta: number; critMinDelta: number } {
  if (mood >= 1.3) return { failMaxDelta: -1, critMinDelta: -1 };
  if (mood >= 1.1) return { failMaxDelta: 0, critMinDelta: -1 };
  if (mood >= 0.9) return { failMaxDelta: 0, critMinDelta: 0 };
  if (mood >= 0.7) return { failMaxDelta: 1, critMinDelta: 0 };
  return { failMaxDelta: 2, critMinDelta: 0 };
}

/* ---- Dados: umbrales base del d6 (tunables) ---------------------- */
// Por defecto: cara 1 = FALLO, caras 2..5 = NORMAL, cara 6 = CRÍTICO.
export const BASE_FAIL_MAX = 1;
export const BASE_CRIT_MIN = 6;

/* ---- Afinidad / vínculo de consejero (bond), por-run ------------- */
export const BOND_PER_TRAIN = 1; // por cada consejero que participa
export const BOND_AFFINITY_BONUS = 2; // extra si su afinidad coincide con la stat
export const BOND_THRESHOLD = 6; // cruzarlo desbloquea la habilidad de combate
export const CONSEJERO_PROC_FACES = 1 / 6; // probabilidad de proc en combate

/** id de consejero -> nombre de su habilidad desbloqueable (fuente: catálogo). */
export { CONSEJERO_ABILITY } from './consejeroCatalog.ts';

/* ---- Activación aleatoria de consejeros por turno (ver decisions/0012) ----
   Los consejeros del loadout YA NO se asignan a mano: cada turno de
   entrenamiento se activan al azar con una probabilidad que sube de forma
   lineal a lo largo de la run, sesgada por consejero. Determinista: sale de
   un PRNG DERIVADO (`seed:act:<turno>`), así no consume el stream del dado y
   cliente/servidor/validación coinciden. */
export const ACTIVATION_MIN = 0.05;
export const ACTIVATION_MAX = 0.75;

/** Rampa base por progreso de la run (turno 0 → 5%, último turno → 75%). */
export function activationRamp(turn: number): number {
  if (RUN_TURNS <= 1) return ACTIVATION_MAX;
  const t = Math.max(0, Math.min(1, turn / (RUN_TURNS - 1)));
  return ACTIVATION_MIN + (ACTIVATION_MAX - ACTIVATION_MIN) * t;
}

/** Probabilidad de activación de UN consejero este turno (rampa + sesgo, acotada). */
export function activationChance(c: Consejero, turn: number): number {
  return Math.max(0.05, Math.min(0.95, activationRamp(turn) + consejeroDef(c.id).activationBias));
}

/** Subconjunto del deck que está ACTIVO este turno (0..deck.length). Determinista. */
export function activeAdvisorsForTurn(seed: string, deck: Consejero[], turn: number): Consejero[] {
  const p = new PRNG(`${seed}:act:${turn}`);
  // Una tirada por consejero en orden estable del deck → reproducible.
  return deck.filter((c) => p.nextFloat() < activationChance(c, turn));
}

/** Stat secundaria que regala el arquetipo Intendente / efecto Botín en éxito. */
export function secondaryStatFor(choice: Affinity): keyof GeneralStats {
  return choice === 'MAN' ? 'def' : 'man';
}

export function calculatePower(stats: GeneralStats): number {
  return Math.floor(stats.ofe * 1.0 + stats.def * 1.0 + stats.man * 1.2);
}

export function calculateTier(power: number): number {
  if (power < 80) return 1;
  if (power < 140) return 2;
  if (power < 200) return 3;
  if (power < 260) return 4;
  return 5;
}

/** Mejor consejero del deck para la afinidad pedida (match de afinidad > nivel). */
export function bestAdvisorFor(deck: Consejero[], choice: Affinity): Consejero {
  const matches = deck.filter((a) => a.affinity === choice);
  const candidates = matches.length ? matches : deck;
  return candidates.reduce((best, a) => (a.level > best.level ? a : best), candidates[0]);
}

/** Ganancia base de un entrenamiento (parte determinista, sin outcome).
 *  Presupuesto: con 13 turnos entrenables, el techo (crítico + afín nivel 10 = 15)
 *  debe permitir maximizar 2 stats y dejar la 3ª a ~mitad, nunca las 3. */
export function baseGain(advisor: Consejero, choice: Affinity): number {
  return 3 + (advisor.affinity === choice ? 2 : 0) + Math.ceil(advisor.level / 2);
}

/** Probabilidad de FALLO en función de la energía ANTES de entrenar. */
export function failChance(energy: number): number {
  if (energy >= SAFE_ENERGY) return 0.03;
  return 0.03 + ((SAFE_ENERGY - energy) / SAFE_ENERGY) * 0.55; // hasta ~0.58 con 0 energía
}

/** Probabilidad de CRÍTICO (depende del asesor, no de la energía). */
export function critChance(advisor: Consejero, choice: Affinity): number {
  const raw = 0.08 + (advisor.affinity === choice ? 0.12 : 0) + advisor.level * 0.015;
  return Math.max(0.05, Math.min(0.45, raw));
}

/* ============================================================
   Resolución por DADOS (reemplaza el modelo continuo en stepRun).
   Ver dice.ts y decisions/0011. Los modificadores reforman el dado.
   ============================================================ */

/** Mejor consejero ASIGNADO para alimentar la ganancia base; sintético si no hay ninguno. */
export function participantsBestFor(participants: Consejero[], choice: Affinity): Consejero {
  const matches = participants.filter((a) => a.affinity === choice);
  const candidates = matches.length ? matches : participants;
  if (candidates.length === 0) {
    // Entrenamiento sin asistencia: asesor sintético nivel 0 SIN afinidad (base mínima = 5).
    return { id: '', name: '(no advisor)', affinity: choice === 'OFE' ? 'DEF' : 'OFE', level: 0 };
  }
  return candidates.reduce((best, a) => (a.level > best.level ? a : best), candidates[0]);
}

/* ---- Arquetipos de entrenamiento: cada estilo reforma el dado distinto ----
   - maestro    polariza: +crítico y +fallo (alto riesgo / "closer").
   - alquimista estabiliza: casi nunca falla pero BLOQUEA el crítico (cara máx).
   - intendente eficiencia: dado casi neutro; reembolsa energía + stat secundaria. */
export interface TrainMod {
  raiseFloor: number; // sube el piso del rango (descarta caras bajas → menos FALLO)
  critDown: number; // baja critMin (CRÍTICO más probable)
  failUp: number; // sube failMax (FALLO más probable; <0 lo baja)
  capTop: boolean; // bloquea la cara máxima (limita el CRÍTICO)
  extraDie: boolean; // dado de ventaja (keep-best)
  energyRefund: number; // energía devuelta este turno
  secondaryGain: number; // +stat secundaria en éxito
}

const ZERO_MOD: TrainMod = {
  raiseFloor: 0,
  critDown: 0,
  failUp: 0,
  capTop: false,
  extraDie: false,
  energyRefund: 0,
  secondaryGain: 0,
};

/** Contribución de UN consejero a la tirada, según su arquetipo. Off-afinidad no reforma. */
export function consejeroTrainMod(c: Consejero, choice: Affinity): TrainMod {
  if (c.affinity !== choice) return ZERO_MOD;
  const level = c.level;
  switch (consejeroDef(c.id).trainStyle) {
    case 'maestro':
      return {
        raiseFloor: 0,
        critDown: 1 + (level >= 5 ? 1 : 0) + (level >= 9 ? 1 : 0),
        failUp: 1,
        capTop: false,
        extraDie: level >= 8,
        energyRefund: 0,
        secondaryGain: 0,
      };
    case 'alquimista':
      return {
        raiseFloor: Math.min(4, 1 + Math.floor(level / 3)),
        critDown: 0,
        failUp: -1,
        capTop: true,
        extraDie: false,
        energyRefund: 0,
        secondaryGain: 0,
      };
    case 'intendente':
    default:
      return {
        raiseFloor: Math.min(4, 1 + Math.floor(level / 4)),
        critDown: level >= 6 ? 1 : 0,
        failUp: 0,
        capTop: false,
        extraDie: false,
        energyRefund: 4 + Math.floor(level / 2),
        secondaryGain: 1 + Math.floor(level / 6),
      };
  }
}

/** Energía baja sube failMax (más caras pasan a FALLO). Entero 0..2. */
export function energyFailShift(energy: number): number {
  if (energy >= SAFE_ENERGY) return 0;
  const t = (SAFE_ENERGY - Math.max(0, energy)) / SAFE_ENERGY; // 0..1
  return Math.max(0, Math.min(2, Math.round(t * 2.5)));
}

/** Plan completo de un turno de entrenamiento: dado + efectos plegados (energía/secundaria/bond). */
export interface TrainTurnPlan {
  roll: DiceRoll;
  energyRefund: number;
  secondaryGain: number;
  bondBonus: Record<string, number>;
  procs: { id: string; effectId: RunEffectId; label: string }[];
}

/** Arma el turno desde los consejeros ACTIVOS: arquetipos reforman el dado, efectos de run se pliegan.
 *  `mood` (ánimo) también reforma el dado vía moodDiceShift; default 1.0 = neutro (preview/legacy). */
export function planTrainTurn(
  participants: Consejero[],
  choice: Affinity,
  energy: number,
  mood = 1.0
): TrainTurnPlan {
  let totalFloor = 0;
  let totalCritDown = 0;
  let totalFailUp = 0;
  let capTop = false;
  let extra = 0;
  let energyRefund = 0;
  let secondaryGain = 0;
  let reFailDelta = 0;
  let reCritDelta = 0;
  const bondBonus: Record<string, number> = {};
  const procs: TrainTurnPlan['procs'] = [];

  for (const c of participants) {
    const m = consejeroTrainMod(c, choice);
    totalFloor += m.raiseFloor;
    totalCritDown += m.critDown;
    totalFailUp += m.failUp;
    if (m.capTop) capTop = true;
    if (m.extraDie) extra += 1;
    energyRefund += m.energyRefund;
    secondaryGain += m.secondaryGain;

    // Efecto de run del consejero (el diferenciador "qué detona en la run").
    const effId = consejeroDef(c.id).runEffectId;
    if (effId) {
      const e = RUN_EFFECTS[effId];
      reFailDelta += e.failMaxDelta ?? 0;
      reCritDelta += e.critMinDelta ?? 0;
      energyRefund += e.energyRefund ?? 0;
      secondaryGain += e.secondaryGain ?? 0;
      if (e.bondBonus) bondBonus[c.id] = (bondBonus[c.id] ?? 0) + e.bondBonus;
      procs.push({ id: c.id, effectId: effId, label: e.label });
    }
  }
  totalFloor = Math.min(4, totalFloor); // nunca colapsa el dado por debajo de 2 caras

  let roll = baseRoll({ failMax: BASE_FAIL_MAX, critMin: BASE_CRIT_MIN });
  if (totalFloor > 0) roll = restrictRange(roll, 1 + totalFloor, 6);
  if (capTop) roll = restrictRange(roll, 1, 5); // bloquea la cara 6 (limita CRÍTICO)
  const ms = moodDiceShift(mood);
  const dFailMax = energyFailShift(energy) + totalFailUp + reFailDelta + ms.failMaxDelta;
  const dCritMin = -totalCritDown + reCritDelta + ms.critMinDelta;
  roll = shiftThresholds(roll, dFailMax, dCritMin);
  if (extra > 0) roll = addDice(roll, extra, 'best');

  return { roll, energyRefund, secondaryGain, bondBonus, procs };
}

/** Tirada de una rama de evento con probabilidad: éxito = banda CRÍTICO. */
export function buildEventRoll(successProb: number): DiceRoll {
  const critFaces = Math.max(1, Math.min(6, Math.round(successProb * 6)));
  return baseRoll({ failMax: 0, critMin: 7 - critFaces });
}

/** Tirada de un proc de habilidad de combate: proc = banda CRÍTICO. */
export function buildAbilityRoll(procChance: number): DiceRoll {
  const critFaces = Math.max(1, Math.min(6, Math.round(procChance * 6)));
  return baseRoll({ failMax: 0, critMin: 7 - critFaces });
}

/** Ganancia de un entrenamiento según la banda resultante. */
export function gainForBand(band: OutcomeBand, base: number): number {
  if (band === 'FALLO') return 0;
  if (band === 'CRITICO') return Math.round(base * CRIT_MULT);
  return base;
}

/** Bond ("afinidad") que gana un consejero por participar en un entrenamiento. */
export function bondForParticipation(c: Consejero, choice: Affinity): number {
  return BOND_PER_TRAIN + (c.affinity === choice ? BOND_AFFINITY_BONUS : 0);
}

export interface AbilityThreshold {
  name: string;
  stat: keyof GeneralStats;
  threshold: number;
}

export const ABILITY_THRESHOLDS: AbilityThreshold[] = [
  { name: 'Battle Fury', stat: 'ofe', threshold: 30 },
  { name: 'Devastating Charge', stat: 'ofe', threshold: 60 },
  { name: 'Iron Bulwark', stat: 'def', threshold: 30 },
  { name: 'Unbreakable Shield', stat: 'def', threshold: 60 },
  { name: 'Resolute Strategist', stat: 'man', threshold: 30 },
  { name: 'Command Shout', stat: 'man', threshold: 60 },
];

export function deriveAbilities(stats: GeneralStats): string[] {
  const abilities: string[] = [];
  for (const ab of ABILITY_THRESHOLDS) {
    if (stats[ab.stat] >= ab.threshold) {
      abilities.push(ab.name);
    }
  }
  return abilities;
}

/* ============================================================
   Eventos ramificados — dilemas con elección (apuesta vs seguro).
   La rama elegida se guarda en el actionLog; el resultado aleatorio
   sale del PRNG principal de la run (determinista y reproducible).
   ============================================================ */
export interface EventBranch {
  label: string;
  /** Probabilidad de éxito de la apuesta; 0 = rama segura/determinista (no tira dado). */
  successProb: number;
  /** Aplica el resultado dado `success`. Puede usar el PRNG para sub-elecciones (p. ej. qué stat). */
  apply: (stats: GeneralStats, success: boolean, prng: PRNG) => string;
}

export interface BranchingEvent {
  id: string;
  name: string;
  description: string;
  branches: [EventBranch, EventBranch];
}

export const BRANCHING_EVENTS: BranchingEvent[] = [
  {
    id: 'storm',
    name: 'Storm on the Field',
    description: 'A storm rolls over the camp. Do you train in the rain or take shelter?',
    branches: [
      {
        label: 'Train anyway (50%)',
        successProb: 0.5,
        apply: (s, success) => {
          if (success) {
            s.man += 8;
            return 'The recruits rise to the challenge! +8 Command.';
          }
          s.ofe -= 3;
          s.def -= 3;
          s.man -= 3;
          return 'The mud and cold take their toll. -3 to all.';
        },
      },
      {
        label: 'Take shelter (safe)',
        successProb: 0,
        apply: (s) => {
          s.def += 2;
          return 'You reinforce the tents and palisades. +2 Defense.';
        },
      },
    ],
  },
  {
    id: 'merchant',
    name: 'Wandering Merchant',
    description: 'A merchant offers a relic of dubious origin at a good price.',
    branches: [
      {
        label: 'Buy the relic (50%)',
        successProb: 0.5,
        apply: (s, success, p) => {
          if (success) {
            const k = (['ofe', 'def', 'man'] as const)[p.nextInt(0, 2)];
            s[k] += 7;
            return `A genuine relic! +7 ${k.toUpperCase()}.`;
          }
          return 'It was a worthless trinket. No harm done.';
        },
      },
      {
        label: 'Haggle for scrap (safe)',
        successProb: 0,
        apply: (s) => {
          s.ofe += 2;
          return 'You buy some used weapons. +2 Offense.';
        },
      },
    ],
  },
  {
    id: 'duel',
    name: 'Duel of Honor',
    description: 'A rival officer challenges your general to a duel to first blood.',
    branches: [
      {
        label: 'Accept the duel (60%)',
        successProb: 0.6,
        apply: (s, success) => {
          if (success) {
            s.ofe += 7;
            return 'A glorious victory before the troops! +7 Offense.';
          }
          s.def -= 4;
          return 'A humiliating wound. -4 Defense.';
        },
      },
      {
        label: 'Decline with honor (safe)',
        successProb: 0,
        apply: (s) => {
          s.man += 3;
          return 'You keep discipline and respect. +3 Command.';
        },
      },
    ],
  },
  {
    id: 'supplies',
    name: 'Supply Convoy',
    description: 'A loaded convoy arrives. A feast for morale, or measured rations?',
    branches: [
      {
        label: 'Feast (55%)',
        successProb: 0.55,
        apply: (s, success) => {
          if (success) {
            s.ofe += 4;
            s.def += 4;
            return 'Morale soars! +4 Offense and +4 Defense.';
          }
          s.man -= 3;
          return 'Excess and a hangover in the barracks. -3 Command.';
        },
      },
      {
        label: 'Measured rations (safe)',
        successProb: 0,
        apply: (s) => {
          s.ofe += 2;
          s.def += 2;
          return 'Dietary discipline. +2 Offense and +2 Defense.';
        },
      },
    ],
  },
  {
    id: 'veteran',
    name: 'War Veteran',
    description: 'An old veteran offers to teach a secret tactic... his own way.',
    branches: [
      {
        label: 'Brutal training (50%)',
        successProb: 0.5,
        apply: (s, success) => {
          if (success) {
            s.man += 6;
            s.def += 2;
            return 'A masterful lesson! +6 Command and +2 Defense.';
          }
          s.ofe -= 2;
          s.def -= 2;
          return 'The method leaves scars. -2 Offense and -2 Defense.';
        },
      },
      {
        label: 'Friendly chat (safe)',
        successProb: 0,
        apply: (s) => {
          s.man += 3;
          return 'Wise counsel by the fire. +3 Command.';
        },
      },
    ],
  },
];

/**
 * Conjunto determinista de turnos que son EVENTOS para una run (independiente
 * del stream PRNG principal: usa un PRNG derivado, así cliente/servidor/validación
 * coinciden sin consumir la aleatoriedad de la simulación).
 */
export function eventTurns(seed: string): Set<number> {
  const p = new PRNG(seed + ':evt');
  const candidates: number[] = [];
  for (let t = 2; t < RUN_TURNS - 1; t++) candidates.push(t);
  const picked = new Set<number>();
  while (picked.size < EVENT_COUNT && candidates.length) {
    const i = p.nextInt(0, candidates.length - 1);
    picked.add(candidates.splice(i, 1)[0]);
  }
  return picked;
}

export function isEventTurn(seed: string, turn: number): boolean {
  return eventTurns(seed).has(turn);
}

/** Evento concreto que aparece en un turno de evento dado (determinista). */
export function eventForTurn(seed: string, turn: number): BranchingEvent {
  const p = new PRNG(`${seed}:evtpick:${turn}`);
  return BRANCHING_EVENTS[p.nextInt(0, BRANCHING_EVENTS.length - 1)];
}

/* ============================================================
   Encuentros de combate — checkpoints deterministas de la run.
   NO son turnos del actionLog: se resuelven en fronteras fijas
   (tras procesar ciertos turnos) comparando las stats ACTUALES
   contra un enemigo equilibrado. El último es un JEFE de BOSS_POWER
   de poder; derrotarlo otorga el bono final de +10 a todo. La
   aleatoriedad del combate sale de un PRNG DERIVADO
   (`seed:enc:<frontera>`), así el stream principal no se altera.
   ============================================================ */
export const ENCOUNTER_COUNT = 4;
export const BOSS_POWER = 110;
export const ENCOUNTER_POWERS = [45, 70, 90, BOSS_POWER];
export const ENCOUNTER_AFTER_TURNS = [3, 7, 11, RUN_TURNS - 1];
export const ENCOUNTER_BONUS = 10; // +stat a TODO al derrotar al jefe

const ENCOUNTER_NAMES = ['Partida de Saqueadores', 'Compañía Mercenaria', 'Vanguardia Enemiga'];
const BOSS_NAME = 'Señor de la Guerra';

export interface EncounterDef {
  index: number;
  afterTurn: number; // se resuelve TRAS procesar este turno (0-based)
  isBoss: boolean;
  power: number;
  name: string;
}

/** Los 4 encuentros de una run (posiciones/poderes fijos; el último es el jefe). */
export function encounterDefs(): EncounterDef[] {
  return ENCOUNTER_AFTER_TURNS.map((afterTurn, index) => {
    const isBoss = index === ENCOUNTER_COUNT - 1;
    return {
      index,
      afterTurn,
      isBoss,
      power: ENCOUNTER_POWERS[index],
      name: isBoss ? BOSS_NAME : (ENCOUNTER_NAMES[index] ?? `Encuentro ${index + 1}`),
    };
  });
}

/** El encuentro que dispara TRAS procesar `turn`, si lo hay. */
export function encounterAfterTurn(turn: number): EncounterDef | undefined {
  return encounterDefs().find((e) => e.afterTurn === turn);
}

/** Reparto casi uniforme de stats tal que `calculatePower(stats) === target`. */
export function balancedStatsForPower(target: number): GeneralStats {
  const man = Math.round(target / 3.2); // man pesa x1.2 en el poder
  const rest = target - Math.floor(man * 1.2); // puntos restantes para ofe + def
  const ofe = Math.ceil(rest / 2);
  const def = rest - ofe;
  return { ofe, def, man };
}

/** Enemigo de un encuentro: stats equilibradas + habilidades por umbral. Sin RNG. */
export function makeEnemyGeneral(seed: string, def: EncounterDef): General {
  const stats = balancedStatsForPower(def.power);
  return {
    id: `enemy_enc${def.index}`,
    ownerId: '',
    name: def.name,
    stats,
    power: calculatePower(stats),
    tier: calculateTier(def.power),
    abilities: deriveAbilities(stats),
    seed: `${seed}:enc:${def.afterTurn}`,
    schemaVersion: SIM_VERSION,
    createdAt: 0,
  };
}

/** Suma el bono +10 a todas las stats si se derrotó al jefe; clamp a MAX_STAT. */
export function applyEncounterBonus(stats: GeneralStats, bonusEarned: boolean): GeneralStats {
  if (!bonusEarned) return { ...stats };
  return {
    ofe: Math.min(MAX_STAT, stats.ofe + ENCOUNTER_BONUS),
    def: Math.min(MAX_STAT, stats.def + ENCOUNTER_BONUS),
    man: Math.min(MAX_STAT, stats.man + ENCOUNTER_BONUS),
  };
}
