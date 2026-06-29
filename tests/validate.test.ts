import { describe, it, expect } from 'vitest';
import { validateActionLog } from '../src/shared/sim/validate.ts';
import { eventTurns, RUN_TURNS } from '../src/shared/sim/balance.ts';
import { DeckSnapshot, ActionLog, RunAction } from '../src/shared/types/index.ts';

const deck: DeckSnapshot = [
  { id: 'c1', name: 'A', affinity: 'OFE', level: 1 },
  { id: 'c2', name: 'B', affinity: 'DEF', level: 1 },
  { id: 'c3', name: 'C', affinity: 'MAN', level: 1 },
];

const seed = 'val_seed';

function logWith(nonEvent: RunAction): ActionLog {
  const evt = eventTurns(seed);
  const log: ActionLog = [];
  for (let i = 0; i < RUN_TURNS; i++) {
    log.push(evt.has(i) ? { kind: 'event', branch: 0 } : { ...nonEvent });
  }
  return log;
}

describe('validateActionLog — modelo de activación aleatoria (sin asignación)', () => {
  it('accepts a train action carrying only an affinity (no consejeroIds)', () => {
    const r = validateActionLog(seed, deck, logWith({ kind: 'train', choice: 'OFE' }));
    expect(r.isValid).toBe(true);
  });

  it('accepts rest actions on non-event turns', () => {
    const r = validateActionLog(seed, deck, logWith({ kind: 'rest' }));
    expect(r.isValid).toBe(true);
  });

  it('rejects an invalid affinity', () => {
    const r = validateActionLog(
      seed,
      deck,
      logWith({ kind: 'train', choice: 'XXX' } as unknown as RunAction)
    );
    expect(r.isValid).toBe(false);
  });

  it('rejects a non-event action on an event turn', () => {
    const evtIdx = [...eventTurns(seed)][0];
    const log = logWith({ kind: 'train', choice: 'OFE' });
    log[evtIdx] = { kind: 'train', choice: 'OFE' };
    const r = validateActionLog(seed, deck, log);
    expect(r.isValid).toBe(false);
  });

  it('rejects a log longer than RUN_TURNS', () => {
    const log = [...logWith({ kind: 'train', choice: 'OFE' }), { kind: 'rest' as const }];
    const r = validateActionLog(seed, deck, log);
    expect(r.isValid).toBe(false);
  });
});
