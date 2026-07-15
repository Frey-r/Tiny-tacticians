import { describe, it, expect } from 'vitest';
import { simulateBattle } from '../src/shared/sim/simulateBattle.ts';
import { General } from '../src/shared/types/index.ts';

const mockGeneralA: General = {
  id: 'genA',
  ownerId: 'owner1',
  name: 'General A (Ofensivo)',
  stats: { ofe: 45, def: 20, man: 15 },
  power: 83,
  tier: 2,
  abilities: ['Battle Fury'],
  seed: 'seed1',
  schemaVersion: 1,
  createdAt: Date.now(),
};

const mockGeneralB: General = {
  id: 'genB',
  ownerId: 'owner2',
  name: 'General B (Defensivo)',
  stats: { ofe: 20, def: 45, man: 20 },
  power: 89,
  tier: 2,
  abilities: ['Iron Bulwark'],
  seed: 'seed2',
  schemaVersion: 1,
  createdAt: Date.now(),
};

describe('simulateBattle (deterministic combat)', () => {
  it('should resolve to the exact same winner and logs with the same seed', () => {
    const battleSeed = 'battle_seed_abc123';
    const result1 = simulateBattle(battleSeed, mockGeneralA, mockGeneralB);
    const result2 = simulateBattle(battleSeed, mockGeneralA, mockGeneralB);

    expect(result1.winnerId).toBe(result2.winnerId);
    expect(result1.rounds).toEqual(result2.rounds);
    expect(result1.battleId).toBe(result2.battleId);
  });

  it('should respect initiative by Mando (MAN) stats', () => {
    const battleSeed = 'initiative_check';
    const result = simulateBattle(battleSeed, mockGeneralA, mockGeneralB);
    
    // General B has 20 MAN, General A has 15 MAN, so General B must attack first in round 1
    const firstRound = result.rounds[0];
    expect(firstRound.attackerId).toBe(mockGeneralB.id);
    expect(firstRound.defenderId).toBe(mockGeneralA.id);
  });

  it('should run correctly regardless of positional arguments', () => {
    const battleSeed = 'positional_test';
    const resultAB = simulateBattle(battleSeed, mockGeneralA, mockGeneralB);
    const resultBA = simulateBattle(battleSeed, mockGeneralB, mockGeneralA);

    // Winner should be identical
    expect(resultAB.winnerId).toBe(resultBA.winnerId);
    // Since the battle starts with initiative based on stats, the sequence of rounds should be identical
    // (except that we might have generalA and generalB mapped differently in the return values,
    // but the winner is identical and combat behavior is symmetric).
  });

  it('should populate structured FX fields on every round (for the visualizer)', () => {
    const result = simulateBattle('fx_fields', mockGeneralA, mockGeneralB);

    for (const r of result.rounds) {
      expect(typeof r.crit).toBe('boolean');
      expect(typeof r.blocked).toBe('boolean');
      expect(typeof r.lethal).toBe('boolean');
      expect(Array.isArray(r.abilityProcs)).toBe(true);
      // `lethal` debe ser consistente con el HP del defensor.
      expect(r.lethal).toBe(r.defenderHpAfter <= 0);
    }

    // General A tiene 'Battle Fury' (sin RNG) y B 'Iron Bulwark' (rama else):
    // ambas deben aparecer en abilityProcs en algún momento.
    const allProcs = result.rounds.flatMap((r) => r.abilityProcs ?? []);
    expect(allProcs).toContain('Battle Fury');
    expect(allProcs).toContain('Iron Bulwark');
  });
});
