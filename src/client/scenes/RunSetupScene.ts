/* ============================================================
   RunSetupScene — elegir 3 consejeros + nombrar al general.
   POST /api/run/start con el deckSnapshot -> RunPlay.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W, CONTENT_W } from '../ui/theme.ts';
import {
  screenTopbar,
  retroButton,
  retroPanel,
  titleText,
  bodyText,
  portrait,
  affinityColor,
  loadingOverlay,
  toast,
} from '../ui/widgets.ts';
import { store, loadUserData } from '../state.ts';
import { api } from '../api.ts';
import { randomGeneralName } from '../util.ts';
import type { Consejero } from '../../shared/types/index.ts';

export class RunSetupScene extends Phaser.Scene {
  private selected: string[] = [];
  private generalName = '';
  private content?: Phaser.GameObjects.Container;

  constructor() {
    super('RunSetup');
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    this.selected = [];
    this.generalName = randomGeneralName();
    screenTopbar(this, 'Nueva Run', () => this.scene.start('Home'));
    if (store.advisors.length === 0) {
      const hide = loadingOverlay(this, 'CARGANDO...');
      try {
        await loadUserData();
      } catch {
        /* usa lo que haya */
      }
      hide();
    }
    this.rebuild();
  }

  private rebuild(): void {
    this.content?.destroy();
    const c = this.add.container(0, 0);
    this.content = c;

    c.add(titleText(this, GAME_W / 2, 116, `1. Elige 3 consejeros  ${this.selected.length}/3`, 18, COLORS.cream));

    // Rejilla 3 columnas (12 consejeros -> 4 filas) para caber en vertical.
    const advisors = store.advisors.slice(0, 12);
    const cols = 3;
    advisors.forEach((adv, i) => {
      const cx = GAME_W / 2 + ((i % cols) - 1) * 290;
      const cy = 240 + Math.floor(i / cols) * 186;
      c.add(this.advisorCard(adv, cx, cy));
    });

    // Nombre del general
    c.add(titleText(this, GAME_W / 2, 928, '2. Nombra a tu general', 18, COLORS.cream));
    c.add(retroPanel(this, GAME_W / 2, 986, 560, 70, COLORS.card));
    c.add(bodyText(this, GAME_W / 2, 986, this.generalName, 24, COLORS.ink));
    c.add(
      retroButton(this, GAME_W / 2, 1072, '🎲 OTRO NOMBRE', {
        variant: 'grey',
        fontSize: 16,
        width: 360,
        height: 64,
        onClick: () => {
          this.generalName = randomGeneralName();
          this.rebuild();
        },
      })
    );

    // Comenzar
    const ready = this.selected.length === 3;
    c.add(
      retroButton(this, GAME_W / 2, 1208, '>> COMENZAR RUN', {
        width: CONTENT_W,
        height: 88,
        fontSize: 22,
        enabled: ready,
        onClick: () => this.startRun(),
      })
    );
  }

  private advisorCard(adv: Consejero, x: number, y: number): Phaser.GameObjects.Container {
    const W = 270;
    const H = 170;
    const card = this.add.container(x, y);
    const isSel = this.selected.includes(adv.id);
    const box = this.add
      .rectangle(0, 0, W, H, isSel ? 0xdfe9b6 : COLORS.card2)
      .setStrokeStyle(isSel ? 4 : 3, isSel ? COLORS.limeEdge : COLORS.border);
    card.add(box);
    card.add(portrait(this, 0, -26, adv.id, 96, affinityColor(adv.affinity)));
    card.add(bodyText(this, 0, 44, `${adv.name.split(' ')[0]}`, 17, COLORS.ink));
    card.add(bodyText(this, 0, 68, `${adv.affinity} · Lv${adv.level}`, 15, COLORS.ink));
    // Hit-area en coords top-left: Phaser suma displayOrigin (W/2,H/2) al
    // punto local del Container antes de Contains, así que el rect va en (0,0).
    card.setSize(W, H).setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
    if (card.input) card.input.cursor = 'pointer';
    card.on('pointerdown', () => this.toggle(adv.id));
    return card;
  }

  private toggle(id: string): void {
    if (this.selected.includes(id)) {
      this.selected = this.selected.filter((s) => s !== id);
    } else if (this.selected.length < 3) {
      this.selected.push(id);
    }
    this.rebuild();
  }

  private async startRun(): Promise<void> {
    const deckSnapshot = store.advisors.filter((a) => this.selected.includes(a.id));
    const hide = loadingOverlay(this);
    try {
      const result = await api.post<{ runId: string; seed: string; deckSnapshot?: Consejero[] }>(
        '/api/run/start',
        { deckSnapshot }
      );
      hide();
      this.scene.start('RunPlay', {
        runId: result.runId,
        seed: result.seed,
        name: this.generalName,
        // Usar el deck AUTORITATIVO devuelto por el servidor (nivel/afinidad reales),
        // no la copia local, para que la simulación local coincida con la del servidor.
        advisors: result.deckSnapshot ?? deckSnapshot,
      });
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Error al iniciar run', COLORS.danger);
    }
  }
}
