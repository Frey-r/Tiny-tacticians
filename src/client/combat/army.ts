/* ============================================================
   army.ts — composición de ejército para el simulador 6v6.
   Puro y determinista a partir de `general.stats` (todos los
   espectadores ven el mismo ejército para un general dado).

   Mapeo afinidad → unidad:  OFE→Warrior, DEF→Lancer, MAN→Archer.
   Reparto de las 6 plazas por "largest remainder" sobre las stats.
   ============================================================ */
import type { General } from '../../shared/types/index.ts';
import { BOSS_POWER } from '../../shared/sim/index.ts';
import type { EnemyFaction } from '../assets.ts';

export type UnitType = 'warrior' | 'archer' | 'lancer';
export type UnitColor = 'blue' | 'red';
export type { EnemyFaction };
/** Piel de sprite de una unidad: humana (PvP real) o criatura (PvE sintético). */
export type Faction = UnitColor | EnemyFaction;

export const ARMY_SIZE = 6;

/** ¿La unidad ataca a distancia (dispara flechas)? Depende de la facción: no
 *  toda criatura del pack `Enemies` tiene un ataque a distancia. */
const ARCHER_RANGED_BY_FACTION: Record<Faction, boolean> = {
  blue: true,
  red: true,
  goblin: true, // Hex Shaman
  undead: true, // Gnoll (Throw)
  beast: false, // Lizard solo tiene ataque cuerpo a cuerpo
  warlord: false, // Minotaur solo tiene ataque cuerpo a cuerpo
};

/** ¿Esta unidad (rol + facción) ataca a distancia? Solo el rol `archer` puede. */
export function isRangedUnit(type: UnitType, faction: Faction): boolean {
  return type === 'archer' && ARCHER_RANGED_BY_FACTION[faction];
}

/** Altura de display en px por tipo (los frames del pack tienen distinto padding). */
export const UNIT_SIZE: Record<UnitType, number> = {
  warrior: 104,
  archer: 100,
  lancer: 150,
};

/** Clave de textura/animación registrada (`cu_<tipo><Facción>_<acción>`). */
export function animKey(type: UnitType, faction: Faction, action: string): string {
  const cap = faction[0].toUpperCase() + faction.slice(1);
  return `cu_${type}${cap}_${action}`;
}

/** ¿El General es un enemigo sintético (encuentro de run / reto diario), no otro jugador? */
export function isSyntheticEnemy(general: General): boolean {
  return general.ownerId === '' || general.ownerId === 'daily';
}

/** Facción visual de un enemigo sintético, derivada de sus stats/power (sin
 *  campos nuevos en el General: el jefe siempre cae en `warlord` porque su
 *  power iguala BOSS_POWER; el resto se reparte por la stat dominante). */
export function factionForEnemy(general: General): EnemyFaction {
  if (general.power >= BOSS_POWER) return 'warlord';
  const { ofe, def, man } = general.stats;
  if (ofe >= def && ofe >= man) return 'goblin';
  if (def >= ofe && def >= man) return 'beast';
  return 'undead';
}

/** Compone las 6 unidades de un general según su perfil de stats. */
export function deriveArmy(general: General): UnitType[] {
  const { ofe, def, man } = general.stats;
  const weights: { t: UnitType; w: number }[] = [
    { t: 'warrior', w: ofe },
    { t: 'lancer', w: def },
    { t: 'archer', w: man },
  ];
  const total = ofe + def + man || 1;

  // Cuota exacta → base por truncamiento + reparto de restos mayores.
  const slots = weights.map((x) => {
    const exact = (x.w / total) * ARMY_SIZE;
    const n = Math.floor(exact);
    return { t: x.t, n, rem: exact - n };
  });
  let assigned = slots.reduce((s, x) => s + x.n, 0);
  const byRem = [...slots].sort((a, b) => b.rem - a.rem);
  let i = 0;
  while (assigned < ARMY_SIZE) {
    byRem[i % byRem.length].n++;
    assigned++;
    i++;
  }

  // Orden visual: melee al frente (warrior, lancer), arquero atrás.
  const out: UnitType[] = [];
  for (const t of ['warrior', 'lancer', 'archer'] as UnitType[]) {
    const s = slots.find((x) => x.t === t)!;
    for (let k = 0; k < s.n; k++) out.push(t);
  }
  return out;
}
