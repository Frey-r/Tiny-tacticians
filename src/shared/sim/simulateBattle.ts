import { General, BattleResult, BattleRound } from '../types/index.ts';
import { PRNG } from './prng.ts';
import { rollDice } from './dice.ts';
import { buildAbilityRoll } from './balance.ts';
import { CONSEJERO_ABILITY_LIST, CONSEJERO_PROC_CHANCE, AbilityEffect } from './consejeroAbilities.ts';

/** ¿Proca una habilidad con probabilidad `p`? Una tirada de dado (banda CRÍTICO). */
function procs(prng: PRNG, p: number): boolean {
  return rollDice(prng, buildAbilityRoll(p)).band === 'CRITICO';
}

function applyAttackerEffect(damage: number, effect: AbilityEffect, mitigation: number): number {
  switch (effect.type) {
    case 'bonusDamage':
      return damage + effect.amount;
    case 'ignoreMitigation':
      return damage + mitigation; // recupera la mitigación que el defensor había restado
    default:
      return damage;
  }
}

function applyDefenderEffect(damage: number, effect: AbilityEffect): number {
  switch (effect.type) {
    case 'reduceIncoming':
      return Math.max(1, damage - effect.amount);
    case 'blockPct':
      return Math.max(1, Math.floor(damage * (1 - effect.pct)));
    default:
      return damage;
  }
}

export function simulateBattle(seed: string, generalA: General, generalB: General): BattleResult {
  const prng = new PRNG(seed);

  // Calculate HP
  // HP = 100 + DEF * 3 + MAN * 2
  let hpA = 100 + generalA.stats.def * 3 + generalA.stats.man * 2;
  let hpB = 100 + generalB.stats.def * 3 + generalB.stats.man * 2;

  const maxHpA = hpA;
  const maxHpB = hpB;

  // Determine Initiative: Higher Mando goes first.
  let p1: General;
  let p2: General;
  let hp1: number;
  let hp2: number;
  let maxHp1: number;
  let maxHp2: number;

  if (generalA.stats.man > generalB.stats.man) {
    p1 = generalA;
    p2 = generalB;
  } else if (generalB.stats.man > generalA.stats.man) {
    p1 = generalB;
    p2 = generalA;
  } else {
    // Tie breaker
    if (prng.nextInt(0, 1) === 0) {
      p1 = generalA;
      p2 = generalB;
    } else {
      p1 = generalB;
      p2 = generalA;
    }
  }

  if (p1.id === generalA.id) {
    hp1 = hpA;
    hp2 = hpB;
    maxHp1 = maxHpA;
    maxHp2 = maxHpB;
  } else {
    hp1 = hpB;
    hp2 = hpA;
    maxHp1 = maxHpB;
    maxHp2 = maxHpA;
  }

  const rounds: BattleRound[] = [];
  let roundNum = 1;
  const maxRounds = 30; // maximum rounds before fallback resolution

  let activeAttacker = p1;
  let activeDefender = p2;
  let activeAttackerHp = hp1;
  let activeDefenderHp = hp2;
  let activeAttackerMaxHp = maxHp1;
  let activeDefenderMaxHp = maxHp2;

  while (activeAttackerHp > 0 && activeDefenderHp > 0 && roundNum <= maxRounds) {
    const atkHpBefore = activeAttackerHp;
    const defHpBefore = activeDefenderHp;

    // 1. Calculate Damage
    // Base damage: OFE + [5 to 15]
    const baseDamage = activeAttacker.stats.ofe + prng.nextInt(5, 15);
    // Defense mitigation: DEF * 0.4
    const mitigation = Math.floor(activeDefender.stats.def * 0.4);

    let damage = Math.max(2, baseDamage - mitigation);
    let logMsg = `${activeAttacker.name} attacks ${activeDefender.name}.`;
    let crit = false;
    let blocked = false;
    const abilityProcs: string[] = [];

    // 2. Process Attacker Abilities
    // Devastating Charge: ~20% (one die) for double damage
    if (activeAttacker.abilities.includes('Devastating Charge')) {
      if (procs(prng, 0.2)) {
        damage *= 2;
        crit = true;
        abilityProcs.push('Devastating Charge');
        logMsg += ` Triggers [Devastating Charge] and deals double damage!`;
      }
    } else if (activeAttacker.abilities.includes('Battle Fury')) {
      damage += 5;
      abilityProcs.push('Battle Fury');
      logMsg += ` [Battle Fury] bonus (+5 damage)!`;
    }

    // Command Shout: ~15% (one die) for +8 damage
    if (activeAttacker.abilities.includes('Command Shout') && procs(prng, 0.15)) {
      damage += 8;
      abilityProcs.push('Command Shout');
      logMsg += ` [Command Shout] rattles the foe (+8 damage)!`;
    }

    // Habilidades de consejero del ATACANTE (desbloqueadas por afinidad; proc 1/6 vía dado).
    for (const ab of CONSEJERO_ABILITY_LIST) {
      if (ab.kind !== 'attacker' || !activeAttacker.abilities.includes(ab.ability)) continue;
      if (procs(prng, CONSEJERO_PROC_CHANCE)) {
        damage = applyAttackerEffect(damage, ab.effect, mitigation);
        abilityProcs.push(ab.ability);
        logMsg += ` ${activeAttacker.name} triggers [${ab.ability}]!`;
      }
    }

    // 3. Process Defender Abilities
    // Unbreakable Shield: ~20% (one die) to block 80% of the damage
    if (activeDefender.abilities.includes('Unbreakable Shield')) {
      if (procs(prng, 0.2)) {
        damage = Math.max(1, Math.floor(damage * 0.2));
        blocked = true;
        abilityProcs.push('Unbreakable Shield');
        logMsg += ` ${activeDefender.name} raises [Unbreakable Shield] and blocks 80% of the hit!`;
      }
    } else if (activeDefender.abilities.includes('Iron Bulwark')) {
      damage = Math.max(1, damage - 4);
      abilityProcs.push('Iron Bulwark');
      logMsg += ` ${activeDefender.name} absorbs damage with [Iron Bulwark] (-4 damage)!`;
    }

    // Habilidades de consejero del DEFENSOR (desbloqueadas por afinidad; proc 1/6 vía dado).
    for (const ab of CONSEJERO_ABILITY_LIST) {
      if (ab.kind !== 'defender' || !activeDefender.abilities.includes(ab.ability)) continue;
      if (procs(prng, CONSEJERO_PROC_CHANCE)) {
        damage = applyDefenderEffect(damage, ab.effect);
        blocked = true;
        abilityProcs.push(ab.ability);
        logMsg += ` ${activeDefender.name} resists with [${ab.ability}]!`;
      }
    }

    damage = Math.floor(damage);
    activeDefenderHp = Math.max(0, activeDefenderHp - damage);
    const lethal = activeDefenderHp <= 0;

    logMsg += ` Damage dealt: ${damage}. ${activeDefender.name} HP left: ${activeDefenderHp}/${activeDefenderMaxHp}.`;

    rounds.push({
      round: roundNum,
      attackerId: activeAttacker.id,
      defenderId: activeDefender.id,
      attackerHpBefore: atkHpBefore,
      defenderHpBefore: defHpBefore,
      damage,
      attackerHpAfter: activeAttackerHp,
      defenderHpAfter: activeDefenderHp,
      log: logMsg,
      crit,
      blocked,
      abilityProcs,
      lethal,
    });

    if (activeDefenderHp <= 0) {
      break;
    }

    // Swap roles
    const tempAtk = activeAttacker;
    const tempAtkHp = activeAttackerHp;
    const tempAtkMax = activeAttackerMaxHp;

    activeAttacker = activeDefender;
    activeAttackerHp = activeDefenderHp;
    activeAttackerMaxHp = activeDefenderMaxHp;

    activeDefender = tempAtk;
    activeDefenderHp = tempAtkHp;
    activeDefenderMaxHp = tempAtkMax;

    roundNum++;
  }

  // Determine winner
  let winnerId = '';
  if (generalA.id === activeAttacker.id) {
    // activeAttacker was active at the end
    winnerId = activeDefenderHp <= 0 ? activeAttacker.id : activeDefender.id;
  } else {
    winnerId = activeDefenderHp <= 0 ? activeAttacker.id : activeDefender.id;
  }

  // Fallback tie-breaker if rounds exhausted
  if (roundNum > maxRounds && activeAttackerHp > 0 && activeDefenderHp > 0) {
    // Whoever has higher absolute remaining HP wins, otherwise general with higher power.
    // We map them back to General A and B remaining HP
    let finalHpA = generalA.id === activeAttacker.id ? activeAttackerHp : activeDefenderHp;
    let finalHpB = generalB.id === activeAttacker.id ? activeAttackerHp : activeDefenderHp;

    if (finalHpA > finalHpB) {
      winnerId = generalA.id;
    } else if (finalHpB > finalHpA) {
      winnerId = generalB.id;
    } else {
      winnerId = generalA.power >= generalB.power ? generalA.id : generalB.id;
    }
  }

  return {
    battleId: `bat_${seed.substring(0, 8)}_${prng.nextInt(1000, 9999)}`,
    winnerId,
    rounds,
    seed,
    generalA,
    generalB,
  };
}
