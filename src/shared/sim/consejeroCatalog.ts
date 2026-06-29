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
  volley: { ability: 'Lluvia de Flechas', abilityKey: 'volley', kind: 'attacker', effect: { type: 'bonusDamage', amount: 10 } },
  shieldwall: { ability: 'Muro de Escudos', abilityKey: 'shieldwall', kind: 'defender', effect: { type: 'reduceIncoming', amount: 6 } },
  tactics: { ability: 'Orden Táctica', abilityKey: 'tactics', kind: 'attacker', effect: { type: 'bonusDamage', amount: 6 } },
  lancecharge: { ability: 'Carga de Lanzas', abilityKey: 'lancecharge', kind: 'attacker', effect: { type: 'bonusDamage', amount: 12 } },
  hold: { ability: 'Contención', abilityKey: 'hold', kind: 'defender', effect: { type: 'blockPct', pct: 0.5 } },
  ambush: { ability: 'Emboscada', abilityKey: 'ambush', kind: 'attacker', effect: { type: 'bonusDamage', amount: 8 } },
  ram: { ability: 'Golpe de Ariete', abilityKey: 'ram', kind: 'attacker', effect: { type: 'ignoreMitigation' } },
  moat: { ability: 'Foso Defensivo', abilityKey: 'moat', kind: 'defender', effect: { type: 'reduceIncoming', amount: 8 } },
  sabotage: { ability: 'Sabotaje', abilityKey: 'sabotage', kind: 'attacker', effect: { type: 'bonusDamage', amount: 7 } },
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
  energiaPrevista: { id: 'energiaPrevista', label: 'Logística Previsora', energyRefund: 6 },
  vinculoFervido: { id: 'vinculoFervido', label: 'Lealtad Fervorosa', bondBonus: 2 },
  botinDeGuerra: { id: 'botinDeGuerra', label: 'Botín de Guerra', secondaryGain: 3 },
  segundaIntencion: { id: 'segundaIntencion', label: 'Segunda Intención', failMaxDelta: -1 },
  ojoCritico: { id: 'ojoCritico', label: 'Ojo Crítico', critMinDelta: -1 },
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
  ['c1', 'Consejero de Guerra', 'OFE', 'maestro', 'volley', 0.0, null],
  ['c2', 'Albañil del Muro', 'DEF', 'intendente', 'shieldwall', 0.1, 'energiaPrevista'],
  ['c3', 'Maestre de Cuentas', 'MAN', 'alquimista', 'tactics', 0.05, 'botinDeGuerra'],
  // --- 6 adquiribles "clásicos" ---
  ['c4', 'Capitán de la Vanguardia', 'OFE', 'maestro', 'lancecharge', -0.1, 'ojoCritico'],
  ['c5', 'Centinela de la Puerta', 'DEF', 'intendente', 'hold', 0.15, 'energiaPrevista'],
  ['c6', 'Cartógrafa Real', 'MAN', 'alquimista', 'ambush', 0.05, 'segundaIntencion'],
  ['c7', 'Verdugo de Asedios', 'OFE', 'maestro', 'ram', -0.15, 'ojoCritico'],
  ['c8', 'Guardiana del Foso', 'DEF', 'intendente', 'moat', 0.1, 'vinculoFervido'],
  ['c9', 'Espía de la Corte', 'MAN', 'alquimista', 'sabotage', 0.0, 'botinDeGuerra'],
  // --- 31 nuevos (framework + curado; comparten skills, difieren en activación/efecto) ---
  ['c10', 'Mariscal de Hierro', 'OFE', 'maestro', 'lancecharge', -0.05, null],
  ['c11', 'Sargenta de Lanceros', 'OFE', 'intendente', 'volley', 0.15, 'energiaPrevista'],
  ['c12', 'Heraldo del Alba', 'MAN', 'alquimista', 'tactics', 0.1, 'segundaIntencion'],
  ['c13', 'Bombardero Real', 'OFE', 'maestro', 'ram', -0.2, 'ojoCritico'],
  ['c14', 'Guardabosques Sombrío', 'MAN', 'maestro', 'ambush', -0.1, 'ojoCritico'],
  ['c15', 'Maestra de Espías', 'MAN', 'alquimista', 'sabotage', 0.05, 'botinDeGuerra'],
  ['c16', 'Comandante de Murallas', 'DEF', 'intendente', 'shieldwall', 0.2, 'energiaPrevista'],
  ['c17', 'Domadora de Bestias', 'OFE', 'maestro', 'volley', -0.1, 'vinculoFervido'],
  ['c18', 'Artillero Veterano', 'OFE', 'alquimista', 'ram', 0.05, null],
  ['c19', 'Centinela Nocturna', 'DEF', 'intendente', 'hold', 0.15, 'segundaIntencion'],
  ['c20', 'Estratega de la Niebla', 'MAN', 'alquimista', 'tactics', 0.1, 'botinDeGuerra'],
  ['c21', 'Verdugo Carmesí', 'OFE', 'maestro', 'lancecharge', -0.2, 'ojoCritico'],
  ['c22', 'Ingeniera de Asedio', 'DEF', 'intendente', 'moat', 0.2, 'energiaPrevista'],
  ['c23', 'Capitán Corsario', 'OFE', 'maestro', 'ambush', -0.05, 'vinculoFervido'],
  ['c24', 'Curandera de Campaña', 'DEF', 'intendente', 'shieldwall', 0.15, 'vinculoFervido'],
  ['c25', 'Lancero del Trueno', 'OFE', 'maestro', 'lancecharge', -0.1, null],
  ['c26', 'Vigía de la Torre', 'DEF', 'alquimista', 'hold', 0.1, 'segundaIntencion'],
  ['c27', 'Cartógrafo Errante', 'MAN', 'alquimista', 'sabotage', 0.05, 'botinDeGuerra'],
  ['c28', 'Bárbara del Norte', 'OFE', 'maestro', 'ram', -0.2, 'ojoCritico'],
  ['c29', 'Custodio del Foso', 'DEF', 'intendente', 'moat', 0.2, 'energiaPrevista'],
  ['c30', 'Tiradora Élfica', 'MAN', 'maestro', 'volley', -0.1, 'ojoCritico'],
  ['c31', 'Mercenario Tuerto', 'OFE', 'maestro', 'sabotage', -0.15, 'vinculoFervido'],
  ['c32', 'Abadesa Guerrera', 'MAN', 'alquimista', 'tactics', 0.1, 'segundaIntencion'],
  ['c33', 'Jinete de la Estepa', 'OFE', 'maestro', 'lancecharge', -0.05, null],
  ['c34', 'Forjadora de Escudos', 'DEF', 'intendente', 'shieldwall', 0.2, 'energiaPrevista'],
  ['c35', 'Espadachín Real', 'OFE', 'maestro', 'ambush', -0.1, 'ojoCritico'],
  ['c36', 'Alquimista de Guerra', 'MAN', 'alquimista', 'tactics', 0.15, 'botinDeGuerra'],
  ['c37', 'Guardiana del Puente', 'DEF', 'intendente', 'hold', 0.2, 'vinculoFervido'],
  ['c38', 'Saboteador Silente', 'MAN', 'alquimista', 'sabotage', 0.0, 'segundaIntencion'],
  ['c39', 'Mariscala del Sur', 'MAN', 'intendente', 'tactics', 0.1, 'energiaPrevista'],
  ['c40', 'Veterano de las Cien Batallas', 'DEF', 'maestro', 'moat', -0.1, 'ojoCritico'],
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
