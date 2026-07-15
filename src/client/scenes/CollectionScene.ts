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
import { consejeroDef, CONSEJERO_CATALOG } from '../../shared/sim/index.ts';
import { openConsejeroModal, TRAIN_STYLE_INFO } from '../ui/consejeroDetail.ts';

const MAX_LEVEL = 10;

export class CollectionScene extends Phaser.Scene {
  private tab: 'consejeros' | 'generales' = 'consejeros';
  private dyn?: Phaser.GameObjects.Container;
  private modal?: Phaser.GameObjects.Container;

  constructor() {
    super('Collection');
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    screenTopbar(this, 'Collection', () => this.scene.start('Home'));
    if (store.advisors.length === 0 && store.generals.length === 0) {
      const hide = loadingOverlay(this, 'LOADING...');
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
      retroButton(this, GAME_W / 2 - 220, 152, '[ ADVISORS ]', {
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
      retroButton(this, GAME_W / 2 + 220, 152, '[ GENERALS ]', {
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
    c.add(bodyText(this, cx0, 208, `Advisors ${store.advisors.length} / ${CONSEJERO_CATALOG.length}`, 18, COLORS.cream));
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
      retroButton(this, cx0, 1148, 'RECRUIT ADVISOR', {
        variant: 'lime',
        width: CONTENT_W,
        height: 80,
        fontSize: 18,
        onClick: () => this.scene.start('Reclutamiento'),
      })
    );
    c.add(bodyText(this, cx0, GAME_H - 44, 'Tap an advisor to see details and level up · Recruit new ones with contracts.', 14, COLORS.cream));
  }

  private renderGenerals(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    c.add(bodyText(this, cx, 224, `Minted generals (${store.generals.length})`, 18, COLORS.cream));
    if (store.generals.length === 0) {
      c.add(bodyText(this, cx, 420, 'No generals.\nRun a campaign to recruit!', 17, COLORS.cream).setAlign('center'));
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
      c.add(bodyText(this, rightX, ry - 10, 'POWER', 12, COLORS.ink).setOrigin(1, 0.5));
      c.add(
        retroButton(this, cx - 138, ry + 40, 'FIGHT', {
          width: 330,
          height: 58,
          fontSize: 15,
          onClick: () => this.battle(g.id),
        })
      );
      c.add(
        retroButton(this, cx + 200, ry + 40, 'TO ARENA', {
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

    const def = consejeroDef(adv.id);
    const style = TRAIN_STYLE_INFO[def.trainStyle];
    const cost = adv.level * 150;
    const gold = store.profile?.gold ?? 0;
    const maxed = adv.level >= MAX_LEVEL;

    this.modal = openConsejeroModal(
      this,
      {
        id: adv.id,
        name: adv.name,
        affinity: adv.affinity,
        subtitle: `Level ${adv.level}/${MAX_LEVEL} · Affinity ${adv.affinity}`,
      },
      {
        hint: maxed ? 'Max level reached.' : style.next,
        costText: maxed ? 'MAX LEVEL' : `Cost: ${cost} gold`,
        costColor: maxed || gold >= cost ? COLORS.gold : COLORS.danger,
        primaryLabel: 'UPGRADE',
        primaryEnabled: !maxed && gold >= cost,
        onPrimary: () => this.levelUp(adv),
        onClose: () => {
          this.modal = undefined;
        },
      }
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
      toast(this, `${adv.name.split(' ')[0]} leveled up`, COLORS.lime);
      this.render();
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Upgrade failed', COLORS.danger);
    }
  }

  private async battle(attackerId: string): Promise<void> {
    const hide = loadingOverlay(this, 'FINDING OPPONENT...');
    try {
      const res = await api.post<{ battleResult: BattleResult; rewards: any }>('/api/pvp/battle', { attackerId });
      hide();
      this.scene.start('PvpCombat', { battleResult: res.battleResult, rewards: res.rewards });
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Battle failed', COLORS.danger);
    }
  }
}
