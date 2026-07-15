/* ============================================================
   DiceRoller — widget de tirada de dados (teatro determinista).

   El RESULTADO ya lo decidió el motor (stepRun) y viaja en
   TurnResult.dice (caras, banda, spec efectivo). Este widget solo
   ANIMA: gira mostrando los dados "en blanco" (fila central del
   sprite) durante 2 ciclos y aterriza en la cara con pips del
   resultado. Al asentar el último dado llama a `onSettled` para que
   la escena dispare su feedback habitual.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS } from './theme.ts';
import { DICE } from '../assets.ts';
import { titleText, bodyText } from './widgets.ts';
import type { TurnResult } from '../../shared/types/index.ts';

type DiceData = NonNullable<TurnResult['dice']>;

export interface DiceRollerOpts {
  scale?: number;
  gap?: number;
  tumbleMs?: number;
  staggerMs?: number;
  depth?: number;
  onSettled?: () => void;
}

const BAND_COLOR: Record<string, number> = {
  FALLO: COLORS.danger,
  NORMAL: COLORS.cream,
  CRITICO: COLORS.gold,
};

const BAND_LABEL: Record<string, string> = {
  FALLO: '✗ FAIL',
  NORMAL: '▶',
  CRITICO: '✦ CRIT',
};

export class DiceRoller {
  private scene: Phaser.Scene;
  private root: Phaser.GameObjects.Container;
  private timers: Phaser.Time.TimerEvent[] = [];
  private done = false;
  private onSettled?: () => void;
  private scaleF: number;
  private gap: number;
  private tumbleMs: number;
  private staggerMs: number;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: DiceRollerOpts = {}) {
    this.scene = scene;
    this.root = scene.add.container(x, y).setDepth(opts.depth ?? 650);
    this.onSettled = opts.onSettled;
    this.scaleF = opts.scale ?? 1.7;
    this.gap = opts.gap ?? 66;
    this.tumbleMs = opts.tumbleMs ?? 820;
    this.staggerMs = opts.staggerMs ?? 140;
  }

  container(): Phaser.GameObjects.Container {
    return this.root;
  }

  destroy(): void {
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
    this.scene.tweens.killTweensOf(this.root.getAll());
    this.root.destroy();
  }

  /** Anima la tirada y aterriza en `res.faces`. */
  roll(res: DiceData): void {
    const faces = res.faces.length ? res.faces : [res.keptFace];
    const n = faces.length;
    const dieSize = Math.round(DICE.frameH * this.scaleF);
    const startX = -((n - 1) * this.gap) / 2;
    let settledCount = 0;

    faces.forEach((finalFace, i) => {
      const dx = startX + i * this.gap;
      const allowed = res.roll?.dice?.[i]?.allowed ?? [1, 2, 3, 4, 5, 6];

      const plate = this.scene.add
        .rectangle(dx, 0, dieSize + 12, dieSize + 12, COLORS.card)
        .setStrokeStyle(3, COLORS.border);
      const sprite = this.scene.add
        .sprite(dx, 0, DICE.key, DICE.blankFrames[0])
        .setDisplaySize(dieSize, dieSize);
      this.root.add([plate, sprite]);

      // Chip de rango/lock bajo el dado (avisa que el dado fue reformado).
      const constrained = allowed.length < 6;
      const chip =
        allowed.length === 1
          ? `🔒${allowed[0]}`
          : `${allowed[0]}-${allowed[allowed.length - 1]}`;
      this.root.add(
        bodyText(this.scene, dx, dieSize / 2 + 16, chip, 11, constrained ? COLORS.gold : COLORS.cream).setAlpha(
          constrained ? 1 : 0.7
        )
      );

      const settleDie = (): void => {
        this.scene.tweens.killTweensOf([plate, sprite]);
        sprite.setAngle(0).setPosition(dx, 0).setFrame(DICE.pipFrame(finalFace));
        plate.setAngle(0).setPosition(dx, 0).setStrokeStyle(3, BAND_COLOR[res.band] ?? COLORS.border);
        this.scene.tweens.add({
          targets: [plate, sprite],
          scaleX: { from: 1.25, to: 1 },
          scaleY: { from: 1.25, to: 1 },
          duration: 200,
          ease: 'Back.easeOut',
        });
        settledCount++;
        if (settledCount === n) this.finish(res, dieSize);
      };

      // Giro: 2 ciclos de la fila central (dados en blanco) y aterriza en el número.
      const spinSeq = [...DICE.blankFrames, ...DICE.blankFrames];
      const stepMs = Math.max(45, Math.round(this.tumbleMs / spinSeq.length));
      const start = this.scene.time.delayedCall(i * this.staggerMs, () => {
        this.scene.tweens.add({ targets: [plate, sprite], y: -10, angle: 8, yoyo: true, repeat: -1, duration: 150 });
        let k = 0;
        const spin = this.scene.time.addEvent({
          delay: stepMs,
          loop: true,
          callback: () => {
            if (k < spinSeq.length) {
              sprite.setFrame(spinSeq[k]);
              k++;
            } else {
              spin.remove(false);
              settleDie();
            }
          },
        });
        this.timers.push(spin);
      });
      this.timers.push(start);
    });
  }

  private finish(res: DiceData, dieSize: number): void {
    if (this.done) return;
    this.done = true;
    const color = BAND_COLOR[res.band] ?? COLORS.cream;
    const label =
      res.band === 'NORMAL' ? `▶ ${res.keptFace}` : BAND_LABEL[res.band] ?? `${res.keptFace}`;
    this.root.add(titleText(this.scene, 0, dieSize / 2 + 40, label, 16, color));
    this.onSettled?.();
  }
}
