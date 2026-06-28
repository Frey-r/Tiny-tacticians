/* ============================================================
   Catálogo de consejeros — definiciones canónicas (identidad).
   El estado por usuario (`user:<id>:consejeros`) guarda solo
   `advisorId -> nivel`; la identidad (nombre/afinidad) vive aquí.
   Así, conceder un consejero nuevo (p. ej. recompensa diaria)
   solo requiere escribir su id con nivel 1: la identidad se
   resuelve desde este catálogo.
   ============================================================ */
import { Affinity } from '../../shared/types/index.ts';
import { CONSEJERO_ABILITIES } from '../../shared/sim/consejeroAbilities.ts';

export interface AdvisorDef {
  id: string;
  name: string;
  affinity: Affinity;
  /** Habilidad de combate que desbloquea al cruzar el umbral de afinidad (ver decisions/0011). */
  ability: string;
  abilityKey: string;
}

/** Construye una definición resolviendo su habilidad desde la tabla compartida. */
function def(id: string, name: string, affinity: Affinity): AdvisorDef {
  const ab = CONSEJERO_ABILITIES[id];
  return { id, name, affinity, ability: ab?.ability ?? '', abilityKey: ab?.abilityKey ?? '' };
}

// Los 3 consejeros con los que arranca todo usuario nuevo.
export const DEFAULT_CONSEJEROS: AdvisorDef[] = [
  def('c1', 'Consejero de Guerra', 'OFE'),
  def('c2', 'Albañil del Muro', 'DEF'),
  def('c3', 'Maestre de Cuentas', 'MAN'),
];

// Pool de consejeros que se pueden adquirir (p. ej. tirada sembrada del reto diario).
export const ACQUIRABLE_CONSEJEROS: AdvisorDef[] = [
  def('c4', 'Capitán de la Vanguardia', 'OFE'),
  def('c5', 'Centinela de la Puerta', 'DEF'),
  def('c6', 'Cartógrafa Real', 'MAN'),
  def('c7', 'Verdugo de Asedios', 'OFE'),
  def('c8', 'Guardiana del Foso', 'DEF'),
  def('c9', 'Espía de la Corte', 'MAN'),
];

// Mapa id -> definición, para resolver identidad en O(1).
export const ADVISOR_CATALOG: Record<string, AdvisorDef> = Object.fromEntries(
  [...DEFAULT_CONSEJEROS, ...ACQUIRABLE_CONSEJEROS].map((a) => [a.id, a])
);

// Orden estable de presentación (índice por id en el catálogo).
const CATALOG_ORDER: Record<string, number> = Object.fromEntries(
  [...DEFAULT_CONSEJEROS, ...ACQUIRABLE_CONSEJEROS].map((a, i) => [a.id, i])
);

export function advisorOrder(id: string): number {
  return CATALOG_ORDER[id] ?? Number.MAX_SAFE_INTEGER;
}

// Nivel máximo alcanzable por un consejero.
export const MAX_CONSEJERO_LEVEL = 10;
