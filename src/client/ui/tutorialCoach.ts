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
  return { name: 'Maestro Panda', text, textureKey: 'panda_idle', frame: 0, side: 'left', tint: COLORS.lime };
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
      { text: '¡Bienvenido, comandante! Soy tu maestro. Te enseñaré a forjar un ejército imparable.' },
      {
        text: 'Aquí ves el TURNO, tu ENERGÍA y el ÁNIMO de la tropa. Con poca energía fallarás más; el ánimo mejora o empeora tus tiradas.',
        rectKey: 'header',
      },
      {
        text: 'Estos son tus CONSEJEROS. Cada turno algunos ASISTEN al azar: suben su afinidad y, al llenarla, desbloquean una habilidad de combate.',
        rectKey: 'deck',
      },
      {
        text: 'Este es tu CAMPAMENTO: aquí se forma el recluta que se convertirá en tu general.',
        rectKey: 'liveFeed',
      },
      {
        text: '¡Ahora entrena! Cada tarjeta (OFE, DEF, MAN) muestra la ganancia y las probabilidades. Toca una para entrenar.',
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
        text: '¡Eso fue una TIRADA de dado! FALLO no da nada, NORMAL suma y CRÍTICO (dorado) suma extra. Consejeros y ánimo reforman el dado a tu favor.',
        rectKey: 'dice',
      },
      {
        text: 'Sigue entrenando (y descansa si baja la energía). Supera los encuentros y, al final, ¡acuña a tu general! Ahora tú tienes el mando, comandante.',
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
        text: '¡Un EVENTO! Un dilema con dos ramas: una arriesgada (tira el dado) y otra segura. Elige con cabeza.',
        rectKey: 'event',
      },
      encounter: {
        text: '¡Un ENCUENTRO! Tu ejército pelea según sus stats. Entrena bien para vencer; el último rival es el JEFE.',
        rectKey: 'encounter',
      },
      completion: {
        text: '¡Run completada! Pulsa ACUÑAR para forjar a tu general. Ganes o pierdas al jefe, tu general nace de este entrenamiento.',
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
      hint: gated ? '▶ toca una tarjeta de entrenamiento' : '▶ toca para continuar',
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
