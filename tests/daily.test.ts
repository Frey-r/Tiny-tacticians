import { describe, it, expect } from 'vitest';
import { redis } from '../src/server/devvitProxy/index.ts';
import { keys } from '../src/server/core/keys.ts';
import {
  getCanonicalDate,
  getOrCreateDailyChallenge,
  getDailyStatus,
  resolveDailyBattle,
  claimDaily,
} from '../src/server/core/daily.ts';
import { getUserProfile, getUserConsejeros, grantConsejero } from '../src/server/core/rewards.ts';
import { getContracts } from '../src/server/core/recruitment.ts';
import type { General, DailyChallenge } from '../src/shared/types/index.ts';

const today = getCanonicalDate();

// Pre-siembra el reto de HOY con un enemigo trivial para que un atacante fuerte
// gane de forma determinista (controla el resultado del combate en el test).
async function seedWeakDaily(): Promise<void> {
  const enemy: General = {
    id: `daily_${today}`,
    ownerId: 'daily',
    name: 'Weakling',
    stats: { ofe: 1, def: 1, man: 1 },
    power: 4,
    tier: 1,
    abilities: [],
    seed: `daily_${today}`,
    schemaVersion: 1,
    createdAt: Date.now(),
  };
  const challenge: DailyChallenge = {
    date: today,
    seed: `daily_${today}`,
    enemy,
    modifier: { id: 'm', name: 'Test', description: 'd' },
    schemaVersion: 1,
  };
  await redis.set(keys.dailyChallenge(today), JSON.stringify(challenge));
}

async function seedStrongAttacker(user: string, id: string): Promise<void> {
  const g: General = {
    id,
    ownerId: user,
    name: 'Hero',
    stats: { ofe: 100, def: 100, man: 100 },
    power: 320,
    tier: 5,
    abilities: [],
    seed: 's',
    schemaVersion: 1,
    createdAt: Date.now(),
  };
  await redis.set(keys.general(id), JSON.stringify(g));
}

describe('daily events', () => {
  it('generates a challenge idempotently for a date', async () => {
    const d = '2099-06-15';
    const a = await getOrCreateDailyChallenge(d);
    const b = await getOrCreateDailyChallenge(d);
    expect(a.date).toBe(d);
    expect(a.seed).toBe(b.seed);
    expect(a.enemy.id).toBe(b.enemy.id);
    expect(a.modifier.id).toBe(b.modifier.id);
    expect(a.enemy.power).toBe(b.enemy.power);
  });

  it('marks completion when the attacker wins the daily battle', async () => {
    await seedWeakDaily();
    const user = 't2_daily_win';
    await getUserProfile(user);
    await seedStrongAttacker(user, 'gen_win');

    const res = await resolveDailyBattle(user, 'gen_win');
    expect(res.battleResult.winnerId).toBe('gen_win');
    expect(res.completed).toBe(true);

    const status = await getDailyStatus(user, today);
    expect(status.completed).toBe(true);
    expect(status.claimed).toBe(false);
  });

  it('rejects claim when the objective is not completed', async () => {
    const user = 't2_daily_noteligible';
    await getUserProfile(user);
    await expect(claimDaily(user)).rejects.toThrow('DAILY_NOT_ELIGIBLE');
  });

  it('credits the reward once and rejects a double claim', async () => {
    await seedWeakDaily();
    const user = 't2_daily_claim';
    const before = await getUserProfile(user); // 1000 gold
    await seedStrongAttacker(user, 'gen_claim');
    await resolveDailyBattle(user, 'gen_claim');

    const result = await claimDaily(user);
    expect(result.goldEarned).toBe(100);
    expect(result.newGoldTotal).toBe(before.gold + 100);

    // El reto diario entrega un contrato (modificador 'm' del seed -> comodín blanco).
    expect(result.contractGranted).toBe('white');
    expect((await getContracts(user)).white).toBe(1);

    const after = await getUserProfile(user);
    expect(after.gold).toBe(before.gold + 100);

    await expect(claimDaily(user)).rejects.toThrow('DAILY_ALREADY_CLAIMED');

    // El segundo reclamo rechazado no acredita oro adicional.
    const after2 = await getUserProfile(user);
    expect(after2.gold).toBe(before.gold + 100);
  });

  it('rejects claiming an expired (past) daily challenge', async () => {
    const user = 't2_daily_expired';
    await getUserProfile(user);
    await expect(claimDaily(user, '2000-01-01')).rejects.toThrow('DAILY_EXPIRED');
  });

  it('grants an acquirable consejero idempotently', async () => {
    const user = 't2_daily_grant';
    const before = await getUserConsejeros(user); // 3 defaults
    const granted = await grantConsejero(user, 'c4');
    expect(granted?.id).toBe('c4');

    const after = await getUserConsejeros(user);
    expect(after).toHaveLength(before.length + 1);
    expect(after.some((c) => c.id === 'c4')).toBe(true);

    // Conceder de nuevo es un no-op.
    const again = await grantConsejero(user, 'c4');
    expect(again).toBeNull();
  });
});
