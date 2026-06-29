import { describe, it, expect } from 'vitest';
import { simulateRun } from '../src/shared/sim/simulateRun.ts';
import { eventTurns, RUN_TURNS } from '../src/shared/sim/balance.ts';
import { DeckSnapshot, ActionLog, Affinity } from '../src/shared/types/index.ts';

const mockDeck: DeckSnapshot = [
  { id: 'adv1', name: 'Consejero 1', affinity: 'OFE', level: 2 },
  { id: 'adv2', name: 'Consejero 2', affinity: 'DEF', level: 1 },
  { id: 'adv3', name: 'Consejero 3', affinity: 'MAN', level: 3 },
];

/** Construye un actionLog v2 válido: eventos en los turnos derivados del seed, train en el resto. */
function buildLog(seed: string, choice: Affinity = 'OFE'): ActionLog {
  const evt = eventTurns(seed);
  const log: ActionLog = [];
  for (let i = 0; i < RUN_TURNS; i++) {
    log.push(evt.has(i) ? { kind: 'event', branch: 0 } : { kind: 'train', choice });
  }
  return log;
}

describe('simulateRun (deterministic training)', () => {
  it('should generate the exact same General when run twice with the same inputs', () => {
    const seed = 'run_seed_999';
    const log = buildLog(seed);
    const gen1 = simulateRun(seed, mockDeck, log, 'Marcus');
    const gen2 = simulateRun(seed, mockDeck, log, 'Marcus');

    expect(gen1.id).toBe(gen2.id);
    expect(gen1.stats).toEqual(gen2.stats);
    expect(gen1.power).toBe(gen2.power);
    expect(gen1.abilities).toEqual(gen2.abilities);
    expect(gen1.tier).toBe(gen2.tier);
  });

  it(`should reject actionLogs that do not have exactly ${RUN_TURNS} turns`, () => {
    const seed = 'fail_length';
    const invalidLog = buildLog(seed).slice(0, RUN_TURNS - 1);

    expect(() => simulateRun(seed, mockDeck, invalidLog)).toThrow(
      `El actionLog debe tener exactamente ${RUN_TURNS} acciones.`
    );
  });

  it('should reject a non-event action on an event turn', () => {
    const seed = 'fail_event';
    const log = buildLog(seed);
    const eventIdx = [...eventTurns(seed)][0];
    log[eventIdx] = { kind: 'train', choice: 'OFE' };

    expect(() => simulateRun(seed, mockDeck, log)).toThrow(
      `La acción en el índice ${eventIdx} debe ser un evento con rama 0 o 1.`
    );
  });

  it('should clamp stats to MAX_STAT = 100 without exceeding it', () => {
    const seed = 'clamp_test';
    const superDeck: DeckSnapshot = [
      { id: 'op_adv', name: 'Overpowered Advisor', affinity: 'OFE', level: 50 },
    ];
    const general = simulateRun(seed, superDeck, buildLog(seed, 'OFE'));
    expect(general.stats.ofe).toBeLessThanOrEqual(100);
    expect(general.stats.ofe).not.toBeGreaterThan(100);
  });
});
