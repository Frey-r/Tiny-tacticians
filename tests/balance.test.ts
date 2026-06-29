import { describe, it, expect } from 'vitest';
import {
  planTrainTurn,
  buildEventRoll,
  buildAbilityRoll,
  consejeroTrainMod,
  bondForParticipation,
  energyFailShift,
  activationRamp,
  activationChance,
  activeAdvisorsForTurn,
  ACTIVATION_MIN,
  ACTIVATION_MAX,
  RUN_TURNS,
  BOND_PER_TRAIN,
  BOND_AFFINITY_BONUS,
  SAFE_ENERGY,
} from '../src/shared/sim/balance.ts';
import { rollOdds } from '../src/shared/sim/dice.ts';
import { Affinity, Consejero } from '../src/shared/types/index.ts';

const adv = (id: string, affinity: Affinity, level: number): Consejero => ({ id, name: id, affinity, level });

describe('balance — arquetipos de entrenamiento', () => {
  it('unassisted training at full energy fails 1 in 6', () => {
    expect(rollOdds(planTrainTurn([], 'OFE', 100).roll).failPct).toBeCloseTo(1 / 6, 5);
  });

  it('Maestro (c1, OFE) polariza: más crítico Y más fallo que sin asistencia', () => {
    const base = rollOdds(planTrainTurn([], 'OFE', 100).roll);
    const maestro = rollOdds(planTrainTurn([adv('c1', 'OFE', 1)], 'OFE', 100).roll);
    expect(maestro.critPct).toBeGreaterThan(base.critPct);
    expect(maestro.failPct).toBeGreaterThan(base.failPct);
  });

  it('Alquimista (c3, MAN) estabiliza: sin fallo pero bloquea el crítico', () => {
    const alq = rollOdds(planTrainTurn([adv('c3', 'MAN', 6)], 'MAN', 100).roll);
    expect(alq.failPct).toBe(0);
    expect(alq.critPct).toBe(0);
  });

  it('Intendente (c2, DEF) eficiencia: reembolsa energía y regala stat secundaria', () => {
    const plan = planTrainTurn([adv('c2', 'DEF', 8)], 'DEF', 100);
    expect(plan.energyRefund).toBeGreaterThan(0);
    expect(plan.secondaryGain).toBeGreaterThan(0);
  });

  it('un efecto de run detona cuando el consejero está activo (procs)', () => {
    // c2 lleva el efecto "Logística Previsora" (energiaPrevista).
    const plan = planTrainTurn([adv('c2', 'DEF', 1)], 'DEF', 100);
    expect(plan.procs.length).toBeGreaterThan(0);
  });

  it('off-affinity consejero does not reshape the die (ZERO_MOD)', () => {
    const m = consejeroTrainMod(adv('c1', 'OFE', 9), 'DEF');
    expect(m).toEqual({
      raiseFloor: 0,
      critDown: 0,
      failUp: 0,
      capTop: false,
      extraDie: false,
      energyRefund: 0,
      secondaryGain: 0,
    });
  });

  it('low energy raises failure probability', () => {
    const hi = rollOdds(planTrainTurn([], 'OFE', 100).roll).failPct;
    const lo = rollOdds(planTrainTurn([], 'OFE', 0).roll).failPct;
    expect(lo).toBeGreaterThan(hi);
    expect(energyFailShift(SAFE_ENERGY)).toBe(0);
    expect(energyFailShift(0)).toBeGreaterThan(0);
  });

  it('event/ability rolls approximate their probabilities', () => {
    expect(rollOdds(buildEventRoll(0.5)).critPct).toBeCloseTo(0.5, 5);
    expect(rollOdds(buildAbilityRoll(1 / 6)).critPct).toBeCloseTo(1 / 6, 5);
  });

  it('bond rewards on-affinity participation more than off-affinity', () => {
    expect(bondForParticipation(adv('c1', 'OFE', 1), 'OFE')).toBe(BOND_PER_TRAIN + BOND_AFFINITY_BONUS);
    expect(bondForParticipation(adv('c1', 'OFE', 1), 'DEF')).toBe(BOND_PER_TRAIN);
  });
});

describe('balance — activación aleatoria de consejeros', () => {
  const deck: Consejero[] = [adv('c1', 'OFE', 5), adv('c2', 'DEF', 3), adv('c3', 'MAN', 2)];

  it('ramps linearly from 5% to 75% across the run', () => {
    expect(activationRamp(0)).toBeCloseTo(ACTIVATION_MIN, 5);
    expect(activationRamp(RUN_TURNS - 1)).toBeCloseTo(ACTIVATION_MAX, 5);
    const mid = activationRamp(Math.floor((RUN_TURNS - 1) / 2));
    expect(mid).toBeGreaterThan(ACTIVATION_MIN);
    expect(mid).toBeLessThan(ACTIVATION_MAX);
  });

  it('active set is deterministic and bounded 0..deck.length', () => {
    for (let t = 0; t < RUN_TURNS; t++) {
      const a = activeAdvisorsForTurn('act_seed', deck, t);
      const b = activeAdvisorsForTurn('act_seed', deck, t);
      expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
      expect(a.length).toBeGreaterThanOrEqual(0);
      expect(a.length).toBeLessThanOrEqual(deck.length);
    }
  });

  it('late-run activation is more likely than early-run on average', () => {
    let early = 0;
    let late = 0;
    for (let s = 0; s < 40; s++) {
      early += activeAdvisorsForTurn(`s${s}`, deck, 0).length;
      late += activeAdvisorsForTurn(`s${s}`, deck, RUN_TURNS - 1).length;
    }
    expect(late).toBeGreaterThan(early);
  });

  it('per-advisor bias shifts the activation chance', () => {
    // c5 es fiable (bias +0.15); c7 es volátil (bias -0.15).
    expect(activationChance(adv('c5', 'DEF', 1), 5)).toBeGreaterThan(activationChance(adv('c7', 'OFE', 1), 5));
  });
});
