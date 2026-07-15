/* ============================================================
   abilityCast.ts — feedback de habilidades para el SIMULADOR de
   batalla (PvpCombatScene).

   - ABILITY_META: clasifica cada habilidad de combate por bando
     (attacker/defender), si tiene tirada de % (random) y qué icono
     del "dado de iconos" (DICE.symbolFrames) la representa.
   - CommanderPanel: retrato de un general anclado en una esquina
     inferior con una BARRA DE CARGA superpuesta que se llena cuando
     ese general activa una habilidad. Para habilidades con % añade
     un `iconDie` al lado del retrato.
   - iconDie: mini-dado decorativo que gira y aterriza en un SÍMBOLO
     (sin número de pips), sólo para indicar habilidades aleatorias.

   El RESULTADO ya lo decidió `simulateBattle`; aquí sólo animamos lo
   que la ronda dice que pasó (BattleRound.abilityProcs).
   ============================================================ */
import Phaser from 'phaser';
import { COLORS } from './theme.ts';
import { DICE } from '../assets.ts';
import { portrait, titleText, bodyText } from './widgets.ts';
import { COMBAT_ABILITIES } from '../../shared/sim/index.ts';

type Scene = Phaser.Scene;

export type AbilityKind = 'attacker' | 'defender';

export interface AbilityMeta {
  kind: AbilityKind;
  random: boolean; // ¿se resuelve con una tirada de % (muestra dado de iconos)?
  symbolFrame: number; // frame del símbolo en DICE.symbolFrames
}

/* Símbolos de la fila inferior del sprite (DICE.symbolFrames):
   12 corazón · 13 trébol · 14 estallido · 15 espada · 16 orbe · 17 escudo. */
const SYM_SWORD = 15;
const SYM_SHIELD = 17;
const SYM_BURST = 14;

const symbolForKind = (kind: AbilityKind): number => (kind === 'defender' ? SYM_SHIELD : SYM_SWORD);

/* Habilidades "hardcodeadas" en simulateBattle.ts (no viven en COMBAT_ABILITIES). */
const HARDCODED: Record<string, AbilityMeta> = {
  'Devastating Charge': { kind: 'attacker', random: true, symbolFrame: SYM_BURST },
  'Command Shout': { kind: 'attacker', random: true, symbolFrame: SYM_SWORD },
  'Battle Fury': { kind: 'attacker', random: false, symbolFrame: SYM_SWORD },
  'Unbreakable Shield': { kind: 'defender', random: true, symbolFrame: SYM_SHIELD },
  'Iron Bulwark': { kind: 'defender', random: false, symbolFrame: SYM_SHIELD },
};

/* Habilidades de consejero: el `kind` sale del catálogo compartido; todas
   procean a 1/6 (random) y usan el símbolo según su bando. */
const CONSEJERO_META: Record<string, AbilityMeta> = Object.fromEntries(
  Object.values(COMBAT_ABILITIES).map((a) => [
    a.ability,
    { kind: a.kind as AbilityKind, random: true, symbolFrame: symbolForKind(a.kind as AbilityKind) },
  ])
);

export const ABILITY_META: Record<string, AbilityMeta> = { ...CONSEJERO_META, ...HARDCODED };

/** Metadatos de una habilidad por nombre, con fallback seguro. */
export function abilityMeta(name: string): AbilityMeta {
  return ABILITY_META[name] ?? { kind: 'attacker', random: false, symbolFrame: SYM_SWORD };
}

/* ---- Dado de iconos (decorativo, sin número) ----------------- */
/** Gira un mini-dado y aterriza en `symbolFrame`. Fire-and-forget. */
export function iconDie(
  scene: Scene,
  x: number,
  y: number,
  symbolFrame: number,
  opts: { size?: number; depth?: number; tumbleMs?: number; hold?: number } = {}
): void {
  const size = opts.size ?? 46;
  const depth = opts.depth ?? 70;
  const tumbleMs = opts.tumbleMs ?? 380;
  const hold = opts.hold ?? 800;
  const scaleBase = size / DICE.frameH;

  const plate = scene.add
    .rectangle(x, y, size + 10, size + 10, COLORS.card)
    .setStrokeStyle(3, COLORS.border)
    .setDepth(depth);
  const sprite = scene.add
    .sprite(x, y, DICE.key, DICE.blankFrames[0])
    .setScale(scaleBase)
    .setDepth(depth + 1);

  const wob = scene.tweens.add({
    targets: [plate, sprite],
    y: y - 8,
    angle: 8,
    yoyo: true,
    repeat: -1,
    duration: 150,
  });

  const spinSeq = [...DICE.blankFrames, ...DICE.blankFrames];
  const stepMs = Math.max(40, Math.round(tumbleMs / spinSeq.length));
  let k = 0;
  const spin = scene.time.addEvent({
    delay: stepMs,
    loop: true,
    callback: () => {
      if (k < spinSeq.length) {
        sprite.setFrame(spinSeq[k]);
        k++;
        return;
      }
      spin.remove(false);
      wob.stop();
      plate.setAngle(0).setY(y).setStrokeStyle(3, COLORS.gold);
      sprite.setAngle(0).setY(y).setFrame(symbolFrame);
      scene.tweens.add({
        targets: sprite,
        scaleX: { from: scaleBase * 1.3, to: scaleBase },
        scaleY: { from: scaleBase * 1.3, to: scaleBase },
        duration: 180,
        ease: 'Back.easeOut',
      });
      scene.tweens.add({
        targets: plate,
        scaleX: { from: 1.3, to: 1 },
        scaleY: { from: 1.3, to: 1 },
        duration: 180,
        ease: 'Back.easeOut',
      });
      scene.time.delayedCall(hold, () => {
        scene.tweens.add({
          targets: [plate, sprite],
          alpha: 0,
          duration: 280,
          onComplete: () => {
            plate.destroy();
            sprite.destroy();
          },
        });
      });
    },
  });
}

/* ---- Panel de comandante en esquina ------------------------- */
export interface CommanderPanelOpts {
  side: 'left' | 'right';
  tint?: number;
  size?: number;
}

/** Retrato de general en esquina inferior + barra de carga superpuesta. */
export class CommanderPanel {
  private scene: Scene;
  private side: 'left' | 'right';
  private size: number;
  private root: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Container;
  private glow: Phaser.GameObjects.Rectangle;
  private nameLabel: Phaser.GameObjects.Text;
  private abilityLabel: Phaser.GameObjects.Text;
  private barBack: Phaser.GameObjects.Rectangle;
  private barFill: Phaser.GameObjects.Rectangle;
  private barW: number;
  private clearTimer?: Phaser.Time.TimerEvent;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    generalId: string,
    generalName: string,
    opts: CommanderPanelOpts
  ) {
    this.scene = scene;
    this.side = opts.side;
    this.size = opts.size ?? 120;
    const size = this.size;

    this.root = scene.add.container(x, y).setDepth(55);

    // Halo que parpadea al activar una habilidad (detrás del retrato).
    this.glow = scene.add.rectangle(0, 0, size + 14, size + 14, COLORS.gold, 0.0).setStrokeStyle(0, COLORS.gold);
    const pic = portrait(scene, 0, 0, generalId, size, opts.tint);
    this.body = scene.add.container(0, 0, [this.glow, pic]);

    // Nombre encima del retrato.
    const shortName = generalName.length > 12 ? generalName.slice(0, 12) + '…' : generalName;
    this.nameLabel = titleText(scene, 0, -size / 2 - 16, shortName, 10, COLORS.cream);

    // Etiqueta de habilidad sobre el retrato (oculta por defecto).
    this.abilityLabel = bodyText(scene, 0, -size / 2 + 16, '', 10, COLORS.gold)
      .setAlpha(0)
      .setWordWrapWidth(size + 30)
      .setAlign('center');

    // Barra de carga superpuesta en el tercio inferior del retrato.
    this.barW = size - 16;
    const barY = size / 2 - 18;
    this.barBack = scene.add
      .rectangle(0, barY, this.barW, 14, 0x2a221a, 0.92)
      .setStrokeStyle(2, COLORS.border)
      .setAlpha(0);
    this.barFill = scene.add
      .rectangle(-this.barW / 2 + 2, barY, 0, 9, COLORS.gold)
      .setOrigin(0, 0.5)
      .setAlpha(0);

    this.root.add([this.body, this.barBack, this.barFill, this.nameLabel, this.abilityLabel]);
  }

  /** Anima la activación de una habilidad: pulso + barra que se llena (+ dado si es %). */
  cast(abilityName: string): void {
    const meta = abilityMeta(abilityName);
    this.clearTimer?.remove(false);

    // Etiqueta + halo.
    this.abilityLabel.setText(abilityName).setAlpha(1);
    this.glow.setFillStyle(COLORS.gold, 0.0).setStrokeStyle(3, COLORS.gold);
    this.scene.tweens.add({ targets: this.body, scaleX: 1.06, scaleY: 1.06, yoyo: true, duration: 130 });

    // Barra de carga 0 -> 1.
    this.barBack.setAlpha(1);
    this.barFill.setAlpha(1);
    const o = { v: 0 };
    this.barFill.width = 0;
    this.scene.tweens.add({
      targets: o,
      v: 1,
      duration: 360,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        this.barFill.width = (this.barW - 4) * o.v;
      },
      onComplete: () => {
        this.scene.tweens.add({ targets: this.barFill, scaleY: { from: 1.6, to: 1 }, duration: 160, ease: 'Back.easeOut' });
      },
    });

    // Dado de iconos al lado del retrato (sólo % aleatorio).
    if (meta.random) {
      const dieX = this.side === 'left' ? this.size / 2 + 36 : -this.size / 2 - 36;
      iconDie(this.scene, this.root.x + dieX, this.root.y - 6, meta.symbolFrame, { size: 46, depth: 72 });
    }

    // Apaga el feedback tras un momento.
    this.clearTimer = this.scene.time.delayedCall(1500, () => {
      this.scene.tweens.add({
        targets: [this.abilityLabel, this.barBack, this.barFill],
        alpha: 0,
        duration: 300,
      });
      this.glow.setStrokeStyle(0, COLORS.gold);
    });
  }

  destroy(): void {
    this.clearTimer?.remove(false);
    this.root.destroy();
  }
}
