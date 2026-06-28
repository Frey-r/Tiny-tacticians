/* ============================================================
   Tiny Tacticians — Registro central de sprites (UI)
   Importa los PNG del pack para que Vite los empaquete y nos
   devuelva URLs hasheadas. El resto de la app consume estos
   helpers en vez de rutas crudas.
   ============================================================ */

const UI = 'assets/sprites/UI Elements/UI Elements';

/* ---- Iconos (64x64) -------------------------------------------- */
// Cargamos los 12 iconos en orden numérico (Icon_01..Icon_12).
const iconModules = import.meta.glob<string>(
  './assets/sprites/UI Elements/UI Elements/Icons/Icon_*.png',
  { eager: true, import: 'default' }
);
const iconList = Object.keys(iconModules)
  .sort()
  .map((k) => iconModules[k]);

// Mapa semántico según el contenido visual de cada icono del pack.
export const ICON = {
  tools: iconList[0], // Icon_01 mazo / herramientas
  wood: iconList[1], // Icon_02 tronco de madera
  gold: iconList[2], // Icon_03 moneda de oro
  meat: iconList[3], // Icon_04 carne
  sword: iconList[4], // Icon_05 espada (OFE)
  shield: iconList[5], // Icon_06 escudo (DEF)
  arrowGreen: iconList[6], // Icon_07 flecha verde (avanzar)
  arrowOrange: iconList[7], // Icon_08 flecha naranja
  close: iconList[8], // Icon_09 cruz roja (cerrar)
  gear: iconList[9], // Icon_10 engranaje (opciones)
  info: iconList[10], // Icon_11 información
  music: iconList[11], // Icon_12 nota musical
} as const;

/* ---- Retratos / avatares (256x256) ----------------------------- */
const avatarModules = import.meta.glob<string>(
  './assets/sprites/UI Elements/UI Elements/Human Avatars/Avatars_*.png',
  { eager: true, import: 'default' }
);
export const AVATARS = Object.keys(avatarModules)
  .sort()
  .map((k) => avatarModules[k]);

// Hash estable de una cadena -> índice de avatar. Así un mismo
// consejero/general siempre muestra el mismo retrato.
function avatarIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % AVATARS.length;
}

export function avatarFor(seed: string): string {
  return AVATARS[avatarIndex(seed)];
}

// Clave de textura Phaser ('avatar_<n>') para el mismo hash estable.
// Los avatares se registran con estas claves en BootScene.
export function avatarKeyFor(seed: string): string {
  return `avatar_${avatarIndex(seed)}`;
}

/* ---- Paneles nine-slice (border-image) ------------------------- */
// Re-exportamos como URL para usarlos en estilos inline cuando haga falta.
import bigRedBtn from './assets/sprites/UI Elements/UI Elements/Buttons/BigRedButton_Regular.png';
import bigBlueBtn from './assets/sprites/UI Elements/UI Elements/Buttons/BigBlueButton_Regular.png';
import regularPaper from './assets/sprites/UI Elements/UI Elements/Papers/RegularPaper.png';
import specialPaper from './assets/sprites/UI Elements/UI Elements/Papers/SpecialPaper.png';
import banner from './assets/sprites/UI Elements/UI Elements/Banners/Banner.png';
import dicesSprite from './assets/sprites/UI Elements/UI Dices/dices_sprite.png';

export const PANEL = {
  buttonRed: bigRedBtn,
  buttonBlue: bigBlueBtn,
  paper: regularPaper,
  paperSpecial: specialPaper,
  banner,
} as const;

/* ---- Dados (spritesheet 168x86 = 6 col x 3 filas, frame 28x28).
   Fila superior (frames 0..5) = caras de pips 1..6 (verificado por
   conteo de pips). Fila central (6..11) = dados "en blanco"/geométricos
   (se usan para el giro). Fila inferior (12..17) = símbolos (sin usar). */
export const DICE = {
  url: dicesSprite,
  key: 'ui_dice',
  frameW: 28,
  frameH: 28,
  cols: 6,
  /** Cara (1..6) -> índice de frame de la fila de pips. */
  pipFrame: (v: number): number => Math.min(6, Math.max(1, Math.round(v))) - 1,
  /** Frames de la fila central (dados en blanco) para la animación de giro. */
  blankFrames: [6, 7, 8, 9, 10, 11] as number[],
} as const;

// Unidades
import blueWarriorIdle from './assets/sprites/Units/Blue Units/Warrior/Warrior_Idle.png';
import redWarriorIdle from './assets/sprites/Units/Red Units/Warrior/Warrior_Idle.png';
import blueArcherIdle from './assets/sprites/Units/Blue Units/Archer/Archer_Idle.png';
import blueLancerIdle from './assets/sprites/Units/Blue Units/Lancer/Lancer_Idle.png';

// Edificios
import blueCastle from './assets/sprites/Buildings/Blue Buildings/Castle.png';
import blueBarracks from './assets/sprites/Buildings/Blue Buildings/Barracks.png';
import blueTower from './assets/sprites/Buildings/Blue Buildings/Tower.png';

// Terreno / Recursos
import goldResource from './assets/sprites/Terrain/Resources/Gold/Gold Resource/Gold_Resource.png';
import cloud1 from './assets/sprites/Terrain/Decorations/Clouds/Clouds_01.png';
import cloud2 from './assets/sprites/Terrain/Decorations/Clouds/Clouds_02.png';

// Partículas
import explosion1 from './assets/sprites/Particle FX/Explosion_01.png';
import dust1 from './assets/sprites/Particle FX/Dust_01.png';
import fire1 from './assets/sprites/Particle FX/Fire_01.png';

export const SPRITE = {
  warriorBlue: blueWarriorIdle,
  warriorRed: redWarriorIdle,
  archerBlue: blueArcherIdle,
  lancerBlue: blueLancerIdle,
  castle: blueCastle,
  barracks: blueBarracks,
  tower: blueTower,
  goldResource,
  cloud1,
  cloud2,
  explosion: explosion1,
} as const;

/* ============================================================
   Unidades de combate (Fase 2 — simulador 6v6).
   Spritesheets animados de las facciones Azul (atacante) y Roja
   (defensor). Claves con prefijo `cu_` para NO colisionar con los
   sheets/anims legacy (warriorBlue_idle, etc.). Los frames son
   cuadrados (frameW == frameH); los conteos se midieron del PNG.
   ============================================================ */
export interface AnimSheet {
  texKey: string; // clave de textura Y de animación en Phaser
  url: string;
  frameW: number;
  frameH: number;
  frames: number;
  frameRate: number;
  repeat: number; // -1 bucle, 0 una vez
}

// Todos los PNG de unidades (Vite los hashea). Brace-expansion soportada por glob de Vite.
const unitModules = import.meta.glob<string>(
  './assets/sprites/Units/{Blue,Red} Units/{Warrior,Archer,Lancer}/*.png',
  { eager: true, import: 'default' }
);

const COLOR_FOLDER = { blue: 'Blue Units', red: 'Red Units' } as const;
type UnitColor = keyof typeof COLOR_FOLDER;

interface ActionMeta { file: string; frameH: number; frames: number; frameRate: number; repeat: number }
const UNIT_DEFS: Record<'warrior' | 'archer' | 'lancer', { folder: string; actions: Record<string, ActionMeta> }> = {
  warrior: {
    folder: 'Warrior',
    actions: {
      idle: { file: 'Warrior_Idle.png', frameH: 192, frames: 8, frameRate: 8, repeat: -1 },
      run: { file: 'Warrior_Run.png', frameH: 192, frames: 6, frameRate: 12, repeat: -1 },
      attack1: { file: 'Warrior_Attack1.png', frameH: 192, frames: 4, frameRate: 14, repeat: 0 },
      attack2: { file: 'Warrior_Attack2.png', frameH: 192, frames: 4, frameRate: 14, repeat: 0 },
      guard: { file: 'Warrior_Guard.png', frameH: 192, frames: 6, frameRate: 10, repeat: 0 },
    },
  },
  archer: {
    folder: 'Archer',
    actions: {
      idle: { file: 'Archer_Idle.png', frameH: 192, frames: 6, frameRate: 8, repeat: -1 },
      run: { file: 'Archer_Run.png', frameH: 192, frames: 4, frameRate: 12, repeat: -1 },
      shoot: { file: 'Archer_Shoot.png', frameH: 192, frames: 8, frameRate: 16, repeat: 0 },
    },
  },
  lancer: {
    folder: 'Lancer',
    actions: {
      idle: { file: 'Lancer_Idle.png', frameH: 320, frames: 12, frameRate: 10, repeat: -1 },
      run: { file: 'Lancer_Run.png', frameH: 320, frames: 6, frameRate: 12, repeat: -1 },
      attack: { file: 'Lancer_Right_Attack.png', frameH: 320, frames: 3, frameRate: 10, repeat: 0 },
    },
  },
};

function unitUrl(colorFolder: string, unitFolder: string, file: string): string {
  const key = `./assets/sprites/Units/${colorFolder}/${unitFolder}/${file}`;
  const url = unitModules[key];
  if (!url) throw new Error(`Asset de unidad no encontrado: ${key}`);
  return url;
}

export const UNIT_SHEETS: AnimSheet[] = [];
for (const color of Object.keys(COLOR_FOLDER) as UnitColor[]) {
  const cap = color[0].toUpperCase() + color.slice(1); // Blue / Red
  const colorFolder = COLOR_FOLDER[color];
  for (const [unit, def] of Object.entries(UNIT_DEFS)) {
    for (const [action, m] of Object.entries(def.actions)) {
      UNIT_SHEETS.push({
        texKey: `cu_${unit}${cap}_${action}`,
        url: unitUrl(colorFolder, def.folder, m.file),
        frameW: m.frameH,
        frameH: m.frameH,
        frames: m.frames,
        frameRate: m.frameRate,
        repeat: m.repeat,
      });
    }
  }
}

// FX como anims one-shot (los PNG son spritesheets, no imágenes sueltas).
export const FX_SHEETS: AnimSheet[] = [
  { texKey: 'cu_explosion', url: explosion1, frameW: 192, frameH: 192, frames: 8, frameRate: 18, repeat: 0 },
  { texKey: 'cu_dust', url: dust1, frameW: 64, frameH: 64, frames: 8, frameRate: 16, repeat: 0 },
  { texKey: 'cu_fire', url: fire1, frameW: 64, frameH: 64, frames: 8, frameRate: 14, repeat: 0 },
];

// Proyectil de los arqueros (imagen estática 64x64).
export const ARROW: Record<UnitColor, string> = {
  blue: unitUrl(COLOR_FOLDER.blue, 'Archer', 'Arrow.png'),
  red: unitUrl(COLOR_FOLDER.red, 'Archer', 'Arrow.png'),
};

export { UI };
