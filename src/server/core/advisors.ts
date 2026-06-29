/* ============================================================
   Catálogo de consejeros (servidor) — identidad por usuario.
   El estado por usuario (`user:<id>:consejeros`) guarda solo
   `advisorId -> nivel`; la identidad (nombre/afinidad/skill) vive
   en el catálogo COMPARTIDO `shared/sim/consejeroCatalog.ts`, del
   que este módulo deriva su vista para el servidor.

   Conceder un consejero nuevo (recompensa diaria / contrato) solo
   requiere escribir su id con nivel 1: la identidad se resuelve
   desde el catálogo. Ahora son 40 consejeros (3 iniciales + 37
   adquiribles), ver decisions/0012.
   ============================================================ */
import { Affinity } from '../../shared/types/index.ts';
import {
  CONSEJERO_CATALOG,
  COMBAT_ABILITIES,
  DEFAULT_CONSEJERO_IDS,
} from '../../shared/sim/consejeroCatalog.ts';

export interface AdvisorDef {
  id: string;
  name: string;
  affinity: Affinity;
  /** Habilidad de combate que desbloquea al cruzar el umbral de afinidad (ver decisions/0011). */
  ability: string;
  abilityKey: string;
}

/** Vista de identidad para el servidor, derivada del catálogo compartido. */
const ALL_ADVISORS: AdvisorDef[] = CONSEJERO_CATALOG.map((d) => ({
  id: d.id,
  name: d.name,
  affinity: d.affinity,
  ability: COMBAT_ABILITIES[d.abilityKey]?.ability ?? '',
  abilityKey: d.abilityKey,
}));

const DEFAULT_IDS = new Set<string>(DEFAULT_CONSEJERO_IDS);

// Los consejeros con los que arranca todo usuario nuevo (c1, c2, c3).
export const DEFAULT_CONSEJEROS: AdvisorDef[] = ALL_ADVISORS.filter((a) => DEFAULT_IDS.has(a.id));

// Pool de consejeros adquiribles (contrato / recompensa diaria): el resto del catálogo.
export const ACQUIRABLE_CONSEJEROS: AdvisorDef[] = ALL_ADVISORS.filter((a) => !DEFAULT_IDS.has(a.id));

// Mapa id -> definición, para resolver identidad en O(1).
export const ADVISOR_CATALOG: Record<string, AdvisorDef> = Object.fromEntries(
  ALL_ADVISORS.map((a) => [a.id, a])
);

// Orden estable de presentación (índice por id en el catálogo).
const CATALOG_ORDER: Record<string, number> = Object.fromEntries(ALL_ADVISORS.map((a, i) => [a.id, i]));

export function advisorOrder(id: string): number {
  return CATALOG_ORDER[id] ?? Number.MAX_SAFE_INTEGER;
}

// Nivel máximo alcanzable por un consejero.
export const MAX_CONSEJERO_LEVEL = 10;
