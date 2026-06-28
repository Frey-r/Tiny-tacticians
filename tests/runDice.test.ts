import { describe, it, expect } from 'vitest';
import { stepRun } from '../src/shared/sim/stepRun.ts';
import { simulateRun } from '../src/shared/sim/simulateRun.ts';
import { eventTurns, RUN_TURNS, BOND_THRESHOLD, SIM_VERSION } from '../src/shared/sim/balance.ts';
import { simulateBattle } from '../src/shared/sim/simulateBattle.ts';
import { DeckSnapshot, ActionLog, General } from '../src/shared/types/index.ts';

// Deck con ids reales del catálogo (c1 OFE -> 'Lluvia de Flechas').
const deck: DeckSnapshot = [
  { id: 'c1', name: 'Consejero de Guerra', affinity: 'OFE', level: 5 },
  { id: 'c2', name: 'Albañil del Muro', affinity: 'DEF', level: 3 },
  { id: 'c3', name: 'Maestre de Cuentas', affinity: 'MAN', level: 2 },
];

function assignedLog(seed: string, ids: string[]): ActionLog {
  const evt = eventTurns(seed);
  const log: ActionLog = [];
  for (let i = 0; i < RUN_TURNS; i++) {
    log.push(evt.has(i) ? { kind: 'event', branch: 0 } : { kind: 'train', choice: 'OFE', consejeroIds: ids });
  }
  return log;
}

describe('stepRun — dados, bond y habilidades', () => {
  it('is deterministic across bond, abilities and dice faces', () => {
    const seed = 'det_bond';
    const log = assignedLog(seed, ['c1']);
    const a = stepRun(seed, deck, log);
    const b = stepRun(seed, deck, log);
    expect(a.bond).toEqual(b.bond);
    expect(a.unlockedAbilities).toEqual(b.unlockedAbilities);
    expect(a.turns.map((t) => t.dice?.faces)).toEqual(b.turns.map((t) => t.dice?.faces));
  });

  it('accrues bond and unlocks the consejero ability past the threshold', () => {
    const seed = 'bond_unlock';
    const res = stepRun(seed, deck, assignedLog(seed, ['c1']));
    expect(res.bond['c1']).toBeGreaterThanOrEqual(BOND_THRESHOLD);
    expect(res.unlockedAbilities).toContain('Lluvia de Flechas');
  });

  it('does not unlock when a consejero barely participates', () => {
    const seed = 'bond_low';
    const evt = eventTurns(seed);
    const log: ActionLog = [];
    let used = false;
    for (let i = 0; i < RUN_TURNS; i++) {
      if (evt.has(i)) {
        log.push({ kind: 'event', branch: 0 });
      } else if (!used) {
        log.push({ kind: 'train', choice: 'OFE', consejeroIds: ['c1'] });
        used = true;
      } else {
        log.push({ kind: 'train', choice: 'OFE', consejeroIds: [] });
      }
    }
    const res = stepRun(seed, deck, log);
    expect(res.bond['c1']).toBeLessThan(BOND_THRESHOLD);
    expect(res.unlockedAbilities).not.toContain('Lluvia de Flechas');
  });

  it('records dice on every training turn', () => {
    const seed = 'faces_present';
    const res = stepRun(seed, deck, assignedLog(seed, ['c1']));
    for (const t of res.turns) {
      if (t.kind === 'train') {
        expect(t.dice).toBeTruthy();
        expect(t.dice!.faces.length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('simulateRun — acuñación con habilidades de consejero', () => {
  it('mints with SIM_VERSION and folds the unlocked ability into the general', () => {
    const seed = 'mint_v2';
    const g = simulateRun(seed, deck, assignedLog(seed, ['c1']), 'Tester');
    expect(g.schemaVersion).toBe(SIM_VERSION);
    expect(g.abilities).toContain('Lluvia de Flechas');
  });
});

describe('simulateBattle — proc de habilidad de consejero por dado', () => {
  it('a consejero-unlocked ability procs at least once over several seeds', () => {
    const attacker: General = {
      id: 'atkV',
      ownerId: 'o1',
      name: 'Arquero',
      stats: { ofe: 60, def: 20, man: 40 }, // mayor MAN -> ataca primero
      power: 100,
      tier: 3,
      abilities: ['Lluvia de Flechas'],
      seed: 's',
      schemaVersion: SIM_VERSION,
      createdAt: 0,
    };
    const defender: General = {
      id: 'defV',
      ownerId: 'o2',
      name: 'Muro',
      stats: { ofe: 20, def: 40, man: 10 },
      power: 90,
      tier: 3,
      abilities: [],
      seed: 's2',
      schemaVersion: SIM_VERSION,
      createdAt: 0,
    };
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      const res = simulateBattle(`volley_${i}`, attacker, defender);
      if (res.rounds.some((r) => (r.abilityProcs ?? []).includes('Lluvia de Flechas'))) found = true;
    }
    expect(found).toBe(true);
  });
});
