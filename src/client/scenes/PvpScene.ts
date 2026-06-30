/* ============================================================
   PvpScene — lobby de arena: elegir general, buscar rival
   (POST /api/pvp/battle) y leaderboard de temporada.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W, PAD, CONTENT_W } from '../ui/theme.ts';
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
import { tierLetter } from '../util.ts';
import type { BattleResult } from '../../shared/types/index.ts';

interface LbRow {
  userId: string;
  name: string;
  score: number;
}

export class PvpScene extends Phaser.Scene {
  private lb: LbRow[] = [];
  private lbPage = 1;
  private dyn?: Phaser.GameObjects.Container;

  constructor() {
    super('Pvp');
  }

  init(data: { selectedGeneralId?: string }): void {
    if (data?.selectedGeneralId) store.selectedGeneralId = data.selectedGeneralId;
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    screenTopbar(this, 'PvP / Arena', () => this.scene.start('Home'));
    if (store.generals.length === 0) {
      const hide = loadingOverlay(this, 'CARGANDO...');
      try {
        await loadUserData();
      } catch {
        /* ignore */
      }
      hide();
    }
    await this.fetchLeaderboard(1);
    this.render();
  }

  private async fetchLeaderboard(page: number): Promise<void> {
    try {
      const res = await api.get<{ leaderboard: LbRow[] }>(`/api/pvp/leaderboard?page=${page}&limit=8`);
      this.lb = res.leaderboard;
      this.lbPage = page;
    } catch {
      this.lb = [];
    }
  }

  private render(): void {
    this.dyn?.destroy();
    const c = this.add.container(0, 0);
    this.dyn = c;

    if (store.generals.length === 0) {
      const cy = 600;
      c.add(retroPanel(this, GAME_W / 2, cy, CONTENT_W, 360, COLORS.card));
      c.add(titleText(this, GAME_W / 2, cy - 140, 'Sin generales\ntodavía', 18, COLORS.ink).setAlign('center'));
      c.add(
        bodyText(this, GAME_W / 2, cy - 10, 'Necesitas un comandante entrenado\npara entrar al PvP.', 14, COLORS.ink).setAlign('center')
      );
      c.add(
        retroButton(this, GAME_W / 2, cy + 110, 'CORRER RUN', {
          width: CONTENT_W - 80,
          height: 76,
          fontSize: 16,
          onClick: () => this.scene.start('RunSetup'),
        })
      );
      return;
    }

    this.renderGeneralCard(c);
    this.renderLeaderboard(c);
  }

  private renderGeneralCard(c: Phaser.GameObjects.Container): void {
    const gens = store.generals;
    let i = gens.findIndex((g) => g.id === store.selectedGeneralId);
    if (i < 0) i = 0;
    const g = gens[i];

    const cx = GAME_W / 2;
    const panelLeft = cx - CONTENT_W / 2;
    const txtX = panelLeft + 200;
    c.add(titleText(this, cx, 152, 'Tu General', 18, COLORS.cream));
    c.add(retroPanel(this, cx, 300, CONTENT_W, 240, COLORS.card));
    c.add(portrait(this, panelLeft + 104, 300, g.id, 132, affinityColor('OFE')));
    c.add(bodyText(this, txtX, 250, g.name, 20, COLORS.ink).setOrigin(0, 0.5));
    c.add(bodyText(this, txtX, 294, `Tier ${tierLetter(g.tier)}  ·  Poder ${g.power}`, 15, COLORS.ink).setOrigin(0, 0.5));
    c.add(
      bodyText(this, txtX, 334, `OFE ${g.stats.ofe} / DEF ${g.stats.def} / MAN ${g.stats.man}`, 14, COLORS.ink).setOrigin(0, 0.5)
    );

    // Cambiar general (ciclar)
    if (gens.length > 1) {
      c.add(
        retroButton(this, cx - 120, 470, '◀', {
          variant: 'grey',
          width: 80,
          height: 60,
          fontSize: 16,
          onClick: () => this.cycle(-1),
        })
      );
      c.add(bodyText(this, cx, 470, `${i + 1} / ${gens.length}`, 14, COLORS.cream));
      c.add(
        retroButton(this, cx + 120, 470, '▶', {
          variant: 'grey',
          width: 80,
          height: 60,
          fontSize: 16,
          onClick: () => this.cycle(1),
        })
      );
    }

    c.add(
      retroButton(this, cx, 560, 'BUSCAR RIVAL', {
        width: CONTENT_W,
        height: 80,
        fontSize: 18,
        onClick: () => this.startBattle(g.id),
      })
    );
  }

  private renderLeaderboard(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    const lbTitleContainer = this.add.container(cx, 666);
    const lbIcon = this.add.image(-120, 0, 'icon_sword').setDisplaySize(24, 24);
    const lbTxt = titleText(this, 10, 0, 'LEADERBOARD S1', 14, COLORS.cream);
    lbTitleContainer.add([lbIcon, lbTxt]);
    c.add(lbTitleContainer);
    c.add(retroPanel(this, cx, 930, CONTENT_W, 500, COLORS.card));

    if (this.lb.length === 0) {
      c.add(bodyText(this, cx, 900, 'Sin clasificación todavía.', 13, COLORS.ink));
    } else {
      this.lb.forEach((row, idx) => {
        const rank = (this.lbPage - 1) * 8 + idx + 1;
        const mine = row.userId === (store.profile?.userId ?? '');
        const ry = 730 + idx * 50;
        c.add(bodyText(this, PAD + 40, ry, `#${rank}  ${row.name.substring(0, 18)}`, 13, mine ? 0x2e6b2e : COLORS.ink).setOrigin(0, 0.5));
        c.add(bodyText(this, GAME_W - PAD - 40, ry, `${row.score}`, 13, COLORS.ink).setOrigin(1, 0.5));
      });
    }

    // Paginación
    c.add(
      retroButton(this, cx - 120, 1150, '◀', {
        variant: 'grey',
        width: 80,
        height: 56,
        fontSize: 14,
        enabled: this.lbPage > 1,
        onClick: () => this.changePage(this.lbPage - 1),
      })
    );
    c.add(bodyText(this, cx, 1150, `Pág ${this.lbPage}`, 13, COLORS.cream));
    c.add(
      retroButton(this, cx + 120, 1150, '▶', {
        variant: 'grey',
        width: 80,
        height: 56,
        fontSize: 14,
        enabled: this.lb.length >= 8,
        onClick: () => this.changePage(this.lbPage + 1),
      })
    );
  }

  private cycle(dir: number): void {
    const gens = store.generals;
    let i = gens.findIndex((g) => g.id === store.selectedGeneralId);
    if (i < 0) i = 0;
    i = (i + dir + gens.length) % gens.length;
    store.selectedGeneralId = gens[i].id;
    this.render();
  }

  private async changePage(page: number): Promise<void> {
    if (page < 1) return;
    await this.fetchLeaderboard(page);
    this.render();
  }

  private async startBattle(attackerId: string): Promise<void> {
    const hide = loadingOverlay(this, 'BUSCANDO RIVAL...');
    try {
      const res = await api.post<{ battleResult: BattleResult; rewards: any }>('/api/pvp/battle', { attackerId });
      hide();
      this.scene.start('PvpCombat', { battleResult: res.battleResult, rewards: res.rewards, returnScene: 'Pvp' });
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Error al emparejar', COLORS.danger);
    }
  }
}
