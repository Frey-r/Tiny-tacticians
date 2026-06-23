import { GeneralStats } from '../types/index.ts';

export const BASE_STAT = 10;
export const MAX_STAT = 100;
export const MIN_STAT = 1;
export const RUN_TURNS = 8;
export const LOADOUT_SIZE = 3; // consejeros exactos que componen el loadout de una run
export const MATCHMAKING_POWER_BAND = 15; // standard [P - 15, P + 15]

export function calculatePower(stats: GeneralStats): number {
  return Math.floor(stats.ofe * 1.0 + stats.def * 1.0 + stats.man * 1.2);
}

export function calculateTier(power: number): number {
  if (power < 50) return 1;
  if (power < 100) return 2;
  if (power < 150) return 3;
  if (power < 200) return 4;
  return 5;
}

export interface AbilityThreshold {
  name: string;
  stat: keyof GeneralStats;
  threshold: number;
}

export const ABILITY_THRESHOLDS: AbilityThreshold[] = [
  { name: 'Furia de Combate', stat: 'ofe', threshold: 30 },
  { name: 'Carga Devastadora', stat: 'ofe', threshold: 60 },
  { name: 'Baluarte Férreo', stat: 'def', threshold: 30 },
  { name: 'Escudo Inquebrantable', stat: 'def', threshold: 60 },
  { name: 'Estratega Decidido', stat: 'man', threshold: 30 },
  { name: 'Grito de Mando', stat: 'man', threshold: 60 },
];

export function deriveAbilities(stats: GeneralStats): string[] {
  const abilities: string[] = [];
  for (const ab of ABILITY_THRESHOLDS) {
    if (stats[ab.stat] >= ab.threshold) {
      abilities.push(ab.name);
    }
  }
  return abilities;
}

// Event system for training campaign
export interface CampaignEvent {
  id: string;
  name: string;
  description: string;
  effect: (stats: GeneralStats, trainedAffinity: 'OFE' | 'DEF' | 'MAN') => void;
}

export const CAMPAIGN_EVENTS = [
  {
    name: 'Marcha Forzada',
    description: 'Los reclutas entrenan bajo la lluvia. +3 Mando, -1 Defensiva.',
    effect: (stats: GeneralStats) => {
      stats.man = Math.min(MAX_STAT, stats.man + 3);
      stats.def = Math.max(MIN_STAT, stats.def - 1);
    }
  },
  {
    name: 'Suministros Extra',
    description: 'Se consiguen raciones premium. +2 a todas las estadísticas.',
    effect: (stats: GeneralStats) => {
      stats.ofe = Math.min(MAX_STAT, stats.ofe + 2);
      stats.def = Math.min(MAX_STAT, stats.def + 2);
      stats.man = Math.min(MAX_STAT, stats.man + 2);
    }
  },
  {
    name: 'Espíritu de Lucha',
    description: 'Inspiración en el cuartel. +4 Ofensiva.',
    effect: (stats: GeneralStats) => {
      stats.ofe = Math.min(MAX_STAT, stats.ofe + 4);
    }
  },
  {
    name: 'Fortificación Improvisada',
    description: 'Se ensayan defensas de empalizada. +4 Defensiva.',
    effect: (stats: GeneralStats) => {
      stats.def = Math.min(MAX_STAT, stats.def + 4);
    }
  },
  {
    name: 'Esfuerzo de Campaña',
    description: 'Entrenamiento intensivo en el área elegida. +2 a la estadística entrenada.',
    effect: (stats: GeneralStats, trained) => {
      if (trained === 'OFE') stats.ofe = Math.min(MAX_STAT, stats.ofe + 2);
      if (trained === 'DEF') stats.def = Math.min(MAX_STAT, stats.def + 2);
      if (trained === 'MAN') stats.man = Math.min(MAX_STAT, stats.man + 2);
    }
  }
];
