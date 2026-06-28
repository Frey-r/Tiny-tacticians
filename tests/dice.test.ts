import { describe, it, expect } from 'vitest';
import { PRNG } from '../src/shared/sim/prng.ts';
import {
  makeDie,
  baseRoll,
  lockFace,
  restrictRange,
  addDice,
  shiftThresholds,
  rollDice,
  rollOdds,
  bandFor,
  FULL_D6,
  type DiceRoll,
} from '../src/shared/sim/dice.ts';

const DEFAULT_T = { failMax: 1, critMin: 6 };

describe('dice — makeDie sanitization', () => {
  it('clamps, dedupes and sorts faces', () => {
    expect(makeDie([0, 7, 7, 3]).allowed).toEqual([1, 3, 6]);
  });
  it('falls back to a full d6 when input collapses to empty', () => {
    expect(makeDie([]).allowed).toEqual([1, 2, 3, 4, 5, 6]);
    expect(makeDie([NaN, Infinity]).allowed).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('dice — rollDice PRNG contract', () => {
  it('consumes exactly dice.length draws of nextInt(1,6)', () => {
    const roll = addDice(baseRoll(DEFAULT_T), 1); // 2 dados
    const a = new PRNG('contract');
    const b = new PRNG('contract');
    rollDice(a, roll);
    b.nextInt(1, 6);
    b.nextInt(1, 6);
    // Tras consumir lo mismo, ambos PRNG deben seguir alineados.
    expect(a.nextFloat()).toBe(b.nextFloat());
  });

  it('FULL_D6 is the identity projection (kept face == raw)', () => {
    const a = new PRNG('identity');
    const b = new PRNG('identity');
    for (let i = 0; i < 50; i++) {
      const out = rollDice(a, { dice: [FULL_D6], combine: 'best', thresholds: DEFAULT_T });
      expect(out.keptFace).toBe(b.nextInt(1, 6));
    }
  });
});

describe('dice — constrained dice', () => {
  it('a locked die always shows its value but still advances the PRNG', () => {
    const roll = lockFace(baseRoll(DEFAULT_T), 2);
    const a = new PRNG('lock');
    const b = new PRNG('lock');
    for (let i = 0; i < 30; i++) expect(rollDice(a, roll).keptFace).toBe(2);
    for (let i = 0; i < 30; i++) b.nextInt(1, 6);
    expect(a.nextFloat()).toBe(b.nextFloat());
  });

  it('restrictRange only ever yields faces inside the range', () => {
    const roll = restrictRange(baseRoll(DEFAULT_T), 2, 4);
    const p = new PRNG('range');
    for (let i = 0; i < 200; i++) {
      const f = rollDice(p, roll).faces[0];
      expect(f).toBeGreaterThanOrEqual(2);
      expect(f).toBeLessThanOrEqual(4);
    }
  });

  it('restrictRange composes (raise the floor)', () => {
    const roll = restrictRange(baseRoll(DEFAULT_T), 4, 6);
    expect(roll.dice[0].allowed).toEqual([4, 5, 6]);
  });
});

describe('dice — bands and thresholds', () => {
  it('default thresholds: 1 = FALLO, 6 = CRITICO, rest NORMAL', () => {
    expect(bandFor(1, DEFAULT_T)).toBe('FALLO');
    expect(bandFor(6, DEFAULT_T)).toBe('CRITICO');
    for (const k of [2, 3, 4, 5]) expect(bandFor(k, DEFAULT_T)).toBe('NORMAL');
  });

  it('shiftThresholds clamps so failMax < critMin', () => {
    // Empujar failMax muy arriba no debe pasarse de critMin.
    const r = shiftThresholds(baseRoll({ failMax: 1, critMin: 4 }), +10, 0);
    expect(r.thresholds.failMax).toBeLessThan(r.thresholds.critMin);
    expect(Number.isFinite(r.thresholds.failMax)).toBe(true);
    expect(Number.isFinite(r.thresholds.critMin)).toBe(true);
  });
});

describe('dice — analytic odds', () => {
  it('probabilities sum to ~1 and match empirical frequencies', () => {
    const roll: DiceRoll = addDice(restrictRange(baseRoll({ failMax: 1, critMin: 5 }), 2, 6), 1, 'best');
    const odds = rollOdds(roll);
    expect(odds.failPct + odds.normalPct + odds.critPct).toBeCloseTo(1, 6);

    const p = new PRNG('odds_seed');
    const N = 20000;
    let fail = 0;
    let crit = 0;
    for (let i = 0; i < N; i++) {
      const b = rollDice(p, roll).band;
      if (b === 'FALLO') fail++;
      else if (b === 'CRITICO') crit++;
    }
    expect(fail / N).toBeCloseTo(odds.failPct, 1);
    expect(crit / N).toBeCloseTo(odds.critPct, 1);
  });

  it('keep-best raises the crit probability vs a single die', () => {
    const single = rollOdds(baseRoll(DEFAULT_T));
    const advantage = rollOdds(addDice(baseRoll(DEFAULT_T), 1, 'best'));
    expect(advantage.critPct).toBeGreaterThan(single.critPct);
  });
});
