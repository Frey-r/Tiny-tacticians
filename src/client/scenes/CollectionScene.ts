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
      retroButton(this, GAME_W / 2 - 220, 152, '[ CONSEJEROS ]', {
        variant: this.tab === 'consejeros' ? 'lime' : 'grey',
        width: 416,
        height: 70,
        fontSize: 17,
        onClick: () => {
          this.tab = 'consejeros';
          this.render();
        },
      })
    );
    c.add(
      retroButton(this, GAME_W / 2 + 220, 152, '[ GENERALES ]', {
        variant: this.tab === 'generales' ? 'lime' : 'grey',
        width: 416,
        height: 70,
        fontSize: 17,
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
    c.add(bodyText(this, cx0, 208, `Consejeros ${store.advisors.length} / 9`, 18, COLORS.cream));
    const cols = 3;
    const W = 270;
    const H = 184;
    store.advisors.slice(0, 12).forEach((adv, i) => {
      const ax = cx0 + ((i % cols) - 1) * 290;
      const ay = 320 + Math.floor(i / cols) * 200;
      const card = this.add.container(ax, ay);
      card.add(this.add.rectangle(0, 0, W, H, COLORS.card2).setStrokeStyle(3, COLORS.border));
      card.add(portrait(this, 0, -28, adv.id, 96, affinityColor(adv.affinity)));
      card.add(bodyText(this, 0, 48, adv.name.split(' ')[0], 17, COLORS.ink));
      card.add(bodyText(this, 0, 72, `${adv.affinity} · Lv${adv.level}`, 15, COLORS.ink));
      // Hit-area en coords top-left: Phaser suma displayOrigin (W/2,H/2) al
      // punto local del Container antes de Contains, así que el rect va en (0,0).
      card.setSize(W, H).setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
      if (card.input) card.input.cursor = 'pointer';
      card.on('pointerdown', () => this.openUpgrade(adv));
      c.add(card);
    });
    c.add(
      retroButton(this, cx0, 1148, '➕ RECLUTAR CONSEJERO', {
        variant: 'lime',
        width: CONTENT_W,
        height: 80,
        fontSize: 18,
        onClick: () => this.scene.start('Reclutamiento'),
      })
    );
    c.add(bodyText(this, cx0, GAME_H - 44, 'Toca un consejero para subir su nivel · Recluta nuevos con contratos.', 14, COLORS.cream));
  }

  private renderGenerals(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    c.add(bodyText(this, cx, 224, `Generales acuñados (${store.generals.length})`, 18, COLORS.cream));
    if (store.generals.length === 0) {
      c.add(bodyText(this, cx, 420, 'Sin generales.\n¡Corre una run para reclutar!', 17, COLORS.cream).setAlign('center'));
      return;
    }
    const panelW = CONTENT_W;
    const rightX = cx + panelW / 2 - 30;
    store.generals.slice(0, 6).forEach((g, i) => {
      const ry = 318 + i * 156;
      c.add(retroPanel(this, cx, ry, panelW, 144, COLORS.card));
      c.add(portrait(this, PAD + 60, ry - 26, g.id, 72, affinityColor('OFE')));
      c.add(bodyText(this, PAD + 116, ry - 44, g.name, 18, COLORS.ink).setOrigin(0, 0.5));
      c.add(
        bodyText(this, PAD + 116, ry - 14, `Tier ${tierLetter(g.tier)} · ${g.stats.ofe}/${g.stats.def}/${g.stats.man}`, 14, COLORS.ink).setOrigin(0, 0.5)
      );
      // Número de poder grande a la derecha (estilo maqueta).
      c.add(titleText(this, rightX, ry - 38, String(g.power), 24, COLORS.gold).setOrigin(1, 0.5));
      c.add(bodyText(this, rightX, ry - 10, 'PODER', 12, COLORS.ink).setOrigin(1, 0.5));
      c.add(
        retroButton(this, cx - 138, ry + 40, '⚔ COMBATIR', {
          width: 330,
          height: 58,
          fontSize: 15,
          onClick: () => this.battle(g.id),
        })
      );
      c.add(
        retroButton(this, cx + 200, ry + 40, 'A LA ARENA', {
          variant: 'grey',
          width: 250,
          height: 58,
          fontSize: 14,
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
    const mx = GAME_W / 2;
    const my = GAME_H / 2;
    m.add(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0a0806, 0.72).setOrigin(0, 0).setInteractive());
    m.add(retroPanel(this, mx, my, 580, 470, COLORS.panelDark));
    m.add(portrait(this, mx, my - 130, adv.id, 110, affinityColor(adv.affinity)));
    m.add(titleText(this, mx, my - 42, adv.name, 19, COLORS.cream));
    m.add(bodyText(this, mx, my + 4, `Nivel ${adv.level} · Afinidad ${adv.affinity}`, 16, COLORS.cream));
    m.add(titleText(this, mx, my + 58, `Costo: ${cost} oro`, 16, COLORS.gold));
    m.add(
      retroButton(this, mx - 135, my + 145, 'MEJORAR', {
        width: 230,
        fontSize: 15,
        enabled: gold >= cost,
        onClick: () => this.levelUp(adv),
      })
    );
    m.add(
      retroButton(this, mx + 135, my + 145, 'CERRAR', {
        variant: 'grey',
        width: 230,
        fontSize: 15,
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
