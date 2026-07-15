/* ============================================================
   dialog.ts — caja de diálogo cinemático reutilizable.

   Retrato (cara grande de cutscene o compacto de coach) + panel de
   habla con nombre y texto "máquina de escribir", y avance por tap.
   Lo consumen la cinemática de intro (enemigo/comandante/panda/general)
   y el TutorialCoach (recuadro del panda que explica la UI).
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W, GAME_H, PAD, CONTENT_W } from './theme.ts';
import { retroPanel, titleText, bodyText } from './widgets.ts';
import { avatarKeyFor } from '../assets.ts';

export interface DialogLine {
  name: string;
  text: string;
  /** Clave de textura de la cara (imagen o spritesheet). */
  textureKey?: string;
  /** Frame concreto si `textureKey` es un spritesheet. */
  frame?: number;
  /** Alternativa: retrato de avatar por semilla estable (si no hay textureKey). */
  portraitSeed?: string;
  /** Lado del retrato dentro del panel. */
  side?: 'left' | 'right';
  /** Acento de color del marco/nombre. */
  tint?: number;
}

export interface DialogBoxOpts {
  /** Retrato grande (cinemática) vs compacto (coach). */
  big?: boolean;
  /** Centro vertical del panel (px espacio de diseño). Por defecto abajo. */
  y?: number;
  depth?: number;
  /** Fondo interactivo a pantalla completa para avanzar con un tap. Default true. */
  backdrop?: boolean;
  /** Oscurecer el fondo (solo con backdrop). Default true en modo big. */
  dim?: boolean;
  /** Texto de ayuda del avance. */
  hint?: string;
  /** ms por carácter del efecto máquina de escribir. */
  cpsMs?: number;
  /** Se invoca cuando el jugador avanza tras completar esta línea. */
  onAdvance?: () => void;
}

/** Una línea de diálogo en pantalla (retrato + panel + texto animado). */
export class DialogBox {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private backdrop?: Phaser.GameObjects.Rectangle;
  private body: Phaser.GameObjects.Text;
  private hintText?: Phaser.GameObjects.Text;
  private full: string;
  private shown = 0;
  private typing = true;
  private timer?: Phaser.Time.TimerEvent;
  private onAdvance?: () => void;
  private hint: string;

  constructor(scene: Phaser.Scene, line: DialogLine, opts: DialogBoxOpts = {}) {
    this.scene = scene;
    this.full = line.text;
    this.onAdvance = opts.onAdvance;
    this.hint = opts.hint ?? '▶ tap to continue';
    const depth = opts.depth ?? 800;
    const big = opts.big ?? false;
    const side = line.side ?? 'left';
    const accent = line.tint ?? COLORS.gold;

    this.root = scene.add.container(0, 0).setDepth(depth);

    // Fondo interactivo para avanzar (y, opcional, oscurecer la escena).
    if (opts.backdrop !== false) {
      const dim = opts.dim ?? big;
      this.backdrop = scene.add
        .rectangle(0, 0, GAME_W, GAME_H, 0x0a0806, dim ? 0.6 : 0.001)
        .setOrigin(0, 0)
        .setInteractive();
      this.backdrop.on('pointerdown', () => this.tap());
      this.root.add(this.backdrop);
    }

    const panelH = big ? 300 : 210;
    const panelY = opts.y ?? GAME_H - panelH / 2 - 44;
    const panel = retroPanel(scene, GAME_W / 2, panelY, CONTENT_W, panelH, COLORS.panelDark);
    this.root.add(panel);

    // Retrato en marco biselado, asomado sobre el borde del panel.
    const pSize = big ? 236 : 118;
    const pX = side === 'left' ? PAD + pSize / 2 + 6 : GAME_W - PAD - pSize / 2 - 6;
    const pY = panelY - (big ? 60 : 8);
    const frameBox = scene.add.rectangle(pX, pY, pSize, pSize, COLORS.card2).setStrokeStyle(4, accent);
    const faceKey = line.textureKey ?? (line.portraitSeed ? avatarKeyFor(line.portraitSeed) : undefined);
    this.root.add(frameBox);
    if (faceKey) {
      const face = scene.add.image(pX, pY, faceKey, line.frame).setDisplaySize(pSize - 8, pSize - 8);
      this.root.add(face);
    }

    // Región de texto = lado opuesto al retrato.
    const gap = 26;
    const regLeft = side === 'left' ? PAD + pSize + gap : PAD + 20;
    const regRight = side === 'left' ? GAME_W - PAD - 20 : GAME_W - PAD - pSize - gap;
    const regCx = (regLeft + regRight) / 2;
    const wrapW = regRight - regLeft;

    this.root.add(
      titleText(scene, regCx, panelY - panelH / 2 + 30, line.name.toUpperCase(), big ? 20 : 15, accent)
    );

    this.body = bodyText(scene, regCx, panelY - (big ? 6 : 2), '', big ? 19 : 15, COLORS.cream)
      .setOrigin(0.5, 0.5)
      .setWordWrapWidth(wrapW)
      .setAlign('center');
    this.root.add(this.body);

    this.hintText = bodyText(scene, regRight, panelY + panelH / 2 - 24, '', 11, accent)
      .setOrigin(1, 0.5)
      .setAlpha(0.85);
    this.root.add(this.hintText);

    // Pop-in del panel + retrato.
    this.root.setScale(0.98);
    scene.tweens.add({ targets: this.root, scale: 1, duration: 140, ease: 'Back.easeOut' });

    this.startTypewriter(opts.cpsMs ?? 22);
  }

  private startTypewriter(cpsMs: number): void {
    this.timer?.remove();
    this.timer = this.scene.time.addEvent({
      delay: cpsMs,
      loop: true,
      callback: () => {
        this.shown++;
        this.body.setText(this.full.slice(0, this.shown));
        if (this.shown >= this.full.length) this.finishTyping();
      },
    });
  }

  private finishTyping(): void {
    this.timer?.remove();
    this.timer = undefined;
    this.typing = false;
    this.body.setText(this.full);
    this.hintText?.setText(this.hint);
  }

  /** Un tap: primero completa el texto; luego avanza. */
  tap(): void {
    if (this.typing) {
      this.finishTyping();
      return;
    }
    this.onAdvance?.();
  }

  destroy(): void {
    this.timer?.remove();
    this.scene.tweens.killTweensOf(this.root);
    this.root.destroy();
  }
}

/** Controlador de una secuencia de líneas. */
export interface DialogSequence {
  destroy(): void;
}

/** Encadena varias líneas de diálogo; llama `onComplete` al pasar la última. */
export function runDialogSequence(
  scene: Phaser.Scene,
  lines: DialogLine[],
  opts: DialogBoxOpts,
  onComplete?: () => void
): DialogSequence {
  let i = 0;
  let box: DialogBox | undefined;
  const showNext = (): void => {
    box?.destroy();
    if (i >= lines.length) {
      onComplete?.();
      return;
    }
    const line = lines[i++];
    box = new DialogBox(scene, line, { ...opts, onAdvance: showNext });
  };
  showNext();
  return { destroy: () => box?.destroy() };
}
