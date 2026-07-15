import type { DiceRoll, OutcomeBand } from '../sim/dice.ts';

export type Affinity = 'OFE' | 'DEF' | 'MAN';

export interface Consejero {
  id: string;
  name: string;
  affinity: Affinity;
  level: number;
  /** Préstamo diario temporal: el consejero expira a `expiresAt` (no es desbloqueo permanente). */
  temporary?: boolean;
  expiresAt?: number;
}

/* ---- Contratos de reclutamiento (desbloqueo permanente de consejeros) ---- */
export const CONTRACT_COLORS = ['white', 'red', 'blue', 'purple'] as const;
export type ContractColor = (typeof CONTRACT_COLORS)[number];
export type Contracts = Record<ContractColor, number>;

/** Color de contrato -> afinidad que puede desbloquear (blanco es comodín). */
export const CONTRACT_AFFINITY: Record<Exclude<ContractColor, 'white'>, Affinity> = {
  red: 'OFE',
  blue: 'DEF',
  purple: 'MAN',
};

/** ¿Un contrato de `color` puede desbloquear un consejero de `affinity`? */
export function contractMatches(color: ContractColor, affinity: Affinity): boolean {
  return color === 'white' || CONTRACT_AFFINITY[color] === affinity;
}

export type DeckSnapshot = Consejero[];

/**
 * Decisión de un turno de la run. Unión discriminada por `kind`:
 * - `train`: entrena una afinidad. Los consejeros que ASISTEN ya NO se eligen
 *   por turno: se activan al azar (determinista por seed+turno; ver decisions/0012),
 *   así que la acción solo lleva la afinidad. El servidor re-deriva el set activo.
 * - `rest`:  recupera energía a cambio del turno.
 * - `event`: resuelve un turno de evento eligiendo una de las 2 ramas.
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
 * Resultado de un encuentro de combate (checkpoint determinista de la run).
 * No es un turno del actionLog: se resuelve TRAS procesar `afterTurn` comparando
 * las stats actuales contra un enemigo equilibrado. El 4º es el jefe.
 */
export interface EncounterResult {
  index: number; // 0..3
  afterTurn: number; // se resuelve tras procesar este turno (0-based)
  enemyName: string;
  enemyPower: number;
  isBoss: boolean;
  won: boolean;
  playerPower: number; // poder del recluta al enfrentarlo
  /** Batalla 1v1 determinista que resolvió el encuentro; alimenta el
   *  visualizador de combate (PvpCombatScene) sin re-simular en el cliente. */
  battle: BattleResult;
}

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
  /** Ids de los consejeros que se ACTIVARON este turno de entrenamiento. */
  activeIds?: string[];
  /** Efectos de run que detonaron este turno (consejero activo con runEffect). */
  advisorProcs?: { id: string; effectId: string; label: string }[];
  /** Ánimo (moral) ANTES y DESPUÉS del turno; `moodAfter` ya incluye la bajada
   *  por un encuentro perdido en esta frontera. El ánimo reforma el dado. */
  moodBefore?: number;
  moodAfter?: number;
  /** Encuentro que se resolvió TRAS este turno (si la frontera coincide). */
  encounter?: EncounterResult;
}

/** Estado completo re-derivado de una run desde seed + deck + actionLog. */
export interface RunSimResult {
  stats: GeneralStats;
  energy: number;
  /** Ánimo (moral) final; reforma el dado durante la run. */
  mood: number;
  turns: TurnResult[];
  /** Bond ("afinidad") acumulado por consejero en esta run (por-run, no se persiste). */
  bond: Record<string, number>;
  /** Habilidades de combate desbloqueadas por bond, para acuñar el general. */
  unlockedAbilities: string[];
  /** Encuentros resueltos hasta el punto simulado (0..4, en orden). */
  encounters: EncounterResult[];
  /** ¿Se derrotó al jefe? → otorga el bono final de +10 a todo al acuñar. */
  bonusEarned: boolean;
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
  /** Epoch ms en que el usuario completó la primera run (acuñó su primer general).
   *  Ausente = usuario nuevo → dispara la cinemática de intro + tutorial guiado. */
  onboardedAt?: number;
  isModerator?: boolean;
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
  /** Color del contrato que entrega el reto diario (canjeable por un consejero). */
  contractGranted: ContractColor | null;
}

/** Candidato del catálogo adquirible para la pantalla de reclutamiento. */
export interface RecruitCandidate {
  id: string;
  name: string;
  affinity: Affinity;
  owned: boolean; // ya desbloqueado permanentemente
  onLoan: boolean; // activo como préstamo temporal
}

/** Estado completo de la pantalla de reclutamiento. */
export interface RecruitmentState {
  gold: number;
  contracts: Contracts;
  loan: { advisorId: string; name: string; affinity: Affinity; expiresAt: number } | null;
  loanAvailable: boolean; // sin préstamo activo y con pool disponible
  unlockCost: number; // oro por desbloqueo con contrato
  candidates: RecruitCandidate[];
}
