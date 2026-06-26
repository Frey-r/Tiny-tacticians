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
 * El asesor ya no se envía (`consejeroId` eliminado): el deck es autoritativo
 * en el servidor y la mejor afinidad se deriva con `bestAdvisorFor`.
 */
export type RunAction =
  | { kind: 'train'; choice: Affinity }
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
}

/** Estado completo re-derivado de una run desde seed + deck + actionLog. */
export interface RunSimResult {
  stats: GeneralStats;
  energy: number;
  turns: TurnResult[];
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
