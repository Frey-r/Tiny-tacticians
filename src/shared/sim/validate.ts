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
  actionLog: ActionLog
): { isValid: boolean; error?: string } {
  if (!Array.isArray(deckSnapshot) || deckSnapshot.length === 0) {
    return { isValid: false, error: 'El deckSnapshot debe ser un arreglo no vacío.' };
  }

  if (!Array.isArray(actionLog)) {
    return { isValid: false, error: 'El actionLog debe ser un arreglo.' };
  }

  if (actionLog.length !== RUN_TURNS) {
    return { isValid: false, error: `El actionLog debe tener exactamente ${RUN_TURNS} acciones.` };
  }

  const validAffinities = new Set(['OFE', 'DEF', 'MAN']);
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
    } else if (action.kind !== 'rest') {
      return { isValid: false, error: `La acción en el índice ${i} debe ser 'train' o 'rest'.` };
    }
  }

  return { isValid: true };
}
