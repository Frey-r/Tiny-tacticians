export { PRNG } from './prng.ts';
export {
  SIM_VERSION,
  BASE_STAT,
  MAX_STAT,
  MIN_STAT,
  RUN_TURNS,
  ENERGY_MAX,
  TRAIN_COST,
  REST_GAIN,
  SAFE_ENERGY,
  CRIT_MULT,
  EVENT_COUNT,
  MATCHMAKING_POWER_BAND,
  LOADOUT_SIZE,
  BASE_FAIL_MAX,
  BASE_CRIT_MIN,
  BOND_PER_TRAIN,
  BOND_AFFINITY_BONUS,
  BOND_THRESHOLD,
  ACTIVATION_MIN,
  ACTIVATION_MAX,
  CONSEJERO_ABILITY,
  calculatePower,
  calculateTier,
  deriveAbilities,
  bestAdvisorFor,
  baseGain,
  failChance,
  critChance,
  activationRamp,
  activationChance,
  activeAdvisorsForTurn,
  secondaryStatFor,
  consejeroTrainMod,
  energyFailShift,
  planTrainTurn,
  buildEventRoll,
  buildAbilityRoll,
  gainForBand,
  bondForParticipation,
  participantsBestFor,
  BRANCHING_EVENTS,
  eventTurns,
  isEventTurn,
  eventForTurn,
} from './balance.ts';
export type { BranchingEvent, EventBranch, TrainMod, TrainTurnPlan } from './balance.ts';
export {
  rollDice,
  rollOdds,
  makeDie,
  baseRoll,
  lockFace,
  restrictRange,
  addDice,
  shiftThresholds,
  bandFor,
  FULL_D6,
  MAX_DICE,
} from './dice.ts';
export type { DieSpec, Thresholds, CombineMode, DiceRoll, DiceOutcome, Face, OutcomeBand } from './dice.ts';
export {
  COMBAT_ABILITIES,
  CONSEJERO_ABILITY_LIST,
  CONSEJERO_PROC_CHANCE,
  CONSEJERO_CATALOG,
  RUN_EFFECTS,
  consejeroDef,
  DEFAULT_CONSEJERO_IDS,
} from './consejeroCatalog.ts';
export type {
  ConsejeroAbility,
  AbilityEffect,
  ConsejeroDef,
  TrainStyle,
  RunEffectId,
  RunEffectDef,
} from './consejeroCatalog.ts';
export { validateActionLog } from './validate.ts';
export { simulateRun } from './simulateRun.ts';
export { simulateBattle } from './simulateBattle.ts';
export { stepRun, previewTurn } from './stepRun.ts';
export type { TrainPreview } from './stepRun.ts';
