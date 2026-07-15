/* ============================================================
   consejeroCatalog.ts — FUENTE ÚNICA de los 40 consejeros.

   Reúne identidad (nombre/afinidad) + gameplay (arquetipo de
   entrenamiento, sesgo de activación, efecto de run) + la skill de
   combate COMPARTIDA. Tabla sin imports de servidor para que cliente,
   servidor y validación resuelvan lo mismo por id.

   - `balance.ts` deriva la activación y el modificador de dado por
     arquetipo; `stepRun.ts` aplica efectos de run y bond.
   - `consejeroAbilities.ts` re-exporta las skills de combate (los
     mismos `kind/effect` que interpreta `simulateBattle.ts`).
   - `server/core/advisors.ts` deriva su catálogo de identidad de aquí.

   Diseño (ver decisions/0012): los 40 pueden COMPARTIR skill de combate;
   se diferencian por su PROBABILIDAD de activarse (activationBias) y por
   el EFECTO que detonan en la run (runEffectId). c1..c9 conservan su
   identidad previa (usuarios existentes ya los poseen en Redis).
   ============================================================ */
import { Affinity } from '../types/index.ts';

/* ---- Skills de combate (COMPARTIDAS, reusadas por los 40) -------- */

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

/** Catálogo de skills de combate por `abilityKey`. Orden estable de declaración. */
export const COMBAT_ABILITIES: Record<string, ConsejeroAbility> = {
  volley: { ability: 'Arrow Volley', abilityKey: 'volley', kind: 'attacker', effect: { type: 'bonusDamage', amount: 10 } },
  shieldwall: { ability: 'Shield Wall', abilityKey: 'shieldwall', kind: 'defender', effect: { type: 'reduceIncoming', amount: 6 } },
  tactics: { ability: 'Tactical Order', abilityKey: 'tactics', kind: 'attacker', effect: { type: 'bonusDamage', amount: 6 } },
  lancecharge: { ability: 'Lance Charge', abilityKey: 'lancecharge', kind: 'attacker', effect: { type: 'bonusDamage', amount: 12 } },
  hold: { ability: 'Hold the Line', abilityKey: 'hold', kind: 'defender', effect: { type: 'blockPct', pct: 0.5 } },
  ambush: { ability: 'Ambush', abilityKey: 'ambush', kind: 'attacker', effect: { type: 'bonusDamage', amount: 8 } },
  ram: { ability: 'Battering Ram', abilityKey: 'ram', kind: 'attacker', effect: { type: 'ignoreMitigation' } },
  moat: { ability: 'Defensive Moat', abilityKey: 'moat', kind: 'defender', effect: { type: 'reduceIncoming', amount: 8 } },
  sabotage: { ability: 'Sabotage', abilityKey: 'sabotage', kind: 'attacker', effect: { type: 'bonusDamage', amount: 7 } },
};

/** Probabilidad de proc de skill en combate (uniforme: 1/6, una cara del d6). */
export const CONSEJERO_PROC_CHANCE = 1 / 6;

/** Lista ÚNICA de skills (una por `abilityKey`), orden estable, para iterar en combate.
 *  Combate resuelve por NOMBRE (general.abilities), así que esta lista NO debe repetir
 *  habilidades aunque varios consejeros compartan la misma. */
export const CONSEJERO_ABILITY_LIST: ConsejeroAbility[] = Object.keys(COMBAT_ABILITIES).map(
  (k) => COMBAT_ABILITIES[k]
);

/* ---- Arquetipos de entrenamiento (cómo reforman el dado) -------- */
//  maestro    — polariza: más CRÍTICO y más FALLO (alto riesgo / "closer").
//  alquimista — estabiliza: casi nunca falla, pero BLOQUEA el crítico (cara máxima).
//  intendente — eficiencia: dado casi neutro; reembolsa energía y regala stat secundaria.
export type TrainStyle = 'maestro' | 'alquimista' | 'intendente';

/* ---- Efectos de run (el diferenciador: "qué detonan en la run") --
   Cuando un consejero con `runEffectId` está ACTIVO en un turno de
   entrenamiento, su efecto se pliega al turno de forma determinista.
   - failMaxDelta/critMinDelta reforman los umbrales SOLO ese turno.
   - energyRefund se descuenta del coste; secondaryGain se suma en éxito.
   - bondBonus añade bond extra a ESE consejero. */
export type RunEffectId =
  | 'energiaPrevista'
  | 'vinculoFervido'
  | 'botinDeGuerra'
  | 'segundaIntencion'
  | 'ojoCritico';

export interface RunEffectDef {
  id: RunEffectId;
  label: string;
  failMaxDelta?: number; // <0 = menos fallo este turno
  critMinDelta?: number; // <0 = más crítico este turno
  energyRefund?: number; // energía devuelta este turno
  secondaryGain?: number; // +stat secundaria en éxito
  bondBonus?: number; // bond extra para este consejero
}

export const RUN_EFFECTS: Record<RunEffectId, RunEffectDef> = {
  energiaPrevista: { id: 'energiaPrevista', label: 'Foresight Logistics', energyRefund: 6 },
  vinculoFervido: { id: 'vinculoFervido', label: 'Fervent Loyalty', bondBonus: 2 },
  botinDeGuerra: { id: 'botinDeGuerra', label: 'War Spoils', secondaryGain: 2 },
  segundaIntencion: { id: 'segundaIntencion', label: 'Second Intent', failMaxDelta: -1 },
  ojoCritico: { id: 'ojoCritico', label: 'Critical Eye', critMinDelta: -1 },
};

/* ---- Definición de un consejero -------------------------------- */
export interface ConsejeroDef {
  id: string;
  name: string;
  affinity: Affinity;
  trainStyle: TrainStyle;
  /** Sesgo a la rampa de activación (−0.2..+0.2): fiables vs volátiles. */
  activationBias: number;
  /** Efecto que detona en la run cuando está activo (o null). */
  runEffectId: RunEffectId | null;
  /** Skill de combate compartida que desbloquea por bond. */
  abilityKey: string;
}

// Filas: [id, name, affinity, trainStyle, abilityKey, activationBias, runEffectId]
type Row = [string, string, Affinity, TrainStyle, string, number, RunEffectId | null];

// Mapeo canónico afinidad→arquetipo (Maestro↔OFE, Intendente↔DEF, Alquimista↔MAN).
// c1..c9 conservan identidad previa; c10..c40 amplían el pool (algunos "cruzados").
const ROWS: Row[] = [
  // --- 3 iniciales (todo usuario los posee) ---
  ['c1', 'War Advisor', 'OFE', 'maestro', 'volley', 0.0, null],
  ['c2', 'Wall Mason', 'DEF', 'intendente', 'shieldwall', 0.1, 'energiaPrevista'],
  ['c3', 'Master of Coin', 'MAN', 'alquimista', 'tactics', 0.05, 'botinDeGuerra'],
  // --- 6 adquiribles "clásicos" ---
  ['c4', 'Vanguard Captain', 'OFE', 'maestro', 'lancecharge', -0.1, 'ojoCritico'],
  ['c5', 'Gate Sentinel', 'DEF', 'intendente', 'hold', 0.15, 'energiaPrevista'],
  ['c6', 'Royal Cartographer', 'MAN', 'alquimista', 'ambush', 0.05, 'segundaIntencion'],
  ['c7', 'Siege Executioner', 'OFE', 'maestro', 'ram', -0.15, 'ojoCritico'],
  ['c8', 'Moat Warden', 'DEF', 'intendente', 'moat', 0.1, 'vinculoFervido'],
  ['c9', 'Court Spy', 'MAN', 'alquimista', 'sabotage', 0.0, 'botinDeGuerra'],
  // --- 31 nuevos (framework + curado; comparten skills, difieren en activación/efecto) ---
  ['c10', 'Iron Marshal', 'OFE', 'maestro', 'lancecharge', -0.05, null],
  ['c11', 'Lancer Sergeant', 'OFE', 'intendente', 'volley', 0.15, 'energiaPrevista'],
  ['c12', 'Dawn Herald', 'MAN', 'alquimista', 'tactics', 0.1, 'segundaIntencion'],
  ['c13', 'Royal Bombardier', 'OFE', 'maestro', 'ram', -0.2, 'ojoCritico'],
  ['c14', 'Shadow Ranger', 'MAN', 'maestro', 'ambush', -0.1, 'ojoCritico'],
  ['c15', 'Spymistress', 'MAN', 'alquimista', 'sabotage', 0.05, 'botinDeGuerra'],
  ['c16', 'Rampart Commander', 'DEF', 'intendente', 'shieldwall', 0.2, 'energiaPrevista'],
  ['c17', 'Beast Tamer', 'OFE', 'maestro', 'volley', -0.1, 'vinculoFervido'],
  ['c18', 'Veteran Gunner', 'OFE', 'alquimista', 'ram', 0.05, null],
  ['c19', 'Night Sentinel', 'DEF', 'intendente', 'hold', 0.15, 'segundaIntencion'],
  ['c20', 'Mist Strategist', 'MAN', 'alquimista', 'tactics', 0.1, 'botinDeGuerra'],
  ['c21', 'Crimson Executioner', 'OFE', 'maestro', 'lancecharge', -0.2, 'ojoCritico'],
  ['c22', 'Siege Engineer', 'DEF', 'intendente', 'moat', 0.2, 'energiaPrevista'],
  ['c23', 'Corsair Captain', 'OFE', 'maestro', 'ambush', -0.05, 'vinculoFervido'],
  ['c24', 'Field Medic', 'DEF', 'intendente', 'shieldwall', 0.15, 'vinculoFervido'],
  ['c25', 'Thunder Lancer', 'OFE', 'maestro', 'lancecharge', -0.1, null],
  ['c26', 'Tower Watcher', 'DEF', 'alquimista', 'hold', 0.1, 'segundaIntencion'],
  ['c27', 'Wandering Cartographer', 'MAN', 'alquimista', 'sabotage', 0.05, 'botinDeGuerra'],
  ['c28', 'Northern Barbarian', 'OFE', 'maestro', 'ram', -0.2, 'ojoCritico'],
  ['c29', 'Moat Custodian', 'DEF', 'intendente', 'moat', 0.2, 'energiaPrevista'],
  ['c30', 'Elven Sharpshooter', 'MAN', 'maestro', 'volley', -0.1, 'ojoCritico'],
  ['c31', 'One-Eyed Mercenary', 'OFE', 'maestro', 'sabotage', -0.15, 'vinculoFervido'],
  ['c32', 'Warrior Abbess', 'MAN', 'alquimista', 'tactics', 0.1, 'segundaIntencion'],
  ['c33', 'Steppe Rider', 'OFE', 'maestro', 'lancecharge', -0.05, null],
  ['c34', 'Shield Forger', 'DEF', 'intendente', 'shieldwall', 0.2, 'energiaPrevista'],
  ['c35', 'Royal Swordsman', 'OFE', 'maestro', 'ambush', -0.1, 'ojoCritico'],
  ['c36', 'War Alchemist', 'MAN', 'alquimista', 'tactics', 0.15, 'botinDeGuerra'],
  ['c37', 'Bridge Warden', 'DEF', 'intendente', 'hold', 0.2, 'vinculoFervido'],
  ['c38', 'Silent Saboteur', 'MAN', 'alquimista', 'sabotage', 0.0, 'segundaIntencion'],
  ['c39', 'Southern Marshal', 'MAN', 'intendente', 'tactics', 0.1, 'energiaPrevista'],
  ['c40', 'Veteran of a Hundred Battles', 'DEF', 'maestro', 'moat', -0.1, 'ojoCritico'],
];

export const CONSEJERO_CATALOG: ConsejeroDef[] = ROWS.map(
  ([id, name, affinity, trainStyle, abilityKey, activationBias, runEffectId]) => ({
    id,
    name,
    affinity,
    trainStyle,
    abilityKey,
    activationBias,
    runEffectId,
  })
);

const BY_ID: Record<string, ConsejeroDef> = Object.fromEntries(
  CONSEJERO_CATALOG.map((d) => [d.id, d])
);

/** Definición sintética para ids fuera del catálogo (tests/mock). Neutral y determinista. */
function fallbackDef(id: string): ConsejeroDef {
  return { id, name: id, affinity: 'OFE', trainStyle: 'intendente', activationBias: 0, runEffectId: null, abilityKey: '' };
}

/** Resuelve la definición de gameplay de un consejero por id (O(1)). */
export function consejeroDef(id: string): ConsejeroDef {
  return BY_ID[id] ?? fallbackDef(id);
}

/** Skill de combate (nombre) que desbloquea cada consejero, por id. */
export const CONSEJERO_ABILITY: Record<string, string> = Object.fromEntries(
  CONSEJERO_CATALOG.map((d) => [d.id, COMBAT_ABILITIES[d.abilityKey]?.ability ?? ''])
);

/** Ids iniciales (todo usuario nuevo arranca con estos 3). */
export const DEFAULT_CONSEJERO_IDS = ['c1', 'c2', 'c3'] as const;
