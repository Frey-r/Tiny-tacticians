/* ============================================================
   army.ts — composición de ejército para el simulador 6v6.
   Puro y determinista a partir de `general.stats` (todos los
   espectadores ven el mismo ejército para un general dado).

   Mapeo afinidad → unidad:  OFE→Warrior, DEF→Lancer, MAN→Archer.
   Reparto de las 6 plazas por "largest remainder" sobre las stats.
   ============================================================ */
import type { General } from '../../shared/types/index.ts';

export type UnitType = 'warrior' | 'archer' | 'lancer';
export type UnitColor = 'blue' | 'red';

export const ARMY_SIZE = 6;

/** ¿La unidad ataca a distancia (dispara flechas)? */
export const RANGED: Record<UnitType, boolean> = {
  warrior: false,
  lancer: false,
  archer: true,
};

/** Altura de display en px por tipo (los frames del pack tienen distinto padding). */
export const UNIT_SIZE: Record<UnitType, number> = {
  warrior: 104,
  archer: 100,
  lancer: 150,
};

/** Clave de textura/animación registrada en BootScene (`cu_<tipo><Color>_<acción>`). */
export function animKey(type: UnitType, color: UnitColor, action: string): string {
  const cap = color === 'blue' ? 'Blue' : 'Red';
  return `cu_${type}${cap}_${action}`;
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
