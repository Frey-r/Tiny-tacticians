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

function logWithTrain(train: RunAction): ActionLog {
  const evt = eventTurns(seed);
  const log: ActionLog = [];
  for (let i = 0; i < RUN_TURNS; i++) {
    log.push(evt.has(i) ? { kind: 'event', branch: 0 } : { ...train });
  }
  return log;
}

describe('validateActionLog — consejero assignment', () => {
  it('accepts empty consejeroIds (entrenamiento sin asistencia)', () => {
    const r = validateActionLog(seed, deck, logWithTrain({ kind: 'train', choice: 'OFE', consejeroIds: [] }));
    expect(r.isValid).toBe(true);
  });

  it('accepts a valid subset of the deck', () => {
    const r = validateActionLog(seed, deck, logWithTrain({ kind: 'train', choice: 'OFE', consejeroIds: ['c1', 'c2'] }));
    expect(r.isValid).toBe(true);
  });

  it('rejects a train action missing consejeroIds (logs v1)', () => {
    const r = validateActionLog(seed, deck, logWithTrain({ kind: 'train', choice: 'OFE' } as unknown as RunAction));
    expect(r.isValid).toBe(false);
  });

  it('rejects a consejero id not in the deck (anti-cheat)', () => {
    const r = validateActionLog(seed, deck, logWithTrain({ kind: 'train', choice: 'OFE', consejeroIds: ['c9'] }));
    expect(r.isValid).toBe(false);
  });

  it('rejects duplicate consejero ids in one training', () => {
    const r = validateActionLog(seed, deck, logWithTrain({ kind: 'train', choice: 'OFE', consejeroIds: ['c1', 'c1'] }));
    expect(r.isValid).toBe(false);
  });
});
