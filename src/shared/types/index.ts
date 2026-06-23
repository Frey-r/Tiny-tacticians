export type Affinity = 'OFE' | 'DEF' | 'MAN';

export interface Consejero {
  id: string;
  name: string;
  affinity: Affinity;
  level: number;
}

export type DeckSnapshot = Consejero[];

export interface Action {
  consejeroId: string;
  choice: Affinity;
}

export type ActionLog = Action[];

export interface GeneralStats {
  ofe: number;
  def: number;
  man: number;
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
