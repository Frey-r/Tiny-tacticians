/* ============================================================
   Catálogo de consejeros — definiciones canónicas (identidad).
   El estado por usuario (`user:<id>:consejeros`) guarda solo
   `advisorId -> nivel`; la identidad (nombre/afinidad) vive aquí.
   Así, conceder un consejero nuevo (p. ej. recompensa diaria)
   solo requiere escribir su id con nivel 1: la identidad se
   resuelve desde este catálogo.
   ============================================================ */
import { Affinity } from '../../shared/types/index.ts';

export interface AdvisorDef {
  id: string;
  name: string;
  affinity: Affinity;
}

// Los 3 consejeros con los que arranca todo usuario nuevo.
export const DEFAULT_CONSEJEROS: AdvisorDef[] = [
  { id: 'c1', name: 'Consejero de Guerra', affinity: 'OFE' },
  { id: 'c2', name: 'Albañil del Muro', affinity: 'DEF' },
  { id: 'c3', name: 'Maestre de Cuentas', affinity: 'MAN' },
];

// Pool de consejeros que se pueden adquirir (p. ej. tirada sembrada del reto diario).
export const ACQUIRABLE_CONSEJEROS: AdvisorDef[] = [
  { id: 'c4', name: 'Capitán de la Vanguardia', affinity: 'OFE' },
  { id: 'c5', name: 'Centinela de la Puerta', affinity: 'DEF' },
  { id: 'c6', name: 'Cartógrafa Real', affinity: 'MAN' },
  { id: 'c7', name: 'Verdugo de Asedios', affinity: 'OFE' },
  { id: 'c8', name: 'Guardiana del Foso', affinity: 'DEF' },
  { id: 'c9', name: 'Espía de la Corte', affinity: 'MAN' },
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
