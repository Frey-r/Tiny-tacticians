/* ============================================================
   consejeroAbilities.ts — re-export de las skills de combate.

   La fuente única es `consejeroCatalog.ts` (los 40 consejeros y sus
   skills COMPARTIDAS). Este módulo conserva el path de import estable
   para `simulateBattle.ts` y para `shared/sim/index.ts`.
   ============================================================ */
export {
  COMBAT_ABILITIES,
  CONSEJERO_ABILITY_LIST,
  CONSEJERO_PROC_CHANCE,
  CONSEJERO_ABILITY,
} from './consejeroCatalog.ts';
export type { AbilityEffect, ConsejeroAbility } from './consejeroCatalog.ts';
