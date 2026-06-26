/* ============================================================
   stepRun — motor por-turno COMPARTIDO por cliente y servidor.

   Es la ÚNICA fuente de verdad de la run: toda la aleatoriedad sale
   del PRNG sembrado y cada decisión vive en el actionLog, así que el
   servidor re-deriva exactamente las mismas stats que vio el cliente.
   La energía es DERIVADA (se recalcula aquí, no se guarda).

   Devuelve además un `TurnResult[]` que alimenta el feedback por
   acción del cliente — determinismo y feedback comparten origen.
   ============================================================ */
import { PRNG } from './prng.ts';
import {
  Affinity,
  Consejero,
  ActionLog,
  GeneralStats,
  RunSimResult,
  TurnResult,
  TurnOutcome,
} from '../types/index.ts';
import { validateActionLog } from './validate.ts';
import {
  BASE_STAT,
  MAX_STAT,
  MIN_STAT,
  ENERGY_MAX,
  TRAIN_COST,
  REST_GAIN,
  CRIT_MULT,
  bestAdvisorFor,
  baseGain,
  failChance,
  critChance,
  eventTurns,
  eventForTurn,
} from './balance.ts';

function clampStats(s: GeneralStats): void {
  s.ofe = Math.max(MIN_STAT, Math.min(MAX_STAT, s.ofe));
  s.def = Math.max(MIN_STAT, Math.min(MAX_STAT, s.def));
  s.man = Math.max(MIN_STAT, Math.min(MAX_STAT, s.man));
}

function diff(before: GeneralStats, after: GeneralStats): Partial<GeneralStats> {
  const d: Partial<GeneralStats> = {};
  if (after.ofe !== before.ofe) d.ofe = after.ofe - before.ofe;
  if (after.def !== before.def) d.def = after.def - before.def;
  if (after.man !== before.man) d.man = after.man - before.man;
  return d;
}

export function stepRun(seed: string, deck: Consejero[], actionLog: ActionLog): RunSimResult {
  const validation = validateActionLog(seed, deck, actionLog);
  if (!validation.isValid) {
    throw new Error(validation.error || 'Invalid action log or deck snapshot');
  }

  const prng = new PRNG(seed);
  const stats: GeneralStats = { ofe: BASE_STAT, def: BASE_STAT, man: BASE_STAT };
  let energy = ENERGY_MAX;
  const evtSet = eventTurns(seed);
  const turns: TurnResult[] = [];

  for (let t = 0; t < actionLog.length; t++) {
    const action = actionLog[t];
    const energyBefore = energy;
    const before: GeneralStats = { ...stats };

    // --- Turno de evento (estructura derivada del seed) ---
    if (evtSet.has(t)) {
      const ev = eventForTurn(seed, t);
      const branchIdx = action.kind === 'event' ? action.branch : 0;
      const branch = ev.branches[branchIdx];
      const outcomeText = branch.apply(stats, prng);
      clampStats(stats);
      turns.push({
        turn: t,
        kind: 'event',
        gains: diff(before, stats),
        energyBefore,
        energyAfter: energy,
        event: { id: ev.id, name: ev.name, branch: branchIdx, label: branch.label, outcomeText },
      });
      continue;
    }

    // --- Descanso ---
    if (action.kind === 'rest') {
      energy = Math.min(ENERGY_MAX, energy + REST_GAIN);
      turns.push({ turn: t, kind: 'rest', gains: {}, energyBefore, energyAfter: energy });
      continue;
    }

    // --- Entrenamiento: la apuesta (fallo / normal / crítico) ---
    const choice: Affinity = action.kind === 'train' ? action.choice : 'OFE';
    const advisor = bestAdvisorFor(deck, choice);
    const fail = failChance(energyBefore); // el riesgo depende de la energía ANTES de pagar
    const crit = critChance(advisor, choice);
    const base = baseGain(advisor, choice);
    energy = Math.max(0, energy - TRAIN_COST);

    const r = prng.nextFloat();
    let outcome: TurnOutcome;
    let gain: number;
    if (r < fail) {
      outcome = 'fail';
      gain = 0; // entrenamiento fallido: turno y energía perdidos
    } else if (r > 1 - crit) {
      outcome = 'crit';
      gain = Math.round(base * CRIT_MULT);
    } else {
      outcome = 'normal';
      gain = base;
    }

    if (choice === 'OFE') stats.ofe += gain;
    else if (choice === 'DEF') stats.def += gain;
    else stats.man += gain;
    clampStats(stats);

    turns.push({
      turn: t,
      kind: 'train',
      choice,
      outcome,
      gains: diff(before, stats),
      energyBefore,
      energyAfter: energy,
    });
  }

  return { stats, energy, turns };
}

/* ---- Preview (sólo display, NO consume el PRNG de la run) -------- */
export interface TrainPreview {
  energyCost: number;
  successPct: number; // 1 - probabilidad de fallo
  critPct: number;
  normalGain: number;
  critGain: number;
}

/** Lo que el jugador ve en una carta ANTES de comprometerse: la lectura de la apuesta. */
export function previewTurn(deck: Consejero[], choice: Affinity, energy: number): TrainPreview {
  const advisor = bestAdvisorFor(deck, choice);
  const base = baseGain(advisor, choice);
  return {
    energyCost: TRAIN_COST,
    successPct: 1 - failChance(energy),
    critPct: critChance(advisor, choice),
    normalGain: base,
    critGain: Math.round(base * CRIT_MULT),
  };
}
