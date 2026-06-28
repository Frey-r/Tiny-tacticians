/* ============================================================
   consejeroAbilities.ts — habilidad de combate de cada consejero.

   Tabla COMPARTIDA (sin imports de servidor) que asocia cada id de
   consejero del catálogo con la habilidad que desbloquea al cruzar el
   umbral de afinidad/bond durante una run (ver decisions/0011).
   - `balance.ts` deriva el mapa id->nombre para el desbloqueo.
   - `simulateBattle.ts` interpreta `kind`/`effect` para aplicar el proc.
   - `advisors.ts` (servidor) referencia esta misma tabla.
   ============================================================ */

/** Efecto de combate de una habilidad al procar. */
export type AbilityEffect =
  | { type: 'bonusDamage'; amount: number } // +daño este golpe (atacante)
  | { type: 'reduceIncoming'; amount: number } // -daño entrante (defensor)
  | { type: 'blockPct'; pct: number } // daño *= (1-pct) (defensor)
  | { type: 'ignoreMitigation' }; // suma de vuelta la mitigación del defensor (atacante)

export interface ConsejeroAbility {
  ability: string; // nombre mostrado (clave en general.abilities / abilityProcs)
  abilityKey: string; // clave estable
  kind: 'attacker' | 'defender'; // dónde se evalúa el proc
  effect: AbilityEffect;
}

/** id de consejero -> habilidad de combate. Orden estable c1..c9. */
export const CONSEJERO_ABILITIES: Record<string, ConsejeroAbility> = {
  c1: { ability: 'Lluvia de Flechas', abilityKey: 'volley', kind: 'attacker', effect: { type: 'bonusDamage', amount: 10 } },
  c2: { ability: 'Muro de Escudos', abilityKey: 'shieldwall', kind: 'defender', effect: { type: 'reduceIncoming', amount: 6 } },
  c3: { ability: 'Orden Táctica', abilityKey: 'tactics', kind: 'attacker', effect: { type: 'bonusDamage', amount: 6 } },
  c4: { ability: 'Carga de Lanzas', abilityKey: 'lancecharge', kind: 'attacker', effect: { type: 'bonusDamage', amount: 12 } },
  c5: { ability: 'Contención', abilityKey: 'hold', kind: 'defender', effect: { type: 'blockPct', pct: 0.5 } },
  c6: { ability: 'Emboscada', abilityKey: 'ambush', kind: 'attacker', effect: { type: 'bonusDamage', amount: 8 } },
  c7: { ability: 'Golpe de Ariete', abilityKey: 'ram', kind: 'attacker', effect: { type: 'ignoreMitigation' } },
  c8: { ability: 'Foso Defensivo', abilityKey: 'moat', kind: 'defender', effect: { type: 'reduceIncoming', amount: 8 } },
  c9: { ability: 'Sabotaje', abilityKey: 'sabotage', kind: 'attacker', effect: { type: 'bonusDamage', amount: 7 } },
};

/** Probabilidad de proc (uniforme: 1/6, una cara del d6). */
export const CONSEJERO_PROC_CHANCE = 1 / 6;

/** Lista en orden estable de id (para iterar deterministamente en combate). */
export const CONSEJERO_ABILITY_LIST: ConsejeroAbility[] = Object.keys(CONSEJERO_ABILITIES)
  .sort()
  .map((id) => CONSEJERO_ABILITIES[id]);
