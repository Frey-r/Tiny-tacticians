/* ============================================================
   scriptedBattle.ts — batalla determinista de la cinemática de intro.

   La "primera run" abre con una batalla dramatizada: un recluta SIN
   nivelar (stats base) enfrenta al jefe de la run y PIERDE. No es una
   run real (no toca el servidor): se construye aquí con el mismo motor
   determinista `simulateBattle`, y se visualiza (lento) en PvpCombatScene.
   ============================================================ */
import {
  simulateBattle,
  makeEnemyGeneral,
  calculatePower,
  calculateTier,
  BASE_STAT,
  BOSS_POWER,
  RUN_TURNS,
  SIM_VERSION,
} from '../../shared/sim/index.ts';
import type { BattleResult, General } from '../../shared/types/index.ts';

const INTRO_SEED = 'tut_intro_v1';

/** Recluta sin nivelar (stats base): es el `generalA` (bando azul) del jugador. */
function baseRecruit(): General {
  const stats = { ofe: BASE_STAT, def: BASE_STAT, man: BASE_STAT };
  return {
    id: 'tut_recruit',
    ownerId: 'tut', // no vacío: NO es un enemigo sintético; se pinta como bando azul
    name: 'Tu Recluta',
    stats,
    power: calculatePower(stats),
    tier: calculateTier(calculatePower(stats)),
    abilities: [],
    seed: INTRO_SEED,
    schemaVersion: SIM_VERSION,
    createdAt: 0,
  };
}

/**
 * Batalla scriptada de la intro: recluta base (power ~32) vs el jefe de la run
 * (`BOSS_POWER` = 110, se pinta como `warlord`/Minotaur). La brecha garantiza la
 * derrota; es determinista, así que el `winnerId` es siempre el enemigo.
 */
export function buildScriptedDefeat(): BattleResult {
  const player = baseRecruit();
  const boss = makeEnemyGeneral(INTRO_SEED, {
    index: 3,
    afterTurn: RUN_TURNS - 1,
    isBoss: true,
    power: BOSS_POWER,
    name: 'Señor de la Guerra',
  });
  return simulateBattle(`${INTRO_SEED}:boss`, player, boss);
}
