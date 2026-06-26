import { General, BattleResult, BattleRound } from '../types/index.ts';
import { PRNG } from './prng.ts';

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
    let logMsg = `${activeAttacker.name} ataca a ${activeDefender.name}.`;
    let crit = false;
    let blocked = false;
    const abilityProcs: string[] = [];

    // 2. Process Attacker Abilities
    // Carga Devastadora: 20% chance of double damage
    if (activeAttacker.abilities.includes('Carga Devastadora')) {
      if (prng.nextInt(1, 5) === 1) {
        damage *= 2;
        crit = true;
        abilityProcs.push('Carga Devastadora');
        logMsg += ` ¡Activa [Carga Devastadora] y causa el doble de daño!`;
      }
    } else if (activeAttacker.abilities.includes('Furia de Combate')) {
      damage += 5;
      abilityProcs.push('Furia de Combate');
      logMsg += ` ¡Bono por [Furia de Combate] (+5 daño)!`;
    }

    // Grito de Mando: 15% chance to confuse defender, reducing their next round defense
    // (We model this as dealing +8 damage this round)
    if (activeAttacker.abilities.includes('Grito de Mando') && prng.nextInt(1, 100) <= 15) {
      damage += 8;
      abilityProcs.push('Grito de Mando');
      logMsg += ` ¡El [Grito de Mando] amedrenta al rival (+8 daño)!`;
    }

    // 3. Process Defender Abilities
    // Escudo Inquebrantable: 20% chance of blocking 80% of damage
    if (activeDefender.abilities.includes('Escudo Inquebrantable')) {
      if (prng.nextInt(1, 5) === 1) {
        damage = Math.max(1, Math.floor(damage * 0.2));
        blocked = true;
        abilityProcs.push('Escudo Inquebrantable');
        logMsg += ` ¡${activeDefender.name} activa [Escudo Inquebrantable] y bloquea el 80% del golpe!`;
      }
    } else if (activeDefender.abilities.includes('Baluarte Férreo')) {
      damage = Math.max(1, damage - 4);
      abilityProcs.push('Baluarte Férreo');
      logMsg += ` ¡${activeDefender.name} absorbe daño con [Baluarte Férreo] (-4 daño)!`;
    }

    damage = Math.floor(damage);
    activeDefenderHp = Math.max(0, activeDefenderHp - damage);
    const lethal = activeDefenderHp <= 0;

    logMsg += ` Daño infligido: ${damage}. HP de ${activeDefender.name} restante: ${activeDefenderHp}/${activeDefenderMaxHp}.`;

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
