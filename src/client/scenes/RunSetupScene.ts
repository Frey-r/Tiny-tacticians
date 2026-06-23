/* ============================================================
   RunSetupScene — elegir 3 consejeros + nombrar al general.
   POST /api/run/start con el deckSnapshot -> RunPlay.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W, GAME_H } from '../ui/theme.ts';
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

    c.add(titleText(this, GAME_W / 2, 110, `1. Elige 3 consejeros  ${this.selected.length}/3`, 16, COLORS.cream));

    const advisors = store.advisors.slice(0, 12);
    const cols = 4;
    const x0 = GAME_W / 2 - ((cols - 1) * 200) / 2;
    advisors.forEach((adv, i) => {
      const cx = x0 + (i % cols) * 200;
      const cy = 210 + Math.floor(i / cols) * 170;
      c.add(this.advisorCard(adv, cx, cy));
    });

    // Nombre del general
    c.add(titleText(this, GAME_W / 2, GAME_H - 200, '2. Nombra a tu general', 16, COLORS.cream));
    c.add(retroPanel(this, GAME_W / 2 - 80, GAME_H - 150, 320, 56, COLORS.card));
    c.add(bodyText(this, GAME_W / 2 - 80, GAME_H - 150, this.generalName, 22, COLORS.ink));
    c.add(
      retroButton(this, GAME_W / 2 + 160, GAME_H - 150, '🎲 OTRO', {
        variant: 'grey',
        fontSize: 13,
        width: 150,
        onClick: () => {
          this.generalName = randomGeneralName();
          this.rebuild();
        },
      })
    );

    // Comenzar
    const ready = this.selected.length === 3;
    c.add(
      retroButton(this, GAME_W / 2, GAME_H - 70, '>> COMENZAR RUN', {
        width: 420,
        height: 70,
        fontSize: 18,
        enabled: ready,
        onClick: () => this.startRun(),
      })
    );
  }

  private advisorCard(adv: Consejero, x: number, y: number): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);
    const isSel = this.selected.includes(adv.id);
    const box = this.add
      .rectangle(0, 0, 160, 150, isSel ? 0xdfe9b6 : COLORS.card2)
      .setStrokeStyle(3, isSel ? COLORS.limeEdge : COLORS.border);
    card.add(box);
    card.add(portrait(this, 0, -22, adv.id, 70, affinityColor(adv.affinity)));
    card.add(bodyText(this, 0, 36, `${adv.name.split(' ')[0]}`, 14, COLORS.ink));
    card.add(bodyText(this, 0, 56, `${adv.affinity} · Lv${adv.level}`, 12, COLORS.ink));
    card.setSize(160, 150).setInteractive(new Phaser.Geom.Rectangle(-80, -75, 160, 150), Phaser.Geom.Rectangle.Contains);
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
