import { DeckSnapshot, ActionLog, General } from '../types/index.ts';
import { PRNG } from './prng.ts';
import { stepRun } from './stepRun.ts';
import { calculatePower, calculateTier, deriveAbilities, SIM_VERSION } from './balance.ts';

/**
 * Acuña un General re-simulando la run server-side. Toda la lógica de turnos
 * vive en `stepRun` (compartida con el cliente); aquí sólo derivamos los
 * atributos finales del General a partir de las stats resultantes.
 *
 * El id/nombre usan un PRNG DERIVADO (`seed:id`) para no consumir el stream
 * principal de la run, manteniéndose deterministas e independientes.
 */
export function simulateRun(
  seed: string,
  deckSnapshot: DeckSnapshot,
  actionLog: ActionLog,
  name?: string
): General {
  const { stats, unlockedAbilities } = stepRun(seed, deckSnapshot, actionLog); // valida internamente

  const idp = new PRNG(`${seed}:id`);
  const generalId = `gen_${idp.nextHex(8)}_${idp.nextInt(100000, 999999)}`;
  const resolvedName = name || `General_${seed.substring(0, 4)}_${idp.nextInt(10, 99)}`;

  const finalPower = calculatePower(stats);
  const finalTier = calculateTier(finalPower);
  // Unión: habilidades por umbral de stat + habilidades desbloqueadas por afinidad de consejero.
  const finalAbilities = Array.from(new Set([...deriveAbilities(stats), ...unlockedAbilities]));

  return {
    id: generalId,
    ownerId: '', // Filled by the server or client context
    name: resolvedName,
    stats,
    power: finalPower,
    tier: finalTier,
    abilities: finalAbilities,
    seed,
    schemaVersion: SIM_VERSION,
    createdAt: Date.now(), // Filled on the server, but default provided
  };
}
