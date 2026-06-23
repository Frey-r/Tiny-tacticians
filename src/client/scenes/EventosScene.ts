/* ============================================================
   EventosScene — reto diario (autoritativo en servidor) + especiales.
   Flujo en dos pasos (daily-events.spec):
     1) JUGAR combate diario  -> POST /api/daily/battle (marca completado si gana)
     2) RECLAMAR recompensa   -> POST /api/daily/claim  (oro + tirada de consejero,
        una sola vez por día). El cliente ya NO fabrica recompensas.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W } from '../ui/theme.ts';
import { screenTopbar, retroButton, retroPanel, titleText, bodyText, loadingOverlay, toast } from '../ui/widgets.ts';
import { store, loadUserData } from '../state.ts';
import { api } from '../api.ts';
import type { BattleResult, DailyChallenge, DailyStatus, DailyClaimResult } from '../../shared/types/index.ts';

export class EventosScene extends Phaser.Scene {
  private challenge?: DailyChallenge;
  private status: DailyStatus = { completed: false, claimed: false };
  private dailyPanel?: Phaser.GameObjects.Container;

  constructor() {
    super('Eventos');
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    screenTopbar(this, 'Eventos', () => this.scene.start('Home'));
    if (store.generals.length === 0) {
      try {
        await loadUserData();
      } catch {
        /* ignore */
      }
    }

    this.buildEspeciales();
    await this.loadDaily();
    this.renderDaily();
  }

  private async loadDaily(): Promise<void> {
    try {
      const res = await api.get<{ challenge: DailyChallenge; status: DailyStatus }>('/api/daily/challenge');
      this.challenge = res.challenge;
      this.status = res.status;
    } catch {
      this.challenge = undefined;
    }
  }

  private renderDaily(): void {
    this.dailyPanel?.destroy();
    const c = this.add.container(0, 0);
    this.dailyPanel = c;

    c.add(retroPanel(this, GAME_W / 2, 290, 900, 290, COLORS.card));
    c.add(titleText(this, GAME_W / 2, 165, '🛡️ Combate Diario', 16, COLORS.ink));

    if (!this.challenge) {
      c.add(bodyText(this, GAME_W / 2, 270, 'No se pudo cargar el reto diario.', 14, COLORS.ink));
      c.add(
        retroButton(this, GAME_W / 2, 360, '[ REINTENTAR ]', {
          width: 320,
          height: 56,
          fontSize: 14,
          onClick: () => this.reloadDaily(),
        })
      );
      return;
    }

    const enemy = this.challenge.enemy;
    c.add(bodyText(this, GAME_W / 2, 208, `Enemigo: ${enemy.name}`, 15, COLORS.ink));
    c.add(
      bodyText(this, GAME_W / 2, 238, `Poder ${enemy.power} · OFE ${enemy.stats.ofe} / DEF ${enemy.stats.def} / MAN ${enemy.stats.man}`, 12, COLORS.ink)
    );
    c.add(bodyText(this, GAME_W / 2, 270, `Modificador: ${this.challenge.modifier.name}`, 13, COLORS.ink));
    c.add(bodyText(this, GAME_W / 2, 298, this.challenge.modifier.description, 11, COLORS.ink));
    c.add(bodyText(this, GAME_W / 2, 328, 'Premio: +100 oro · +5 pts · chance de consejero', 12, COLORS.gold));

    if (this.status.claimed) {
      c.add(bodyText(this, GAME_W / 2, 400, '✅ Recompensa de hoy reclamada. ¡Vuelve mañana!', 14, COLORS.lime));
    } else if (this.status.completed) {
      c.add(
        retroButton(this, GAME_W / 2, 395, '[ RECLAMAR RECOMPENSA ]', {
          width: 480,
          height: 60,
          fontSize: 15,
          variant: 'lime',
          onClick: () => this.claimDaily(),
        })
      );
      c.add(bodyText(this, GAME_W / 2, 438, 'Reto completado. ¡Reclama tu botín!', 11, COLORS.cream));
    } else {
      c.add(
        retroButton(this, GAME_W / 2, 395, '[ JUGAR COMBATE DIARIO ]', {
          width: 480,
          height: 60,
          fontSize: 15,
          onClick: () => this.playDaily(),
        })
      );
    }
  }

  private async reloadDaily(): Promise<void> {
    await this.loadDaily();
    this.renderDaily();
  }

  private buildEspeciales(): void {
    titleText(this, GAME_W / 2, 510, 'Especiales (tiempo limitado)', 14, COLORS.cream);
    this.special(GAME_W / 2, 590, '[RUN] Torneo de Reclutas', 'Sube un general con reglas fijas. (2d4h)', 'ENTRAR', () =>
      this.scene.start('RunSetup')
    );
    this.special(GAME_W / 2, 680, '[COMBATE] Asedio Frontera', 'Arena rankeada vs jugadores. (18h)', 'ENTRAR', () =>
      this.scene.start('Pvp')
    );
  }

  private special(x: number, y: number, title: string, desc: string, btn: string, onClick: () => void): void {
    retroPanel(this, x, y, 900, 80, COLORS.card2);
    bodyText(this, x - 420, y - 14, title, 14, COLORS.ink).setOrigin(0, 0.5);
    bodyText(this, x - 420, y + 14, desc, 12, COLORS.ink).setOrigin(0, 0.5);
    retroButton(this, x + 360, y, btn, { width: 200, height: 52, fontSize: 13, onClick });
  }

  private async playDaily(): Promise<void> {
    if (store.generals.length === 0) {
      this.scene.start('RunSetup');
      return;
    }
    const attackerId = store.selectedGeneralId || store.generals[0].id;
    const hide = loadingOverlay(this, 'COMBATE DIARIO...');
    try {
      const res = await api.post<{ battleResult: BattleResult; completed: boolean }>('/api/daily/battle', {
        attackerId,
      });
      hide();
      const won = res.battleResult.winnerId === attackerId;
      this.scene.start('PvpCombat', {
        battleResult: res.battleResult,
        rewards: { goldEarned: 0, scoreEarned: 0 },
        returnScene: 'Eventos',
        note: won
          ? '¡Reto completado! Vuelve a Eventos para reclamar tu recompensa.'
          : 'No venciste hoy. ¡Mejora a tu general e inténtalo de nuevo!',
      });
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Error en combate diario', COLORS.danger);
    }
  }

  private async claimDaily(): Promise<void> {
    const hide = loadingOverlay(this, 'RECLAMANDO...');
    try {
      const res = await api.post<DailyClaimResult>('/api/daily/claim', {});
      await loadUserData();
      this.status = { completed: true, claimed: true };
      hide();
      const extra = res.consejeroGranted ? ` ¡Nuevo consejero: ${res.consejeroGranted.name}!` : '';
      toast(this, `+${res.goldEarned} oro · +${res.scoreEarned} pts.${extra}`, COLORS.lime);
      this.renderDaily();
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Error al reclamar', COLORS.danger);
    }
  }
}
