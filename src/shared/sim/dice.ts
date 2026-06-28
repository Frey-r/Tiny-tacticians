/* ============================================================
   dice.ts — motor de dados DETERMINISTA compartido.

   Toda tirada sale del PRNG sembrado (NUNCA Math.random/Date.now).
   Reglas clave (ver decisions/0011 y specs/dice-resolution):
   - Dado base = 1d6. UNA cara física = EXACTAMENTE una llamada a
     prng.nextInt(1,6).
   - Un dado puede restringir sus caras a un subconjunto de 1..6
     (`allowed`). La restricción NO consume PRNG extra: solo cambia
     cómo se interpreta la cara cruda -> evita desincronizar
     cliente/servidor.
   - Multi-dado: combine 'best' (ventaja) / 'worst' (desventaja); la
     cara combinada se mantiene en 1..6, así los umbrales no dependen
     del número de dados.
   - Bandas por umbral: cara<=failMax FALLO; cara>=critMin CRITICO;
     intermedio NORMAL.
   Los modificadores son transformaciones puras DiceRoll -> DiceRoll.
   ============================================================ */
import { PRNG } from './prng.ts';

export type Face = 1 | 2 | 3 | 4 | 5 | 6;
export type OutcomeBand = 'FALLO' | 'NORMAL' | 'CRITICO';

/** Un dado: caras posibles como subconjunto ordenado y único de 1..6 (len>=1). */
export interface DieSpec {
  allowed: Face[];
}

/** Umbrales sobre la cara resultante. Invariante: 0<=failMax<critMin<=7. */
export interface Thresholds {
  failMax: number; // cara <= failMax -> FALLO  (0 = sin banda de fallo)
  critMin: number; // cara >= critMin -> CRITICO (7 = sin banda de crítico)
}

/** Cómo se combinan varios dados en la cara final que se compara con los umbrales. */
export type CombineMode = 'best' | 'worst';

/** Petición de tirada: dados (cada uno con sus caras), combinación y umbrales. */
export interface DiceRoll {
  dice: DieSpec[]; // len>=1
  combine: CombineMode; // ignorado si dice.length === 1
  thresholds: Thresholds;
}

/** Resultado de una tirada: lo que la UI necesita para animar y explicar. */
export interface DiceOutcome {
  faces: Face[]; // caras reales por dado, en orden
  keptFace: Face; // cara seleccionada por `combine` y comparada con los umbrales
  band: OutcomeBand;
  roll: DiceRoll; // eco del spec efectivo (post-modificadores)
}

export const MAX_DICE = 4; // cota de dados por tirada (layout/perf y 6^N acotado)
export const FULL_D6: DieSpec = { allowed: [1, 2, 3, 4, 5, 6] };

/** Sanea una lista de caras a un DieSpec válido (clamp 1..6, único, ordenado, no vacío). */
export function makeDie(faces: number[]): DieSpec {
  const set = new Set<Face>();
  for (const f of faces) {
    if (!Number.isFinite(f)) continue;
    set.add(Math.max(1, Math.min(6, Math.round(f))) as Face);
  }
  const allowed = [...set].sort((a, b) => a - b);
  return { allowed: allowed.length ? allowed : [1, 2, 3, 4, 5, 6] };
}

/** Acota umbrales a enteros con 0<=failMax<critMin<=7, sin NaN/Infinity. */
function clampThresholds(t: Thresholds): Thresholds {
  let failMax = Number.isFinite(t.failMax) ? Math.trunc(t.failMax) : 0;
  let critMin = Number.isFinite(t.critMin) ? Math.trunc(t.critMin) : 7;
  failMax = Math.max(0, Math.min(6, failMax));
  critMin = Math.max(1, Math.min(7, critMin));
  if (critMin <= failMax) critMin = Math.min(7, failMax + 1);
  return { failMax, critMin };
}

/* ---- Primitivas de modificación (puras, operan sobre el dado base dice[0]) ---- */

/** Bloquea el dado base a un único valor (p.ej. siempre 2). */
export function lockFace(roll: DiceRoll, v: Face): DiceRoll {
  const dice = roll.dice.slice();
  dice[0] = makeDie([v]);
  return { ...roll, dice };
}

/** Restringe el dado base a un rango [min,max], intersectado con sus caras actuales. */
export function restrictRange(roll: DiceRoll, min: number, max: number): DiceRoll {
  const lo = Math.max(1, Math.min(6, Math.round(min)));
  const hi = Math.max(1, Math.min(6, Math.round(max)));
  const base = roll.dice[0]?.allowed ?? FULL_D6.allowed;
  const filtered = base.filter((f) => f >= lo && f <= hi);
  const dice = roll.dice.slice();
  dice[0] = makeDie(filtered.length ? filtered : [hi]);
  return { ...roll, dice };
}

/** Añade `n` dados completos de ventaja (clamp a MAX_DICE) y fija el modo de combinación. */
export function addDice(roll: DiceRoll, n: number, combine?: CombineMode): DiceRoll {
  const room = MAX_DICE - roll.dice.length;
  const count = Math.max(0, Math.min(room, Math.trunc(Number.isFinite(n) ? n : 0)));
  if (count === 0) return combine ? { ...roll, combine } : roll;
  const extra: DieSpec[] = [];
  for (let i = 0; i < count; i++) extra.push({ allowed: [1, 2, 3, 4, 5, 6] });
  return { ...roll, dice: [...roll.dice, ...extra], combine: combine ?? roll.combine };
}

/** Desplaza los umbrales (señalados): +dFailMax sube el fallo, -dCritMin baja el crítico. */
export function shiftThresholds(roll: DiceRoll, dFailMax: number, dCritMin: number): DiceRoll {
  return {
    ...roll,
    thresholds: clampThresholds({
      failMax: roll.thresholds.failMax + (Number.isFinite(dFailMax) ? dFailMax : 0),
      critMin: roll.thresholds.critMin + (Number.isFinite(dCritMin) ? dCritMin : 0),
    }),
  };
}

/** Crea una tirada base: 1d6 completo, combine 'best', umbrales dados. */
export function baseRoll(thresholds: Thresholds): DiceRoll {
  return { dice: [{ allowed: [1, 2, 3, 4, 5, 6] }], combine: 'best', thresholds };
}

/* ---- Resolución ---- */

function projectFace(spec: DieSpec, raw: number): Face {
  const allowed = spec.allowed.length ? spec.allowed : FULL_D6.allowed;
  return allowed[(raw - 1) % allowed.length];
}

function combineFaces(faces: Face[], combine: CombineMode): Face {
  if (faces.length <= 1) return faces[0] ?? 1;
  return (combine === 'worst' ? Math.min(...faces) : Math.max(...faces)) as Face;
}

export function bandFor(keptFace: number, thresholds: Thresholds): OutcomeBand {
  const t = clampThresholds(thresholds);
  return keptFace <= t.failMax ? 'FALLO' : keptFace >= t.critMin ? 'CRITICO' : 'NORMAL';
}

/**
 * Tira todos los dados en orden. CONTRATO: consume EXACTAMENTE `roll.dice.length`
 * llamadas a `prng.nextInt(1,6)`; la proyección de restricción no consume PRNG.
 */
export function rollDice(prng: PRNG, roll: DiceRoll): DiceOutcome {
  const faces: Face[] = [];
  for (let i = 0; i < roll.dice.length; i++) {
    faces.push(projectFace(roll.dice[i], prng.nextInt(1, 6)));
  }
  const keptFace = combineFaces(faces, roll.combine);
  return { faces, keptFace, band: bandFor(keptFace, roll.thresholds), roll };
}

/* ---- Odds analíticas (sólo display; NO consume PRNG) ---- */

/** Probabilidad de cada cara 1..6 de UN dado (índices 1..6; 0 sin usar). */
function dieFaceProbs(spec: DieSpec): number[] {
  const p = [0, 0, 0, 0, 0, 0, 0];
  const allowed = spec.allowed.length ? spec.allowed : FULL_D6.allowed;
  for (let raw = 1; raw <= 6; raw++) p[allowed[(raw - 1) % allowed.length]] += 1 / 6;
  return p;
}

/** Distribución de la cara combinada y probabilidad por banda (para la previsualización). */
export function rollOdds(roll: DiceRoll): {
  failPct: number;
  normalPct: number;
  critPct: number;
  keptProbs: number[]; // índices 1..6
} {
  const t = clampThresholds(roll.thresholds);
  const cdf = roll.dice.map((d) => {
    const p = dieFaceProbs(d);
    const c = [0, 0, 0, 0, 0, 0, 0];
    let acc = 0;
    for (let k = 1; k <= 6; k++) {
      acc += p[k];
      c[k] = acc;
    }
    return c;
  });
  const keptProbs = [0, 0, 0, 0, 0, 0, 0];
  for (let k = 1; k <= 6; k++) {
    if (roll.combine === 'worst') {
      const geK = cdf.reduce((m, c) => m * (1 - c[k - 1]), 1);
      const geKp1 = cdf.reduce((m, c) => m * (1 - c[k]), 1);
      keptProbs[k] = geK - geKp1;
    } else {
      const leK = cdf.reduce((m, c) => m * c[k], 1);
      const leKm1 = cdf.reduce((m, c) => m * c[k - 1], 1);
      keptProbs[k] = leK - leKm1;
    }
  }
  let failPct = 0;
  let critPct = 0;
  for (let k = 1; k <= 6; k++) {
    if (k <= t.failMax) failPct += keptProbs[k];
    else if (k >= t.critMin) critPct += keptProbs[k];
  }
  return { failPct, normalPct: Math.max(0, 1 - failPct - critPct), critPct, keptProbs };
}
