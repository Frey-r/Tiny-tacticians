import { describe, it, expect } from 'vitest';
import { stepRun } from '../src/shared/sim/stepRun.ts';
import { simulateRun } from '../src/shared/sim/simulateRun.ts';
import { eventTurns, RUN_TURNS, SIM_VERSION } from '../src/shared/sim/balance.ts';
import { simulateBattle } from '../src/shared/sim/simulateBattle.ts';
import { DeckSnapshot, ActionLog, Affinity, General } from '../src/shared/types/index.ts';

// Deck con ids reales del catálogo (c1 OFE maestro -> 'Arrow Volley').
const deck: DeckSnapshot = [
  { id: 'c1', name: 'Consejero de Guerra', affinity: 'OFE', level: 5 },
  { id: 'c2', name: 'Albañil del Muro', affinity: 'DEF', level: 3 },
  { id: 'c3', name: 'Maestre de Cuentas', affinity: 'MAN', level: 2 },
];

/** Log válido: eventos en los turnos del seed, entrena `choice` en el resto. */
function trainLog(seed: string, choice: Affinity = 'OFE'): ActionLog {
  const evt = eventTurns(seed);
  const log: ActionLog = [];
  for (let i = 0; i < RUN_TURNS; i++) {
    log.push(evt.has(i) ? { kind: 'event', branch: 0 } : { kind: 'train', choice });
  }
  return log;
}

describe('stepRun — activación aleatoria, bond y dados', () => {
  it('is deterministic across bond, abilities and dice faces', () => {
    const seed = 'det_bond';
    const log = trainLog(seed, 'OFE');
    const a = stepRun(seed, deck, log);
    const b = stepRun(seed, deck, log);
    expect(a.bond).toEqual(b.bond);
    expect(a.unlockedAbilities).toEqual(b.unlockedAbilities);
    expect(a.turns.map((t) => t.dice?.faces)).toEqual(b.turns.map((t) => t.dice?.faces));
  });

  it('an on-affinity advisor accrues bond and can unlock its ability over the run', () => {
    let unlocked = false;
    let anyBond = false;
    for (let i = 0; i < 30 && !unlocked; i++) {
      const seed = `unlock_${i}`;
      const res = stepRun(seed, deck, trainLog(seed, 'OFE'));
      if ((res.bond['c1'] ?? 0) > 0) anyBond = true;
      if (res.unlockedAbilities.includes('Arrow Volley')) unlocked = true;
    }
    expect(anyBond).toBe(true);
    expect(unlocked).toBe(true);
  });

  it('reports a deterministic active set (subset of the deck) on every training turn', () => {
    const seed = 'active_seed';
    const res = stepRun(seed, deck, trainLog(seed, 'OFE'));
    for (const t of res.turns) {
      if (t.kind === 'train') {
        expect(Array.isArray(t.activeIds)).toBe(true);
        for (const id of t.activeIds!) expect(['c1', 'c2', 'c3']).toContain(id);
      }
    }
  });

  it('records dice on every training turn', () => {
    const seed = 'faces_present';
    const res = stepRun(seed, deck, trainLog(seed, 'OFE'));
    for (const t of res.turns) {
      if (t.kind === 'train') {
        expect(t.dice).toBeTruthy();
        expect(t.dice!.faces.length).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe('stepRun — logs parciales (preview incremental del cliente)', () => {
  it('does not throw on a 1-action log and returns one turn', () => {
    const res = stepRun('partial_seed', deck, [{ kind: 'train', choice: 'OFE' }]);
    expect(res.turns).toHaveLength(1);
  });

  it('simulates a growing prefix turn by turn', () => {
    const seed = 'prefix_seed';
    const full = trainLog(seed, 'OFE');
    for (let n = 1; n <= 5; n++) {
      const res = stepRun(seed, deck, full.slice(0, n));
      expect(res.turns).toHaveLength(n);
    }
  });

  it('rejects a log longer than RUN_TURNS', () => {
    const seed = 'too_long';
    const log = [...trainLog(seed, 'OFE'), { kind: 'rest' as const }];
    expect(() => stepRun(seed, deck, log)).toThrow();
  });
});

describe('simulateRun — acuñación con habilidades de consejero', () => {
  it('requires a complete 16-turn log to mint', () => {
    const seed = 'incomplete';
    expect(() => simulateRun(seed, deck, trainLog(seed, 'OFE').slice(0, 10))).toThrow(
      `El actionLog debe tener exactamente ${RUN_TURNS} acciones.`
    );
  });

  it('mints with SIM_VERSION and folds an unlocked consejero ability into the general', () => {
    // Busca un seed donde c1 cruce el umbral de bond y verifica que se acuña su skill.
    let minted: General | null = null;
    for (let i = 0; i < 30 && !minted; i++) {
      const seed = `mint_${i}`;
      const res = stepRun(seed, deck, trainLog(seed, 'OFE'));
      if (res.unlockedAbilities.includes('Arrow Volley')) {
        minted = simulateRun(seed, deck, trainLog(seed, 'OFE'), 'Tester');
      }
    }
    expect(minted).not.toBeNull();
    expect(minted!.schemaVersion).toBe(SIM_VERSION);
    expect(minted!.abilities).toContain('Arrow Volley');
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
      abilities: ['Arrow Volley'],
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
      if (res.rounds.some((r) => (r.abilityProcs ?? []).includes('Arrow Volley'))) found = true;
    }
    expect(found).toBe(true);
  });
});
