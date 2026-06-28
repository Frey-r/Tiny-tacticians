import type { DiceRoll, OutcomeBand } from '../sim/dice.ts';

export type Affinity = 'OFE' | 'DEF' | 'MAN';

export interface Consejero {
  id: string;
  name: string;
  affinity: Affinity;
  level: number;
}

export type DeckSnapshot = Consejero[];

/**
 * Decisión de un turno de la run. Unión discriminada por `kind`:
 * - `train`: entrena una afinidad (el asesor lo deriva el servidor).
 * - `rest`:  recupera energía a cambio del turno.
 * - `event`: resuelve un turno de evento eligiendo una de las 2 ramas.
 * El `train` lleva `consejeroIds`: los consejeros que el jugador asigna a ESE
 * entrenamiento (subconjunto del deck, posiblemente vacío). Viajan en el actionLog
 * porque afectan la tirada; el servidor los valida contra el deck autoritativo.
 */
export type RunAction =
  | { kind: 'train'; choice: Affinity; consejeroIds: string[] }
  | { kind: 'rest' }
  | { kind: 'event'; branch: 0 | 1 };

export type ActionLog = RunAction[];

export interface GeneralStats {
  ofe: number;
  def: number;
  man: number;
}

/** Resultado de la tirada de un entrenamiento. */
export type TurnOutcome = 'fail' | 'normal' | 'crit';

/**
 * Lo que ocurrió en un turno, producido por `stepRun`. Es la ÚNICA fuente de
 * verdad tanto para acuñar (servidor) como para el feedback por acción (cliente).
 */
export interface TurnResult {
  turn: number; // índice 0-based
  kind: 'train' | 'rest' | 'event';
  choice?: Affinity; // sólo en train
  outcome?: TurnOutcome; // sólo en train
  /** Delta aplicado a cada stat este turno (puede ser negativo en eventos/fallos). */
  gains: Partial<GeneralStats>;
  energyBefore: number;
  energyAfter: number;
  event?: { id: string; name: string; branch: number; label: string; outcomeText: string };
  /** Tirada de dados de este turno (entrenamiento o rama de evento con probabilidad). */
  dice?: { faces: number[]; keptFace: number; band: OutcomeBand; roll: DiceRoll };
  /** Bond ("afinidad") ganado por cada consejero ESTE turno (solo en train). */
  bondDeltas?: Record<string, number>;
}

/** Estado completo re-derivado de una run desde seed + deck + actionLog. */
export interface RunSimResult {
  stats: GeneralStats;
  energy: number;
  turns: TurnResult[];
  /** Bond ("afinidad") acumulado por consejero en esta run (por-run, no se persiste). */
  bond: Record<string, number>;
  /** Habilidades de combate desbloqueadas por bond, para acuñar el general. */
  unlockedAbilities: string[];
}

export interface General {
  id: string;
  ownerId: string;
  name: string;
  stats: GeneralStats;
  power: number;
  tier: number;
  abilities: string[];
  seed: string;
  schemaVersion: number;
  createdAt: number;
}

export interface BattleRound {
  round: number;
  attackerId: string;
  defenderId: string;
  attackerHpBefore: number;
  defenderHpBefore: number;
  damage: number;
  attackerHpAfter: number;
  defenderHpAfter: number;
  log: string;
  /* Señales estructuradas para los FX del visualizador (opcionales: los
     replays guardados antes de Fase 2 simplemente no las traen). */
  crit?: boolean; // daño doblado (Carga Devastadora)
  blocked?: boolean; // el defensor absorbió el grueso (Escudo Inquebrantable)
  abilityProcs?: string[]; // nombres de habilidades que se activaron esta ronda
  lethal?: boolean; // este golpe dejó al defensor en 0 HP
}

export interface BattleResult {
  battleId: string;
  winnerId: string;
  rounds: BattleRound[];
  seed: string;
  generalA: General;
  generalB: General;
}

export interface UserProfile {
  userId: string;
  gold: number;
  settlementLevel: number;
  schemaVersion: number;
}

export interface DailyModifier {
  id: string;
  name: string;
  description: string;
}

export interface DailyChallenge {
  date: string; // canonical UTC YYYY-MM-DD
  seed: string;
  enemy: General;
  modifier: DailyModifier;
  postId?: string;
  schemaVersion: number;
}

/** Per-user status of today's daily challenge, returned alongside the challenge. */
export interface DailyStatus {
  completed: boolean;
  claimed: boolean;
}

export interface DailyClaimResult {
  date: string;
  goldEarned: number;
  scoreEarned: number;
  newGoldTotal: number;
  consejeroGranted: Consejero | null;
}
