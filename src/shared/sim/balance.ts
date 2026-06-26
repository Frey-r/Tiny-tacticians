import { GeneralStats, Consejero, Affinity } from '../types/index.ts';
import { PRNG } from './prng.ts';

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
export const CRIT_MULT = 1.8; // multiplicador de ganancia en crítico
export const EVENT_COUNT = 3; // turnos de evento por run

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

/** Ganancia base de un entrenamiento (parte determinista, sin outcome). */
export function baseGain(advisor: Consejero, choice: Affinity): number {
  return 5 + (advisor.affinity === choice ? 3 : 0) + advisor.level;
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

export interface AbilityThreshold {
  name: string;
  stat: keyof GeneralStats;
  threshold: number;
}

export const ABILITY_THRESHOLDS: AbilityThreshold[] = [
  { name: 'Furia de Combate', stat: 'ofe', threshold: 30 },
  { name: 'Carga Devastadora', stat: 'ofe', threshold: 60 },
  { name: 'Baluarte Férreo', stat: 'def', threshold: 30 },
  { name: 'Escudo Inquebrantable', stat: 'def', threshold: 60 },
  { name: 'Estratega Decidido', stat: 'man', threshold: 30 },
  { name: 'Grito de Mando', stat: 'man', threshold: 60 },
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
  /** Muta `stats` y devuelve el texto del resultado. Puede usar el PRNG de la run. */
  apply: (stats: GeneralStats, prng: PRNG) => string;
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
    name: 'Tormenta en el campo',
    description: 'Una tormenta cae sobre el campamento. ¿Entrenas bajo la lluvia o te refugias?',
    branches: [
      {
        label: 'Entrenar igual (50%)',
        apply: (s, p) => {
          if (p.nextFloat() < 0.5) {
            s.man += 8;
            return '¡Los reclutas se crecen ante la adversidad! +8 Mando.';
          }
          s.ofe -= 3;
          s.def -= 3;
          s.man -= 3;
          return 'El barro y el frío pasan factura. -3 a todo.';
        },
      },
      {
        label: 'Refugiarse (seguro)',
        apply: (s) => {
          s.def += 2;
          return 'Reforzáis las tiendas y empalizadas. +2 Defensiva.';
        },
      },
    ],
  },
  {
    id: 'merchant',
    name: 'Mercader errante',
    description: 'Un mercader ofrece una reliquia de dudoso origen a buen precio.',
    branches: [
      {
        label: 'Comprar la reliquia (50%)',
        apply: (s, p) => {
          if (p.nextFloat() < 0.5) {
            const k = (['ofe', 'def', 'man'] as const)[p.nextInt(0, 2)];
            s[k] += 7;
            return `¡Reliquia auténtica! +7 ${k.toUpperCase()}.`;
          }
          return 'Era una baratija sin valor. No pasa nada.';
        },
      },
      {
        label: 'Regatear chatarra (seguro)',
        apply: (s) => {
          s.ofe += 2;
          return 'Compras algunas armas usadas. +2 Ofensiva.';
        },
      },
    ],
  },
  {
    id: 'duel',
    name: 'Duelo de honor',
    description: 'Un oficial rival reta a tu general a un duelo a primera sangre.',
    branches: [
      {
        label: 'Aceptar el duelo (60%)',
        apply: (s, p) => {
          if (p.nextFloat() < 0.6) {
            s.ofe += 7;
            return '¡Victoria gloriosa ante la tropa! +7 Ofensiva.';
          }
          s.def -= 4;
          return 'Una herida humillante. -4 Defensiva.';
        },
      },
      {
        label: 'Declinar con honor (seguro)',
        apply: (s) => {
          s.man += 3;
          return 'Mantienes la disciplina y el respeto. +3 Mando.';
        },
      },
    ],
  },
  {
    id: 'supplies',
    name: 'Convoy de suministros',
    description: 'Llega un convoy cargado. ¿Banquete para la moral o raciones medidas?',
    branches: [
      {
        label: 'Banquete (55%)',
        apply: (s, p) => {
          if (p.nextFloat() < 0.55) {
            s.ofe += 4;
            s.def += 4;
            return '¡La moral se dispara! +4 Ofensiva y +4 Defensiva.';
          }
          s.man -= 3;
          return 'Exceso y resaca en el cuartel. -3 Mando.';
        },
      },
      {
        label: 'Raciones medidas (seguro)',
        apply: (s) => {
          s.ofe += 2;
          s.def += 2;
          return 'Disciplina alimentaria. +2 Ofensiva y +2 Defensiva.';
        },
      },
    ],
  },
  {
    id: 'veteran',
    name: 'Veterano de guerra',
    description: 'Un viejo veterano ofrece enseñar una táctica secreta... a su manera.',
    branches: [
      {
        label: 'Entrenamiento brutal (50%)',
        apply: (s, p) => {
          if (p.nextFloat() < 0.5) {
            s.man += 6;
            s.def += 2;
            return '¡Lección magistral! +6 Mando y +2 Defensiva.';
          }
          s.ofe -= 2;
          s.def -= 2;
          return 'El método deja secuelas. -2 Ofensiva y -2 Defensiva.';
        },
      },
      {
        label: 'Charla amistosa (seguro)',
        apply: (s) => {
          s.man += 3;
          return 'Sabios consejos junto al fuego. +3 Mando.';
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
