import { describe, it, expect } from 'vitest';
import {
  getContracts,
  grantContract,
  contractColorForModifier,
  requestDailyLoan,
  unlockWithContract,
  getRecruitmentState,
  CONTRACT_UNLOCK_GOLD,
} from '../src/server/core/recruitment.ts';
import { getUserProfile, getUserConsejeros } from '../src/server/core/rewards.ts';

describe('recruitment — contratos', () => {
  it('getContracts defaults to zero', async () => {
    expect(await getContracts('t2_rec_zero')).toEqual({ white: 0, red: 0, blue: 0, purple: 0 });
  });

  it('grantContract increments by color', async () => {
    const u = 't2_rec_grant';
    await grantContract(u, 'red');
    await grantContract(u, 'red');
    await grantContract(u, 'white');
    const c = await getContracts(u);
    expect(c.red).toBe(2);
    expect(c.white).toBe(1);
    expect(c.blue).toBe(0);
  });

  it('contractColorForModifier maps the daily modifiers (horda/unknown = white)', () => {
    expect(contractColorForModifier('mod_cab')).toBe('red');
    expect(contractColorForModifier('mod_mur')).toBe('blue');
    expect(contractColorForModifier('mod_man')).toBe('purple');
    expect(contractColorForModifier('mod_horda')).toBe('white');
    expect(contractColorForModifier('???')).toBe('white');
  });
});

describe('recruitment — petición diaria (préstamo temporal)', () => {
  it('grants a temporary loan, exposes it as usable, and blocks a second request', async () => {
    const u = 't2_rec_loan';
    await getUserProfile(u);
    const adv = await requestDailyLoan(u);
    expect(adv.temporary).toBe(true);
    expect(['c4', 'c5', 'c6', 'c7', 'c8', 'c9']).toContain(adv.id);

    const list = await getUserConsejeros(u);
    expect(list.some((c) => c.id === adv.id && c.temporary)).toBe(true);

    await expect(requestDailyLoan(u)).rejects.toThrow('LOAN_ACTIVE');
  });
});

describe('recruitment — desbloqueo con contrato', () => {
  it('rejects unlock without a contract', async () => {
    const u = 't2_rec_nocontract';
    await getUserProfile(u);
    await expect(unlockWithContract(u, 'c6', 'purple')).rejects.toThrow('NO_CONTRACT');
  });

  it('rejects a color that does not match the affinity', async () => {
    const u = 't2_rec_mismatch';
    await getUserProfile(u);
    await expect(unlockWithContract(u, 'c4', 'blue')).rejects.toThrow('CONTRACT_MISMATCH'); // c4 = OFE
  });

  it('unlocks permanently spending a matching contract + gold, then blocks re-unlock', async () => {
    const u = 't2_rec_unlock';
    const before = await getUserProfile(u); // 1000 oro
    await grantContract(u, 'red'); // c4 = OFE -> rojo
    const res = await unlockWithContract(u, 'c4', 'red');
    expect(res.advisor.id).toBe('c4');
    expect(res.newGold).toBe(before.gold - CONTRACT_UNLOCK_GOLD);
    expect(res.contracts.red).toBe(0);

    const list = await getUserConsejeros(u);
    expect(list.some((c) => c.id === 'c4' && !c.temporary)).toBe(true);

    await grantContract(u, 'red');
    await expect(unlockWithContract(u, 'c4', 'red')).rejects.toThrow('ALREADY_OWNED');
  });

  it('white contract is a wildcard for any affinity', async () => {
    const u = 't2_rec_white';
    await getUserProfile(u);
    await grantContract(u, 'white');
    const res = await unlockWithContract(u, 'c5', 'white'); // c5 = DEF
    expect(res.advisor.id).toBe('c5');
  });

  it('getRecruitmentState reflects gold, contracts and the acquirable catalog', async () => {
    const u = 't2_rec_state';
    await getUserProfile(u);
    await grantContract(u, 'blue');
    const s = await getRecruitmentState(u);
    expect(s.contracts.blue).toBe(1);
    expect(s.unlockCost).toBe(CONTRACT_UNLOCK_GOLD);
    expect(s.candidates).toHaveLength(6); // c4..c9
    expect(s.candidates.every((c) => !c.owned)).toBe(true);
    expect(s.loanAvailable).toBe(true);
  });
});
