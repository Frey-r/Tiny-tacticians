/* ============================================================
   tutorialCoach.ts — guía del panda para la PRIMERA RUN.

   Superpone un "spotlight" (recorte) que resalta la sección de la UI
   que el panda explica y, con un recuadro de diálogo (reusa DialogBox),
   acompaña la run real: fuerza el primer entrenamiento y explica las
   tiradas, los consejeros, energía/ánimo, el live feed y —de forma
   contextual— los eventos, encuentros y la acuñación.

   Vive FUERA del contenedor `this.dyn` de RunPlayScene (que se
   reconstruye en cada render), a un depth alto y con coordenadas fijas
   de las secciones de la escena.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W, GAME_H, PAD, CONTENT_W } from './theme.ts';
import { DialogBox } from './dialog.ts';
import type { DialogLine } from './dialog.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rects fijos de cada sección de RunPlayScene (derivados de sus coords). */
export const COACH_RECTS: Record<string, Rect> = {
  header: { x: PAD - 8, y: 108, w: CONTENT_W + 16, h: 168 },
  deck: { x: PAD - 8, y: 284, w: CONTENT_W + 16, h: 188 },
  liveFeed: { x: PAD - 8, y: 558, w: CONTENT_W + 16, h: 258 },
  dice: { x: GAME_W / 2 - 170, y: 812, w: 340, h: 150 },
  training: { x: PAD - 8, y: 940, w: CONTENT_W + 16, h: 322 },
  event: { x: PAD - 8, y: 952, w: CONTENT_W + 16, h: 306 },
  encounter: { x: PAD - 8, y: 972, w: CONTENT_W + 16, h: 236 },
  completion: { x: PAD - 8, y: 978, w: CONTENT_W + 16, h: 288 },
};

interface Step {
  text: string;
  rectKey?: keyof typeof COACH_RECTS;
  /** Paso forzado: no avanza por tap; espera `notifyAction(gate)`. */
  gate?: 'train';
}

const DEPTH_SPOT = 950;
const DEPTH_BOX = 960;

function pandaLine(text: string): DialogLine {
  return { name: 'Master Panda', text, textureKey: 'panda_idle', frame: 0, side: 'left', tint: COLORS.lime };
}

export class TutorialCoach {
  private scene: Phaser.Scene;
  private spot: Phaser.GameObjects.GameObject[] = [];
  private box?: DialogBox;
  private queue: Step[] = [];
  private waitingGate?: 'train';
  private shownStates = new Set<string>();
  private finished = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Arranca la secuencia de apertura (turno 0 = entrenamiento). */
  start(): void {
    this.queue = [
      { text: "Welcome, commander! I'm your master. I'll teach you to forge an unstoppable army." },
      {
        text: "Here you see the TURN, your ENERGY, and the troops' MOOD. Low energy means more failures; mood improves or worsens your rolls.",
        rectKey: 'header',
      },
      {
        text: 'These are your ADVISORS. Each turn some ASSIST at random: they build affinity and, once full, unlock a combat ability.',
        rectKey: 'deck',
      },
      {
        text: 'This is your CAMP: here the recruit that becomes your general is formed.',
        rectKey: 'liveFeed',
      },
      {
        text: 'Now train! Each card (OFE, DEF, MAN) shows the gain and the odds. Tap one to train.',
        rectKey: 'training',
        gate: 'train',
      },
    ];
    this.next();
  }

  /** La escena avisa que ocurrió una acción forzada (p. ej. el 1er entrenamiento). */
  notifyAction(kind: 'train'): void {
    if (this.waitingGate === kind) {
      this.waitingGate = undefined;
      this.clear();
      // El resto (explicar la tirada) lo dispara la escena en `afterFirstTrain`
      // cuando el dado se asienta, para que el panda hable SOBRE el resultado.
    }
  }

  /** Tras asentarse el dado del 1er entrenamiento: explica la tirada y libera. */
  afterFirstTrain(): void {
    if (this.finished) return;
    this.queue = [
      {
        text: 'That was a dice ROLL! FAIL gives nothing, NORMAL adds, and CRIT (gold) adds extra. Advisors and mood reshape the die in your favor.',
        rectKey: 'dice',
      },
      {
        text: "Keep training (and rest if energy drops). Clear the encounters and, at the end, mint your general! You're in command now, commander.",
      },
    ];
    this.next();
  }

  /** Explicación contextual de una sección la PRIMERA vez que aparece. */
  onState(state: 'event' | 'encounter' | 'completion'): void {
    if (this.shownStates.has(state)) return;
    // No interrumpir la secuencia de apertura ni un paso forzado.
    if (this.box || this.waitingGate || this.queue.length > 0) return;
    this.shownStates.add(state);
    const map: Record<typeof state, Step> = {
      event: {
        text: 'An EVENT! A dilemma with two branches: a risky one (rolls the die) and a safe one. Choose wisely.',
        rectKey: 'event',
      },
      encounter: {
        text: 'An ENCOUNTER! Your army fights based on its stats. Train well to win; the last foe is the BOSS.',
        rectKey: 'encounter',
      },
      completion: {
        text: 'Run complete! Press MINT to forge your general. Win or lose against the boss, your general is born from this training.',
        rectKey: 'completion',
      },
    };
    this.queue = [map[state]];
    this.next();
  }

  /* ---- Motor de pasos ------------------------------------------ */
  private next(): void {
    this.clear();
    const step = this.queue.shift();
    if (!step) return; // sin pasos pendientes: el jugador tiene el control

    const rect = step.rectKey ? COACH_RECTS[step.rectKey] : undefined;
    const gated = !!step.gate;
    this.buildSpotlight(rect, gated);

    // Paso forzado: sin backdrop (los taps deben llegar a las tarjetas del hueco);
    // paso normal: backdrop transparente que avanza al tocar cualquier parte.
    this.box = new DialogBox(this.scene, pandaLine(step.text), {
      big: false,
      y: this.boxYFor(rect),
      depth: DEPTH_BOX,
      backdrop: !gated,
      dim: false,
      hint: gated ? '▶ tap a training card' : '▶ tap to continue',
      onAdvance: gated ? undefined : () => this.next(),
    });

    if (gated) this.waitingGate = step.gate;
  }

  /* ---- Spotlight (recorte) ------------------------------------- */
  private buildSpotlight(rect: Rect | undefined, interactive: boolean): void {
    const dark = 0x0a0806;
    const alpha = 0.62;
    const add = (x: number, y: number, w: number, h: number): void => {
      if (w <= 0 || h <= 0) return;
      const r = this.scene.add.rectangle(x, y, w, h, dark, alpha).setOrigin(0, 0).setDepth(DEPTH_SPOT);
      if (interactive) r.setInteractive(); // bloquea la interacción fuera del hueco
      this.spot.push(r);
    };

    if (!rect) {
      add(0, 0, GAME_W, GAME_H);
      return;
    }
    // Cuatro bandas alrededor del hueco (deja el rect visible/clickeable).
    add(0, 0, GAME_W, rect.y);
    add(0, rect.y + rect.h, GAME_W, GAME_H - (rect.y + rect.h));
    add(0, rect.y, rect.x, rect.h);
    add(rect.x + rect.w, rect.y, GAME_W - (rect.x + rect.w), rect.h);

    // Marco resaltado alrededor de la sección.
    const frame = this.scene.add
      .rectangle(rect.x, rect.y, rect.w, rect.h)
      .setOrigin(0, 0)
      .setStrokeStyle(4, COLORS.lime)
      .setDepth(DEPTH_SPOT + 1);
    this.spot.push(frame);
  }

  private boxYFor(rect?: Rect): number {
    if (!rect) return GAME_H - 150;
    const cy = rect.y + rect.h / 2;
    // Sección arriba → recuadro abajo; sección abajo → recuadro arriba.
    return cy < GAME_H / 2 ? GAME_H - 150 : 300;
  }

  private clear(): void {
    this.box?.destroy();
    this.box = undefined;
    for (const o of this.spot) o.destroy();
    this.spot = [];
  }

  destroy(): void {
    this.finished = true;
    this.clear();
  }
}
