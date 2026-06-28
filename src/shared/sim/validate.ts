import { ActionLog, DeckSnapshot } from '../types/index.ts';
import { RUN_TURNS, eventTurns } from './balance.ts';

/**
 * Valida un actionLog v2 contra el seed y el deck. Necesita el `seed` porque
 * los turnos de evento se derivan de él: en esos índices la acción DEBE ser un
 * `event` con rama 0/1; en el resto, `train` (con afinidad válida) o `rest`.
 */
export function validateActionLog(
  seed: string,
  deckSnapshot: DeckSnapshot,
  actionLog: ActionLog,
  opts: { requireComplete?: boolean } = {}
): { isValid: boolean; error?: string } {
  if (!Array.isArray(deckSnapshot) || deckSnapshot.length === 0) {
    return { isValid: false, error: 'El deckSnapshot debe ser un arreglo no vacío.' };
  }

  if (!Array.isArray(actionLog)) {
    return { isValid: false, error: 'El actionLog debe ser un arreglo.' };
  }

  // El cliente simula de forma INCREMENTAL (logs parciales tras cada decisión),
  // así que la longitud exacta solo se exige al acuñar (`requireComplete`). Lo que
  // nunca se permite es exceder el total de turnos.
  if (opts.requireComplete && actionLog.length !== RUN_TURNS) {
    return { isValid: false, error: `El actionLog debe tener exactamente ${RUN_TURNS} acciones.` };
  }
  if (actionLog.length > RUN_TURNS) {
    return { isValid: false, error: `El actionLog no puede exceder ${RUN_TURNS} acciones.` };
  }

  const validAffinities = new Set(['OFE', 'DEF', 'MAN']);
  const deckIds = new Set(deckSnapshot.map((c) => c.id));
  const evtSet = eventTurns(seed);

  for (let i = 0; i < actionLog.length; i++) {
    const action = actionLog[i];
    if (!action || typeof action !== 'object') {
      return { isValid: false, error: `La acción en el índice ${i} no es válida.` };
    }

    if (evtSet.has(i)) {
      if (action.kind !== 'event' || (action.branch !== 0 && action.branch !== 1)) {
        return { isValid: false, error: `La acción en el índice ${i} debe ser un evento con rama 0 o 1.` };
      }
      continue;
    }

    if (action.kind === 'train') {
      if (!validAffinities.has(action.choice)) {
        return { isValid: false, error: `La opción '${action.choice}' en el índice ${i} es inválida.` };
      }
      // Consejeros asignados a ESE entrenamiento: arreglo, sin duplicados, todos en el deck.
      if (!Array.isArray(action.consejeroIds)) {
        return { isValid: false, error: `La acción en el índice ${i} debe incluir consejeroIds (arreglo).` };
      }
      if (action.consejeroIds.length > deckSnapshot.length) {
        return { isValid: false, error: `Demasiados consejeros en el índice ${i}.` };
      }
      const seen = new Set<string>();
      for (const id of action.consejeroIds) {
        if (typeof id !== 'string' || !deckIds.has(id)) {
          return { isValid: false, error: `El consejero '${id}' (índice ${i}) no está en el deck.` };
        }
        if (seen.has(id)) {
          return { isValid: false, error: `Consejero repetido '${id}' en el índice ${i}.` };
        }
        seen.add(id);
      }
    } else if (action.kind !== 'rest') {
      return { isValid: false, error: `La acción en el índice ${i} debe ser 'train' o 'rest'.` };
    }
  }

  return { isValid: true };
}
