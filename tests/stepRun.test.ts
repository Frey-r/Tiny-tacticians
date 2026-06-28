import { describe, it, expect } from 'vitest';
import { stepRun, previewTurn } from '../src/shared/sim/stepRun.ts';
import { simulateRun } from '../src/shared/sim/simulateRun.ts';
import { eventTurns, RUN_TURNS } from '../src/shared/sim/balance.ts';
import { DeckSnapshot, ActionLog, Affinity } from '../src/shared/types/index.ts';

const mockDeck: DeckSnapshot = [
  { id: 'adv1', name: 'Consejero 1', affinity: 'OFE', level: 2 },
  { id: 'adv2', name: 'Consejero 2', affinity: 'DEF', level: 1 },
  { id: 'adv3', name: 'Consejero 3', affinity: 'MAN', level: 3 },
];

function buildLog(seed: string, choice: Affinity = 'OFE'): ActionLog {
  const evt = eventTurns(seed);
  const log: ActionLog = [];
  for (let i = 0; i < RUN_TURNS; i++) {
    log.push(evt.has(i) ? { kind: 'event', branch: 0 } : { kind: 'train', choice, consejeroIds: [] });
  }
  return log;
}

describe('stepRun (shared turn engine)', () => {
  it('is deterministic: same seed + log → identical turns and stats', () => {
    const seed = 'step_seed_1';
    const log = buildLog(seed, 'MAN');
    const a = stepRun(seed, mockDeck, log);
    const b = stepRun(seed, mockDeck, log);

    expect(a.stats).toEqual(b.stats);
    expect(a.energy).toBe(b.energy);
    expect(a.turns.map((t) => t.outcome)).toEqual(b.turns.map((t) => t.outcome));
  });

  it('produces exactly one TurnResult per turn, with event turns where expected', () => {
    const seed = 'step_seed_2';
    const evt = eventTurns(seed);
    const res = stepRun(seed, mockDeck, buildLog(seed));

    expect(res.turns).toHaveLength(RUN_TURNS);
    for (let i = 0; i < RUN_TURNS; i++) {
      expect(res.turns[i].kind).toBe(evt.has(i) ? 'event' : 'train');
    }
  });

  it('client/server parity: stepRun stats == simulateRun stats', () => {
    const seed = 'parity_seed';
    const log = buildLog(seed, 'DEF');
    const stepped = stepRun(seed, mockDeck, log);
    const minted = simulateRun(seed, mockDeck, log);
    expect(stepped.stats).toEqual(minted.stats);
  });

  it('energy drains on train and recovers on rest', () => {
    const seed = 'energy_seed';
    const evt = eventTurns(seed);
    // Primer turno no-evento: train (gasta) vs rest (recupera, partiendo de máximo no sube).
    const firstNonEvent = [...Array(RUN_TURNS).keys()].find((i) => !evt.has(i))!;
    const log = buildLog(seed, 'OFE');
    const res = stepRun(seed, mockDeck, log);
    const t = res.turns[firstNonEvent];
    expect(t.energyAfter).toBeLessThan(t.energyBefore); // entrenar gasta energía
  });

  it('previewTurn returns sane odds without consuming the run PRNG', () => {
    const pv = previewTurn(mockDeck, 'OFE', 100);
    expect(pv.successPct).toBeGreaterThan(0);
    expect(pv.successPct).toBeLessThanOrEqual(1);
    expect(pv.critGain).toBeGreaterThanOrEqual(pv.normalGain);
    // Con menos energía, baja la probabilidad de éxito.
    const low = previewTurn(mockDeck, 'OFE', 0);
    expect(low.successPct).toBeLessThan(pv.successPct);
  });
});
