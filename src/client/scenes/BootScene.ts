/* ============================================================
   BootScene — precarga de assets y registro de animaciones.
   Reutiliza el registro de URLs de assets.ts (Vite las hashea),
   las alimenta al loader de Phaser y arranca HomeScene.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, hex, GAME_W, GAME_H, CONTENT_W, TEXT_RES } from '../ui/theme.ts';
import { ICON, SPRITE, AVATARS, PANEL, UNIT_SHEETS, FX_SHEETS, ARROW, DICE } from '../assets.ts';
import splashUrl from '../assets/bannerfall_splash.png';

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
  goldResource: SPRITE.goldResource,
  cloud1: SPRITE.cloud1,
  cloud2: SPRITE.cloud2,
  explosion: SPRITE.explosion,
  splash: splashUrl,
  paper: PANEL.paper,
  paperSpecial: PANEL.paperSpecial,
  banner: PANEL.banner,
};

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.drawLoadingBar();

    for (const [key, sheet] of Object.entries(SHEETS)) {
      this.load.spritesheet(key, sheet.url, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      });
    }
    // Unidades de combate + FX (Fase 2): spritesheets animados con clave `cu_`.
    for (const s of [...UNIT_SHEETS, ...FX_SHEETS]) {
      this.load.spritesheet(s.texKey, s.url, { frameWidth: s.frameW, frameHeight: s.frameH });
    }
    this.load.image('cu_arrow_blue', ARROW.blue);
    this.load.image('cu_arrow_red', ARROW.red);
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
    // Anims de las unidades de combate y FX (clave de anim == clave de textura).
    for (const s of [...UNIT_SHEETS, ...FX_SHEETS]) {
      this.anims.create({
        key: s.texKey,
        frames: this.anims.generateFrameNumbers(s.texKey, { start: 0, end: s.frames - 1 }),
        frameRate: s.frameRate,
        repeat: s.repeat,
      });
    }
    this.scene.start('Home');
  }

  private drawLoadingBar(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;

    this.add
      .text(cx, cy - 70, 'TINY\nTACTICIANS', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '30px',
        color: hex(COLORS.lime),
        align: 'center',
        lineSpacing: 14,
      })
      .setResolution(TEXT_RES)
      .setOrigin(0.5);

    const barW = CONTENT_W;
    const barH = 28;
    this.add.rectangle(cx, cy + 40, barW + 8, barH + 8, COLORS.panelDark).setStrokeStyle(3, COLORS.border);
    const fill = this.add.rectangle(cx - barW / 2, cy + 40, 1, barH, COLORS.lime).setOrigin(0, 0.5);
    const pct = this.add
      .text(cx, cy + 90, '0%', { fontFamily: '"Press Start 2P", monospace', fontSize: '16px', color: hex(COLORS.cream) })
      .setResolution(TEXT_RES)
      .setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      fill.width = Math.max(1, barW * value);
      pct.setText(`${Math.round(value * 100)}%`);
    });
  }
}
