/* ============================================================
   stepRun — motor por-turno COMPARTIDO por cliente y servidor.

   Es la ÚNICA fuente de verdad de la run: toda la aleatoriedad sale
   del PRNG sembrado (vía el motor de DADOS, ver dice.ts) y cada
   decisión vive en el actionLog, así que el servidor re-deriva
   exactamente las mismas stats que vio el cliente. La energía es
   DERIVADA (se recalcula aquí, no se guarda).

   Cada entrenamiento y cada rama de evento con probabilidad se
   resuelve tirando dados. Los consejeros ASIGNADOS al entrenamiento
   (action.consejeroIds) reforman el dado y acumulan "afinidad" (bond);
   al cruzar el umbral desbloquean su habilidad de combate.

   Devuelve además un `TurnResult[]` (con las caras del dado) que
   alimenta el feedback por acción del cliente — determinismo y
   feedback comparten origen.
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
  BOND_THRESHOLD,
  CONSEJERO_ABILITY,
  baseGain,
  buildTrainRoll,
  buildEventRoll,
  gainForBand,
  bondForParticipation,
  participantsBestFor,
  eventTurns,
  eventForTurn,
} from './balance.ts';
import { rollDice, rollOdds, DiceRoll, OutcomeBand } from './dice.ts';

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

function bandToOutcome(band: OutcomeBand): TurnOutcome {
  return band === 'FALLO' ? 'fail' : band === 'CRITICO' ? 'crit' : 'normal';
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
  const deckById = new Map(deck.map((c) => [c.id, c]));
  const bond: Record<string, number> = {};
  for (const c of deck) bond[c.id] = 0;

  for (let t = 0; t < actionLog.length; t++) {
    const action = actionLog[t];
    const energyBefore = energy;
    const before: GeneralStats = { ...stats };

    // --- Turno de evento (estructura derivada del seed) ---
    if (evtSet.has(t)) {
      const ev = eventForTurn(seed, t);
      const branchIdx = action.kind === 'event' ? action.branch : 0;
      const branch = ev.branches[branchIdx];
      let success = true;
      let dice: TurnResult['dice'];
      if (branch.successProb > 0 && branch.successProb < 1) {
        const outcome = rollDice(prng, buildEventRoll(branch.successProb));
        success = outcome.band === 'CRITICO';
        dice = { faces: outcome.faces, keptFace: outcome.keptFace, band: outcome.band, roll: outcome.roll };
      }
      const outcomeText = branch.apply(stats, success, prng);
      clampStats(stats);
      turns.push({
        turn: t,
        kind: 'event',
        gains: diff(before, stats),
        energyBefore,
        energyAfter: energy,
        event: { id: ev.id, name: ev.name, branch: branchIdx, label: branch.label, outcomeText },
        dice,
      });
      continue;
    }

    // --- Descanso (determinista, no tira dado) ---
    if (action.kind === 'rest') {
      energy = Math.min(ENERGY_MAX, energy + REST_GAIN);
      turns.push({ turn: t, kind: 'rest', gains: {}, energyBefore, energyAfter: energy });
      continue;
    }

    // --- Entrenamiento: la apuesta se resuelve con DADOS ---
    const choice: Affinity = action.kind === 'train' ? action.choice : 'OFE';
    const ids = action.kind === 'train' ? action.consejeroIds : [];
    const participants = ids
      .map((id) => deckById.get(id))
      .filter((c): c is Consejero => !!c);

    const roll = buildTrainRoll(participants, choice, energyBefore); // el riesgo usa la energía ANTES de pagar
    energy = Math.max(0, energy - TRAIN_COST);
    const outcome = rollDice(prng, roll);
    const base = baseGain(participantsBestFor(participants, choice), choice);
    const gain = gainForBand(outcome.band, base);

    if (choice === 'OFE') stats.ofe += gain;
    else if (choice === 'DEF') stats.def += gain;
    else stats.man += gain;
    clampStats(stats);

    // Bond ("afinidad") por cada consejero que participó.
    const bondDeltas: Record<string, number> = {};
    for (const c of participants) {
      const d = bondForParticipation(c, choice);
      bond[c.id] = (bond[c.id] ?? 0) + d;
      bondDeltas[c.id] = (bondDeltas[c.id] ?? 0) + d;
    }

    turns.push({
      turn: t,
      kind: 'train',
      choice,
      outcome: bandToOutcome(outcome.band),
      gains: diff(before, stats),
      energyBefore,
      energyAfter: energy,
      dice: { faces: outcome.faces, keptFace: outcome.keptFace, band: outcome.band, roll: outcome.roll },
      bondDeltas,
    });
  }

  const unlockedAbilities = Array.from(
    new Set(
      Object.entries(bond)
        .filter(([, v]) => v >= BOND_THRESHOLD)
        .map(([id]) => CONSEJERO_ABILITY[id])
        .filter((name): name is string => !!name)
    )
  );

  return { stats, energy, turns, bond, unlockedAbilities };
}

/* ---- Preview (sólo display, NO consume el PRNG de la run) -------- */
export interface TrainPreview {
  energyCost: number;
  successPct: number; // 1 - probabilidad de fallo
  critPct: number;
  failPct: number;
  normalGain: number;
  critGain: number;
  roll: DiceRoll; // spec efectivo del dado para dibujarlo
}

/** Lo que el jugador ve en una carta ANTES de comprometerse: la lectura de la apuesta. */
export function previewTurn(
  deck: Consejero[],
  choice: Affinity,
  energy: number,
  consejeroIds: string[] = []
): TrainPreview {
  const participants = consejeroIds
    .map((id) => deck.find((c) => c.id === id))
    .filter((c): c is Consejero => !!c);
  const roll = buildTrainRoll(participants, choice, energy);
  const odds = rollOdds(roll);
  const base = baseGain(participantsBestFor(participants, choice), choice);
  return {
    energyCost: TRAIN_COST,
    successPct: 1 - odds.failPct,
    critPct: odds.critPct,
    failPct: odds.failPct,
    normalGain: gainForBand('NORMAL', base),
    critGain: gainForBand('CRITICO', base),
    roll,
  };
}
