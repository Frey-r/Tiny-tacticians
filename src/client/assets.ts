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
import regularPaper from './assets/sprites/UI Elements/UI Elements/Papers/RegularPaper.png';
import specialPaper from './assets/sprites/UI Elements/UI Elements/Papers/SpecialPaper.png';
import banner from './assets/sprites/UI Elements/UI Elements/Banners/Banner.png';
import dicesSprite from './assets/sprites/UI Elements/UI Dices/dices_sprite.png';
import backgroundMusic from './assets/music/background-music.mp3';

export const PANEL = {
  paper: regularPaper,
  paperSpecial: specialPaper,
  banner,
} as const;

/* ---- Botones y barras texturizadas (pack "slots" -> nine-slice) --
   Los PNG del pack NO son texturas contiguas: cada botón grande es un
   grid 3x3 de parches (y cada barra 3x1) separados por huecos
   transparentes. BootScene los recompone vía bakeUiTextures() en
   texturas contiguas listas para nine-slice. Los rangos de parches
   están medidos píxel a píxel (regiones con alpha > 10). */
import btnBigBlueReg from './assets/sprites/UI Elements/UI Elements/Buttons/BigBlueButton_Regular.png';
import btnBigBluePre from './assets/sprites/UI Elements/UI Elements/Buttons/BigBlueButton_Pressed.png';
import btnBigRedReg from './assets/sprites/UI Elements/UI Elements/Buttons/BigRedButton_Regular.png';
import btnBigRedPre from './assets/sprites/UI Elements/UI Elements/Buttons/BigRedButton_Pressed.png';
import btnSqBlueReg from './assets/sprites/UI Elements/UI Elements/Buttons/SmallBlueSquareButton_Regular.png';
import btnSqBluePre from './assets/sprites/UI Elements/UI Elements/Buttons/SmallBlueSquareButton_Pressed.png';
import barSmallBase from './assets/sprites/UI Elements/UI Elements/Bars/SmallBar_Base.png';
import barSmallFill from './assets/sprites/UI Elements/UI Elements/Bars/SmallBar_Fill.png';

/** Rango [desde, hasta] (incluyente) de píxeles con contenido en el PNG. */
type Span = [number, number];

export interface UiBakeSpec {
  url: string;
  rawKey: string; // clave temporal de la imagen fuente en el loader
  outKey: string; // clave de la textura contigua resultante
  cols: Span[]; // columnas de parches (1 = imagen contigua, 3 = slots)
  rows: Span[];
  desaturate?: number; // 0..1: mezcla hacia gris (variante neutral)
  brighten?: number; // multiplicador post-desaturado (rellenos tintables)
}

// Grid 3x3 de los botones grandes (320x320). El estado Pressed tiene
// parches distintos: el arte queda "hundido" (borde superior más corto).
const BIG_REG = {
  cols: [[19, 63], [128, 191], [256, 300]] as Span[],
  rows: [[17, 63], [128, 191], [256, 302]] as Span[],
};
const BIG_PRE = {
  cols: [[14, 63], [128, 191], [256, 305]] as Span[],
  rows: [[28, 63], [128, 191], [256, 304]] as Span[],
};
// El botón cuadrado pequeño (128x128) sí es contiguo: solo se recorta.
const SQ_REG = { cols: [[19, 108]] as Span[], rows: [[17, 110]] as Span[] };
const SQ_PRE = { cols: [[14, 113]] as Span[], rows: [[28, 112]] as Span[] };

export const UI_BAKES: UiBakeSpec[] = [
  { url: btnBigBlueReg, rawKey: 'raw_btnPrimary', outKey: 'btnPrimary', ...BIG_REG },
  { url: btnBigBluePre, rawKey: 'raw_btnPrimaryPre', outKey: 'btnPrimaryPressed', ...BIG_PRE },
  { url: btnBigRedReg, rawKey: 'raw_btnDanger', outKey: 'btnDanger', ...BIG_REG },
  { url: btnBigRedPre, rawKey: 'raw_btnDangerPre', outKey: 'btnDangerPressed', ...BIG_PRE },
  // Neutral = cuadrado azul desaturado (piedra), para no competir con el CTA teal.
  { url: btnSqBlueReg, rawKey: 'raw_btnNeutral', outKey: 'btnNeutral', ...SQ_REG, desaturate: 0.55 },
  { url: btnSqBluePre, rawKey: 'raw_btnNeutralPre', outKey: 'btnNeutralPressed', ...SQ_PRE, desaturate: 0.55 },
  // Barra pequeña: base 3-slice + tira de relleno. El relleno nativo es rojo;
  // se hornea en escala de grises aclarada para poder tintarlo (verde/rojo).
  { url: barSmallBase, rawKey: 'raw_barSmall', outKey: 'barSmall', cols: [[49, 63], [128, 191], [256, 270]], rows: [[22, 40]] },
  { url: barSmallFill, rawKey: 'raw_barFill', outKey: 'barFill', cols: [[0, 63]], rows: [[30, 32]], desaturate: 1, brighten: 2.1 },
];

export interface ButtonSkin { key: string; l: number; r: number; t: number; b: number }

const spanW = (s: Span): number => s[1] - s[0] + 1;
// Insets nine-slice = tamaño de los parches de esquina de la textura horneada.
const nineOf = (key: string, g: { cols: Span[]; rows: Span[] }): ButtonSkin => ({
  key,
  l: spanW(g.cols[0]),
  r: spanW(g.cols[g.cols.length - 1]),
  t: spanW(g.rows[0]),
  b: spanW(g.rows[g.rows.length - 1]),
});

export const BTN_SKIN = {
  primary: { regular: nineOf('btnPrimary', BIG_REG), pressed: nineOf('btnPrimaryPressed', BIG_PRE) },
  danger: { regular: nineOf('btnDanger', BIG_REG), pressed: nineOf('btnDangerPressed', BIG_PRE) },
  // Contiguo: los insets cubren la esquina redondeada + borde pintado.
  neutral: {
    regular: { key: 'btnNeutral', l: 26, r: 26, t: 24, b: 28 },
    pressed: { key: 'btnNeutralPressed', l: 26, r: 26, t: 22, b: 26 },
  },
} as const;

/** Los botones se renderizan a mitad de escala (texturas ~2x el diseño). */
export const BTN_TEX_SCALE = 0.5;

/** Métricas de la barra pequeña horneada (94x19: tapas de 15px). */
export const BAR_SKIN = {
  base: { key: 'barSmall', l: 15, r: 15 },
  fill: 'barFill',
  nativeH: 19,
  /** Surco interior (filas 8..16: interior + bisel tan) que cubre el relleno;
   *  así la parte vacía muestra el bisel y la llena es un bloque sólido. */
  innerTop: 8,
  innerBottom: 17,
  /** Margen X del relleno respecto de cada extremo de la barra. */
  innerInset: 11,
} as const;

export const MUSIC = {
  background: backgroundMusic,
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
  /** Frames de la fila inferior (símbolos) para el dado de iconos de habilidad. */
  symbolFrames: [12, 13, 14, 15, 16, 17] as number[],
} as const;

// Unidades
import blueWarriorIdle from './assets/sprites/Units/Blue Units/Warrior/Warrior_Idle.png';
import redWarriorIdle from './assets/sprites/Units/Red Units/Warrior/Warrior_Idle.png';
import blueArcherIdle from './assets/sprites/Units/Blue Units/Archer/Archer_Idle.png';
import blueLancerIdle from './assets/sprites/Units/Blue Units/Lancer/Lancer_Idle.png';

// Edificios (Blue Buildings) — skyline del pueblo en la pantalla principal.
import blueCastle from './assets/sprites/Buildings/Blue Buildings/Castle.png';
import blueBarracks from './assets/sprites/Buildings/Blue Buildings/Barracks.png';
import blueTower from './assets/sprites/Buildings/Blue Buildings/Tower.png';
import blueHouse1 from './assets/sprites/Buildings/Blue Buildings/House1.png';
import blueHouse2 from './assets/sprites/Buildings/Blue Buildings/House2.png';
import blueHouse3 from './assets/sprites/Buildings/Blue Buildings/House3.png';
import blueMonastery from './assets/sprites/Buildings/Blue Buildings/Monastery.png';
import blueArchery from './assets/sprites/Buildings/Blue Buildings/Archery.png';

// Terreno / Recursos
import goldResource from './assets/sprites/Terrain/Resources/Gold/Gold Resource/Gold_Resource.png';
import cloud1 from './assets/sprites/Terrain/Decorations/Clouds/Clouds_01.png';
import cloud2 from './assets/sprites/Terrain/Decorations/Clouds/Clouds_02.png';

// Terreno decorativo (campo de entrenamiento / batalla)
import tilemapColor1 from './assets/sprites/Terrain/Tileset/Tilemap_color1.png';
import treeSheet from './assets/sprites/Terrain/Resources/Wood/Trees/Tree1.png';
import bushSheet from './assets/sprites/Terrain/Decorations/Bushes/Bushe1.png';
import sheepIdleSheet from './assets/sprites/Terrain/Resources/Meat/Sheep/Sheep_Idle.png';
import rock1 from './assets/sprites/Terrain/Decorations/Rocks/Rock1.png';
import rock2 from './assets/sprites/Terrain/Decorations/Rocks/Rock2.png';
import rock3 from './assets/sprites/Terrain/Decorations/Rocks/Rock3.png';
import rock4 from './assets/sprites/Terrain/Decorations/Rocks/Rock4.png';

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
  house1: blueHouse1,
  house2: blueHouse2,
  house3: blueHouse3,
  monastery: blueMonastery,
  archery: blueArchery,
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

/* ============================================================
   Terreno decorativo — campo de entrenamiento y batalla.
   El tileset es un grid 64x64 (9 col x 6 fil); el tile de césped
   central limpio (col 1, fila 1 = frame 10) tilea sin costuras y
   se usa como fuente de un TileSprite. Árbol/arbusto/oveja son
   spritesheets que se animan en bucle para dar vida al campo.
   ============================================================ */
export const TERRAIN = {
  tileset: tilemapColor1,
  tilesetKey: 'terrainTiles',
  tileSize: 64,
  tileCols: 9,
  /** Tile de césped central (col 1, fila 1) — repite sin costuras. */
  grassCenterFrame: 10,
  /** Rocas estáticas (clave Phaser 'terrain_rock1'..'terrain_rock4'). */
  rocks: { rock1, rock2, rock3, rock4 } as Record<string, string>,
} as const;

// Decoración animada del terreno (claves con prefijo `terrain` para no
// colisionar con las unidades/FX). Tamaños medidos de cada PNG.
export const TERRAIN_SHEETS: AnimSheet[] = [
  { texKey: 'terrainTree', url: treeSheet, frameW: 192, frameH: 256, frames: 8, frameRate: 8, repeat: -1 },
  { texKey: 'terrainBush', url: bushSheet, frameW: 128, frameH: 128, frames: 8, frameRate: 7, repeat: -1 },
  { texKey: 'terrainSheep', url: sheepIdleSheet, frameW: 128, frameH: 128, frames: 6, frameRate: 6, repeat: -1 },
];

/* ============================================================
   Enemigos de encuentro (PvE) — facciones de criaturas del pack
   `Enemies` para cuando `deriveArmy` reparte un General SINTÉTICO
   (encuentros de run, combate diario). Cada facción cubre los 3
   roles warrior/lancer/archer con una criatura propia; el PvP real
   entre jugadores sigue usando Blue/Red Units sin tocarse (ver
   `combat/army.ts` § factionForEnemy/isSyntheticEnemy).
   Solo se necesitan `idle` + ataque(s): `run`/`guard`/`dead` del
   pack humano tampoco se usan hoy en PvpCombatScene.
   ============================================================ */
// Solo las carpetas de criaturas usadas por ENEMY_UNIT_DEFS (el pack trae
// además edificios/props/facciones que no usamos: importar todo con `**`
// infla el bundle ~100 PNG de más). El patrón de `import.meta.glob` debe ser
// un literal estático, así que se listan una a una.
const enemyModules: Record<string, string> = {
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Thief/*.png', { eager: true, import: 'default' }),
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Skull/*.png', { eager: true, import: 'default' }),
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Gnoll/*.png', { eager: true, import: 'default' }),
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Minotaur/*.png', { eager: true, import: 'default' }),
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Goblin Raiders/Spear Goblin/*.png', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Goblin Raiders/Pig Rider Spear Goblin/*.png', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Goblin Raiders/Hex Shaman/*.png', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Caveborn/Bear/*.png', { eager: true, import: 'default' }),
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Caveborn/Turtle/*.png', {
    eager: true,
    import: 'default',
  }),
  ...import.meta.glob<string>('./assets/sprites/Enemies/Enemies/Caveborn/Lizard/*.png', {
    eager: true,
    import: 'default',
  }),
};

function enemyUrl(folder: string, file: string): string {
  const key = `./assets/sprites/Enemies/Enemies/${folder}/${file}`;
  const url = enemyModules[key];
  if (!url) throw new Error(`Asset de enemigo no encontrado: ${key}`);
  return url;
}

export type EnemyFaction = 'goblin' | 'beast' | 'undead' | 'warlord';

interface EnemyActionMeta { file: string; frameH: number; frames: number; frameRate: number; repeat: number }
interface EnemyUnitDef { folder: string; idle: EnemyActionMeta; attacks: Record<string, EnemyActionMeta> }

const ENEMY_UNIT_DEFS: Record<EnemyFaction, Record<'warrior' | 'archer' | 'lancer', EnemyUnitDef>> = {
  // Partida de Saqueadores / enemigos OFE-dominantes.
  goblin: {
    warrior: {
      folder: 'Goblin Raiders/Spear Goblin',
      idle: { file: 'Spear Goblin_Idle.png', frameH: 256, frames: 8, frameRate: 8, repeat: -1 },
      attacks: {
        attack1: { file: 'Spear Goblin_Attack Fast.png', frameH: 256, frames: 7, frameRate: 14, repeat: 0 },
        attack2: { file: 'Spear Goblin_Attack Strong.png', frameH: 256, frames: 8, frameRate: 14, repeat: 0 },
      },
    },
    lancer: {
      folder: 'Goblin Raiders/Pig Rider Spear Goblin',
      idle: { file: 'Pig Rider_Idle.png', frameH: 256, frames: 8, frameRate: 8, repeat: -1 },
      attacks: { attack: { file: 'Pig Rider_Attack.png', frameH: 256, frames: 7, frameRate: 14, repeat: 0 } },
    },
    archer: {
      folder: 'Goblin Raiders/Hex Shaman',
      idle: { file: 'Hex Shaman_Idle.png', frameH: 192, frames: 8, frameRate: 8, repeat: -1 },
      attacks: { shoot: { file: 'Hex Shaman_Attack.png', frameH: 192, frames: 10, frameRate: 16, repeat: 0 } },
    },
  },
  // Compañía Mercenaria / enemigos DEF-dominantes.
  beast: {
    warrior: {
      folder: 'Caveborn/Bear',
      idle: { file: 'Bear_Idle.png', frameH: 256, frames: 8, frameRate: 8, repeat: -1 },
      attacks: { attack: { file: 'Bear_Attack.png', frameH: 256, frames: 9, frameRate: 14, repeat: 0 } },
    },
    lancer: {
      folder: 'Caveborn/Turtle',
      idle: { file: 'Turtle_Idle.png', frameH: 320, frames: 10, frameRate: 8, repeat: -1 },
      attacks: { attack: { file: 'Turtle_Attack.png', frameH: 320, frames: 10, frameRate: 14, repeat: 0 } },
    },
    archer: {
      folder: 'Caveborn/Lizard',
      idle: { file: 'Lizard_Idle.png', frameH: 192, frames: 7, frameRate: 8, repeat: -1 },
      attacks: { attack: { file: 'Lizard_Attack.png', frameH: 192, frames: 9, frameRate: 14, repeat: 0 } },
    },
  },
  // Vanguardia Enemiga / enemigos MAN-dominantes.
  undead: {
    warrior: {
      folder: 'Thief',
      idle: { file: 'Thief_Idle.png', frameH: 192, frames: 6, frameRate: 8, repeat: -1 },
      attacks: { attack: { file: 'Thief_Attack.png', frameH: 192, frames: 6, frameRate: 14, repeat: 0 } },
    },
    lancer: {
      folder: 'Skull',
      idle: { file: 'Skull_Idle.png', frameH: 192, frames: 8, frameRate: 8, repeat: -1 },
      attacks: { attack: { file: 'Skull_Attack.png', frameH: 192, frames: 7, frameRate: 14, repeat: 0 } },
    },
    archer: {
      folder: 'Gnoll',
      idle: { file: 'Gnoll_Idle.png', frameH: 192, frames: 6, frameRate: 8, repeat: -1 },
      attacks: { shoot: { file: 'Gnoll_Throw.png', frameH: 192, frames: 8, frameRate: 16, repeat: 0 } },
    },
  },
  // Señor de la Guerra (jefe, power >= BOSS_POWER) — Minotaur en los 3 roles;
  // el rol lancer reutiliza la pose de guardia como idle para dar variedad.
  warlord: {
    warrior: {
      folder: 'Minotaur',
      idle: { file: 'Minotaur_Idle.png', frameH: 320, frames: 16, frameRate: 6, repeat: -1 },
      attacks: { attack: { file: 'Minotaur_Attack.png', frameH: 320, frames: 12, frameRate: 14, repeat: 0 } },
    },
    lancer: {
      folder: 'Minotaur',
      idle: { file: 'Minotaur_Guard.png', frameH: 320, frames: 11, frameRate: 6, repeat: -1 },
      attacks: { attack: { file: 'Minotaur_Attack.png', frameH: 320, frames: 12, frameRate: 14, repeat: 0 } },
    },
    archer: {
      folder: 'Minotaur',
      idle: { file: 'Minotaur_Idle.png', frameH: 320, frames: 16, frameRate: 6, repeat: -1 },
      attacks: { attack: { file: 'Minotaur_Attack.png', frameH: 320, frames: 12, frameRate: 14, repeat: 0 } },
    },
  },
};

function capitalize(s: string): string {
  return s[0].toUpperCase() + s.slice(1);
}

// Mismo patrón de `cu_<tipo><Facción>_<acción>` que UNIT_SHEETS, para que
// combatAssets.ts los encole/cachee sin distinguir origen humano/criatura.
export const ENEMY_UNIT_SHEETS: AnimSheet[] = [];
for (const faction of Object.keys(ENEMY_UNIT_DEFS) as EnemyFaction[]) {
  const cap = capitalize(faction);
  for (const type of ['warrior', 'lancer', 'archer'] as const) {
    const def = ENEMY_UNIT_DEFS[faction][type];
    const push = (action: string, m: EnemyActionMeta) => {
      ENEMY_UNIT_SHEETS.push({
        texKey: `cu_${type}${cap}_${action}`,
        url: enemyUrl(def.folder, m.file),
        frameW: m.frameH,
        frameH: m.frameH,
        frames: m.frames,
        frameRate: m.frameRate,
        repeat: m.repeat,
      });
    };
    push('idle', def.idle);
    for (const [action, m] of Object.entries(def.attacks)) push(action, m);
  }
}

/* ============================================================
   Cinemática de intro (primera run) — cara del enemigo (retrato de
   diálogo) y panda maestro. Se cargan/animan DIFERIDOS en IntroScene
   (solo se ven una vez), no en el arranque global.
   ============================================================ */
import enemyBossFace from './assets/sprites/Enemies/Enemy Avatars/Enemy Avatars_09.png';
import pandaRun from './assets/sprites/Enemies/Enemies/Panda/Panda_Run.png';
import pandaIdle from './assets/sprites/Enemies/Enemies/Panda/Panda_Idle.png';

/** Retrato estático (256x256) del JEFE FINAL (minotauro cornudo) para el diálogo
 *  de intro — coincide con la facción `warlord`/Minotaur de su ejército. */
export const CUTSCENE = {
  enemyBossFace,
  enemyBossKey: 'cutscene_enemy',
} as const;

/** Hojas animadas del panda maestro. Frames 256x256 (medidos del PNG:
 *  Run 1536/256 = 6 frames, Idle 2560/256 = 10 frames). */
export const PANDA_SHEETS: AnimSheet[] = [
  { texKey: 'panda_run', url: pandaRun, frameW: 256, frameH: 256, frames: 6, frameRate: 12, repeat: -1 },
  { texKey: 'panda_idle', url: pandaIdle, frameW: 256, frameH: 256, frames: 10, frameRate: 8, repeat: -1 },
];

export { UI };
