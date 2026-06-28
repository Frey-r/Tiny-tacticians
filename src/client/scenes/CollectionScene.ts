/* ============================================================
   CollectionScene — pestañas Consejeros / Generales.
   Subir nivel de consejero (POST /api/consejeros/:id/level) y
   enviar generales a la arena.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W, GAME_H, PAD, CONTENT_W } from '../ui/theme.ts';
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
import type { BattleResult, Consejero } from '../../shared/types/index.ts';

export class CollectionScene extends Phaser.Scene {
  private tab: 'consejeros' | 'generales' = 'consejeros';
  private dyn?: Phaser.GameObjects.Container;
  private modal?: Phaser.GameObjects.Container;

  constructor() {
    super('Collection');
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    screenTopbar(this, 'Colección', () => this.scene.start('Home'));
    if (store.advisors.length === 0 && store.generals.length === 0) {
      const hide = loadingOverlay(this, 'CARGANDO...');
      try {
        await loadUserData();
      } catch {
        /* ignore */
      }
      hide();
    }
    this.render();
  }

  private render(): void {
    this.dyn?.destroy();
    const c = this.add.container(0, 0);
    this.dyn = c;

    c.add(
      retroButton(this, GAME_W / 2 - 162, 128, '[ CONSEJEROS ]', {
        variant: this.tab === 'consejeros' ? 'lime' : 'grey',
        width: 308,
        height: 64,
        fontSize: 13,
        onClick: () => {
          this.tab = 'consejeros';
          this.render();
        },
      })
    );
    c.add(
      retroButton(this, GAME_W / 2 + 162, 128, '[ GENERALES ]', {
        variant: this.tab === 'generales' ? 'lime' : 'grey',
        width: 308,
        height: 64,
        fontSize: 13,
        onClick: () => {
          this.tab = 'generales';
          this.render();
        },
      })
    );

    if (this.tab === 'consejeros') this.renderAdvisors(c);
    else this.renderGenerals(c);
  }

  private renderAdvisors(c: Phaser.GameObjects.Container): void {
    const cx0 = GAME_W / 2;
    c.add(bodyText(this, cx0, 195, `Consejeros ${store.advisors.length} / 9`, 15, COLORS.cream));
    const cols = 3;
    const W = 188;
    const H = 150;
    store.advisors.slice(0, 12).forEach((adv, i) => {
      const ax = cx0 + ((i % cols) - 1) * 200;
      const ay = 290 + Math.floor(i / cols) * 168;
      const card = this.add.container(ax, ay);
      card.add(this.add.rectangle(0, 0, W, H, COLORS.card2).setStrokeStyle(3, COLORS.border));
      card.add(portrait(this, 0, -20, adv.id, 70, affinityColor(adv.affinity)));
      card.add(bodyText(this, 0, 38, adv.name.split(' ')[0], 13, COLORS.ink));
      card.add(bodyText(this, 0, 58, `${adv.affinity} · Lv${adv.level}`, 12, COLORS.ink));
      // Hit-area en coords top-left: Phaser suma displayOrigin (W/2,H/2) al
      // punto local del Container antes de Contains, así que el rect va en (0,0).
      card.setSize(W, H).setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
      if (card.input) card.input.cursor = 'pointer';
      card.on('pointerdown', () => this.openUpgrade(adv));
      c.add(card);
    });
    c.add(
      retroButton(this, cx0, 1150, '➕ RECLUTAR CONSEJERO', {
        variant: 'lime',
        width: CONTENT_W,
        height: 72,
        fontSize: 16,
        onClick: () => this.scene.start('Reclutamiento'),
      })
    );
    c.add(bodyText(this, cx0, GAME_H - 40, 'Toca un consejero para subir su nivel · Recluta nuevos con contratos.', 11, COLORS.cream));
  }

  private renderGenerals(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    c.add(bodyText(this, cx, 195, `Generales acuñados (${store.generals.length})`, 15, COLORS.cream));
    if (store.generals.length === 0) {
      c.add(bodyText(this, cx, 400, 'Sin generales.\n¡Corre una run para reclutar!', 14, COLORS.cream).setAlign('center'));
      return;
    }
    store.generals.slice(0, 6).forEach((g, i) => {
      const ry = 300 + i * 158;
      c.add(retroPanel(this, cx, ry, CONTENT_W, 142, COLORS.card));
      c.add(portrait(this, PAD + 52, ry - 26, g.id, 64, affinityColor('OFE')));
      c.add(bodyText(this, PAD + 100, ry - 44, g.name, 15, COLORS.ink).setOrigin(0, 0.5));
      c.add(
        bodyText(this, PAD + 100, ry - 16, `Tier ${tierLetter(g.tier)} · Poder ${g.power} · ${g.stats.ofe}/${g.stats.def}/${g.stats.man}`, 11, COLORS.ink).setOrigin(0, 0.5)
      );
      c.add(
        retroButton(this, cx - 118, ry + 36, '⚔ COMBATIR', {
          width: 280,
          height: 54,
          fontSize: 12,
          onClick: () => this.battle(g.id),
        })
      );
      c.add(
        retroButton(this, cx + 170, ry + 36, 'ARENA', {
          variant: 'grey',
          width: 200,
          height: 54,
          fontSize: 12,
          onClick: () => this.scene.start('Pvp', { selectedGeneralId: g.id }),
        })
      );
    });
  }

  private openUpgrade(adv: Consejero): void {
    this.modal?.destroy();
    const cost = adv.level * 150;
    const gold = store.profile?.gold ?? 0;
    const m = this.add.container(0, 0).setDepth(100);
    this.modal = m;
    m.add(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0a0806, 0.72).setOrigin(0, 0).setInteractive());
    m.add(retroPanel(this, GAME_W / 2, GAME_H / 2, 460, 420, COLORS.panelDark));
    m.add(portrait(this, GAME_W / 2, GAME_H / 2 - 120, adv.id, 90, affinityColor(adv.affinity)));
    m.add(titleText(this, GAME_W / 2, GAME_H / 2 - 40, adv.name, 16, COLORS.cream));
    m.add(bodyText(this, GAME_W / 2, GAME_H / 2, `Nivel ${adv.level} · Afinidad ${adv.affinity}`, 14, COLORS.cream));
    m.add(titleText(this, GAME_W / 2, GAME_H / 2 + 50, `Costo: ${cost} oro`, 14, COLORS.gold));
    m.add(
      retroButton(this, GAME_W / 2 - 100, GAME_H / 2 + 130, 'MEJORAR', {
        width: 180,
        fontSize: 13,
        enabled: gold >= cost,
        onClick: () => this.levelUp(adv),
      })
    );
    m.add(
      retroButton(this, GAME_W / 2 + 100, GAME_H / 2 + 130, 'CERRAR', {
        variant: 'grey',
        width: 180,
        fontSize: 13,
        onClick: () => {
          this.modal?.destroy();
          this.modal = undefined;
        },
      })
    );
  }

  private async levelUp(adv: Consejero): Promise<void> {
    this.modal?.destroy();
    this.modal = undefined;
    const hide = loadingOverlay(this);
    try {
      await api.post(`/api/consejeros/${adv.id}/level`);
      await loadUserData();
      hide();
      toast(this, `${adv.name.split(' ')[0]} subió de nivel`, COLORS.lime);
      this.render();
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Error al mejorar', COLORS.danger);
    }
  }

  private async battle(attackerId: string): Promise<void> {
    const hide = loadingOverlay(this, 'BUSCANDO RIVAL...');
    try {
      const res = await api.post<{ battleResult: BattleResult; rewards: any }>('/api/pvp/battle', { attackerId });
      hide();
      this.scene.start('PvpCombat', { battleResult: res.battleResult, rewards: res.rewards });
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Error al combatir', COLORS.danger);
    }
  }
}
