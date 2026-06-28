import { describe, it, expect } from 'vitest';
import {
  buildTrainRoll,
  buildEventRoll,
  buildAbilityRoll,
  consejeroDieMod,
  bondForParticipation,
  energyFailShift,
  BOND_PER_TRAIN,
  BOND_AFFINITY_BONUS,
  SAFE_ENERGY,
} from '../src/shared/sim/balance.ts';
import { rollOdds } from '../src/shared/sim/dice.ts';
import { Consejero } from '../src/shared/types/index.ts';

const ofe = (level: number): Consejero => ({ id: 'x', name: 'X', affinity: 'OFE', level });

describe('balance — dice builders', () => {
  it('unassisted training at full energy fails 1 in 6', () => {
    expect(rollOdds(buildTrainRoll([], 'OFE', 100)).failPct).toBeCloseTo(1 / 6, 5);
  });

  it('a high-level on-affinity consejero removes failure and boosts crit', () => {
    const odds = rollOdds(buildTrainRoll([ofe(9)], 'OFE', 100));
    expect(odds.failPct).toBe(0);
    expect(odds.critPct).toBeGreaterThan(0.5);
  });

  it('a low-level consejero already removes failure (raises the floor)', () => {
    expect(rollOdds(buildTrainRoll([ofe(2)], 'OFE', 100)).failPct).toBe(0);
  });

  it('a higher-level consejero increases crit (lowers critMin)', () => {
    const lo = rollOdds(buildTrainRoll([ofe(2)], 'OFE', 100)).critPct; // sin critDown
    const hi = rollOdds(buildTrainRoll([ofe(6)], 'OFE', 100)).critPct; // critDown
    expect(hi).toBeGreaterThan(lo);
  });

  it('off-affinity consejero does not reshape the die', () => {
    const m = consejeroDieMod({ id: 'y', name: 'Y', affinity: 'DEF', level: 9 }, 'OFE');
    expect(m).toEqual({ raiseFloor: 0, critDown: 0, extraDie: false });
  });

  it('low energy raises failure probability', () => {
    const hi = rollOdds(buildTrainRoll([], 'OFE', 100)).failPct;
    const lo = rollOdds(buildTrainRoll([], 'OFE', 0)).failPct;
    expect(lo).toBeGreaterThan(hi);
    expect(energyFailShift(SAFE_ENERGY)).toBe(0);
    expect(energyFailShift(0)).toBeGreaterThan(0);
  });

  it('event/ability rolls approximate their probabilities', () => {
    expect(rollOdds(buildEventRoll(0.5)).critPct).toBeCloseTo(0.5, 5);
    expect(rollOdds(buildAbilityRoll(1 / 6)).critPct).toBeCloseTo(1 / 6, 5);
  });

  it('bond rewards on-affinity participation more than off-affinity', () => {
    expect(bondForParticipation(ofe(1), 'OFE')).toBe(BOND_PER_TRAIN + BOND_AFFINITY_BONUS);
    expect(bondForParticipation(ofe(1), 'DEF')).toBe(BOND_PER_TRAIN);
  });
});
