/* ============================================================
   BootScene — precarga de assets y registro de animaciones.
   Reutiliza el registro de URLs de assets.ts (Vite las hashea),
   las alimenta al loader de Phaser y arranca HomeScene.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, hex, GAME_W, GAME_H, CONTENT_W, TEXT_RES, fontPx, FONT } from '../ui/theme.ts';
import { ICON, SPRITE, AVATARS, PANEL, TERRAIN, TERRAIN_SHEETS, DICE } from '../assets.ts';
import splashUrl from '../assets/bannerfall_splash.jpg';

// Spritesheets animados (frames horizontales). Tamaños reales del pack:
// warrior 1536x192 (8x192), archer 1152x192 (6x192), lancer 3840x320 (12x320).
const SHEETS: Record<string, { url: string; frameWidth: number; frameHeight: number; frames: number }> = {
  warriorBlue: { url: SPRITE.warriorBlue, frameWidth: 192, frameHeight: 192, frames: 8 },
  warriorRed: { url: SPRITE.warriorRed, frameWidth: 192, frameHeight: 192, frames: 8 },
  archerBlue: { url: SPRITE.archerBlue, frameWidth: 192, frameHeight: 192, frames: 6 },
  lancerBlue: { url: SPRITE.lancerBlue, frameWidth: 320, frameHeight: 320, frames: 12 },
};

// Imágenes estáticas del campo / decoración.
const IMAGES: Record<string, string> = {
  castle: SPRITE.castle,
  barracks: SPRITE.barracks,
  tower: SPRITE.tower,
  house1: SPRITE.house1,
  house2: SPRITE.house2,
  house3: SPRITE.house3,
  monastery: SPRITE.monastery,
  archery: SPRITE.archery,
  goldResource: SPRITE.goldResource,
  cloud1: SPRITE.cloud1,
  cloud2: SPRITE.cloud2,
  explosion: SPRITE.explosion,
  paper: PANEL.paper,
  paperSpecial: PANEL.paperSpecial,
  banner: PANEL.banner,
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // El splash (portada Bannerfall) se carga PRIMERO y se usa como fondo de la
    // pantalla de carga en cuanto llega, en vez de quedar en caché sin mostrarse.
    this.load.image('splash', splashUrl);
    this.load.once('filecomplete-image-splash', () => this.showSplashBackdrop());
    this.drawLoadingBar();

    for (const [key, sheet] of Object.entries(SHEETS)) {
      this.load.spritesheet(key, sheet.url, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
    // Decoración de terreno (árbol/arbusto/oveja): spritesheets animados que
    // decoran tanto el menú como el campo. Las hojas de UNIDADES de combate, los
    // FX y las flechas NO se cargan aquí — se difieren a PvpCombatScene vía
    // combat/combatAssets.ts para aligerar el arranque (~300 KB menos).
    for (const s of TERRAIN_SHEETS) {
      this.load.spritesheet(s.texKey, s.url, { frameWidth: s.frameW, frameHeight: s.frameH });
    }
    // Tileset de césped (grid 64x64, sin animar) + rocas estáticas del campo.
    this.load.spritesheet(TERRAIN.tilesetKey, TERRAIN.tileset, {
      frameWidth: TERRAIN.tileSize,
      frameHeight: TERRAIN.tileSize,
    });
    for (const [name, url] of Object.entries(TERRAIN.rocks)) {
      this.load.image(`terrain_${name}`, url);
    }
    // Dados (sin animación: las caras se ciclan a mano para respetar el rango permitido).
    this.load.spritesheet(DICE.key, DICE.url, { frameWidth: DICE.frameW, frameHeight: DICE.frameH });
    for (const [key, url] of Object.entries(IMAGES)) {
      this.load.image(key, url);
    }
    // Iconos UI: clave 'icon_<nombre>'.
    for (const [name, url] of Object.entries(ICON)) {
      this.load.image(`icon_${name}`, url);
    }
    // Avatares: clave 'avatar_<n>' (ver avatarKeyFor).
    AVATARS.forEach((url, i) => this.load.image(`avatar_${i}`, url));
  }

  create(): void {
    for (const [key, sheet] of Object.entries(SHEETS)) {
      this.anims.create({
        key: `${key}_idle`,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: sheet.frames - 1 }),
        frameRate: sheet.frames === 12 ? 10 : 8,
        repeat: -1,
      });
    }
    // Anims de la decoración de terreno (clave de anim == clave de textura).
    // Las anims de unidades de combate y FX se crean en PvpCombatScene tras la
    // carga diferida (ver combat/combatAssets.ts § ensureBattleAnims).
    for (const s of TERRAIN_SHEETS) {
      this.anims.create({
        key: s.texKey,
        frames: this.anims.generateFrameNumbers(s.texKey, { start: 0, end: s.frames - 1 }),
        frameRate: s.frameRate,
        repeat: s.repeat,
      });
    }
    this.scene.start('Home');
  }

  /** Coloca el splash como fondo (cover-fit) detrás de la barra de carga. */
  private showSplashBackdrop(): void {
    const img = this.add.image(GAME_W / 2, GAME_H / 2, 'splash').setDepth(-10);
    // Cubrir 960x1280 conservando proporción (recorta laterales del cuadrado).
    img.setScale(Math.max(GAME_W / img.width, GAME_H / img.height));
    // Velo oscuro para que la barra de carga y el % se lean sobre el arte.
    this.add.rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x000000, 0.42).setDepth(-9);
  }

  private drawLoadingBar(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const cx = GAME_W / 2;
    // Barra cerca del borde inferior para no tapar el título de la portada.
    const cy = GAME_H - 170;

    const barW = CONTENT_W;
    const barH = 28;
    this.add.rectangle(cx, cy, barW + 8, barH + 8, COLORS.panelDark).setStrokeStyle(3, COLORS.border);
    const fill = this.add.rectangle(cx - barW / 2, cy, 1, barH, COLORS.lime).setOrigin(0, 0.5);
    const pct = this.add
      .text(cx, cy + 46, '0%', { fontFamily: FONT.title, fontStyle: '700', fontSize: `${fontPx(18)}px`, color: hex(COLORS.cream) })
      .setResolution(TEXT_RES)
      .setOrigin(0.5)
      .setShadow(0, 2, 'rgba(0,0,0,0.6)', 3, false, true);

    this.load.on('progress', (value: number) => {
      fill.width = Math.max(1, barW * value);
      pct.setText(`${Math.round(value * 100)}%`);
    });
  }
}
