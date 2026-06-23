import { describe, it, expect } from 'vitest';
import { startRun } from '../src/server/core/runs.ts';
import { getUserConsejeros } from '../src/server/core/rewards.ts';

describe('startRun (ownership & loadout validation)', () => {
  it('builds an authoritative deck from owned advisor ids', async () => {
    const user = 't2_run_ok';
    const owned = await getUserConsejeros(user); // seeds c1,c2,c3
    const requested = owned.map((a) => ({ ...a }));

    const res = await startRun(user, requested);
    expect(res.runId).toBeTruthy();
    expect(res.seed).toBeTruthy();
    expect(res.deckSnapshot).toHaveLength(3);
    expect(res.deckSnapshot.map((c) => c.id).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('ignores client-supplied levels and uses server-authoritative ones', async () => {
    const user = 't2_run_forge';
    const owned = await getUserConsejeros(user);
    // Client claims max level on every advisor.
    const forged = owned.map((a) => ({ ...a, level: 99 }));

    const res = await startRun(user, forged);
    for (const c of res.deckSnapshot) {
      expect(c.level).toBe(1); // real level, not the forged 99
    }
  });

  it('rejects a loadout that references an advisor the user does not own', async () => {
    const user = 't2_run_unowned';
    const owned = await getUserConsejeros(user); // c1,c2,c3
    const deck = [owned[0], owned[1], { id: 'c9', name: 'x', affinity: 'MAN' as const, level: 5 }];

    await expect(startRun(user, deck)).rejects.toThrow('FORBIDDEN_ADVISOR');
  });

  it('rejects a loadout of the wrong size', async () => {
    const user = 't2_run_size';
    const owned = await getUserConsejeros(user);
    await expect(startRun(user, [owned[0], owned[1]])).rejects.toThrow('INVALID_LOADOUT');
  });

  it('rejects a loadout with duplicate advisors', async () => {
    const user = 't2_run_dupe';
    const owned = await getUserConsejeros(user);
    await expect(startRun(user, [owned[0], owned[0], owned[1]])).rejects.toThrow('INVALID_LOADOUT');
  });
});
