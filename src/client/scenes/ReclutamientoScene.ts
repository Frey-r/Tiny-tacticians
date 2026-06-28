/* ============================================================
   ReclutamientoScene — desbloquear consejeros (meta-progresión).
   Dos vías (daily-events/meta specs):
     1) Petición diaria  -> POST /api/recruitment/loan  (préstamo 24h)
     2) Contrato + oro    -> POST /api/recruitment/unlock (permanente)
   El servidor es autoritativo; el cliente solo pinta y envía intención.
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
import { loadUserData } from '../state.ts';
import { api } from '../api.ts';
import type { Affinity, ContractColor, RecruitmentState } from '../../shared/types/index.ts';

const CONTRACT_ICON: Record<ContractColor, string> = { white: '⬜', red: '🟥', blue: '🟦', purple: '🟪' };
const CONTRACT_NAME: Record<ContractColor, string> = { white: 'comodín', red: 'rojo', blue: 'azul', purple: 'morado' };
const AFF_COLOR: Record<Affinity, ContractColor> = { OFE: 'red', DEF: 'blue', MAN: 'purple' };

export class ReclutamientoScene extends Phaser.Scene {
  private state?: RecruitmentState;
  private dyn?: Phaser.GameObjects.Container;

  constructor() {
    super('Reclutamiento');
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    screenTopbar(this, 'Reclutamiento', () => this.scene.start('Collection'));
    const hide = loadingOverlay(this, 'CARGANDO...');
    await this.reload();
    hide();
  }

  private async reload(): Promise<void> {
    try {
      this.state = await api.get<RecruitmentState>('/api/recruitment');
    } catch {
      this.state = undefined;
    }
    this.render();
  }

  private render(): void {
    this.dyn?.destroy();
    const c = this.add.container(0, 0);
    this.dyn = c;
    const cx = GAME_W / 2;

    if (!this.state) {
      c.add(bodyText(this, cx, 360, 'No se pudo cargar el reclutamiento.', 14, COLORS.cream));
      c.add(retroButton(this, cx, 440, '[ REINTENTAR ]', { width: 360, height: 64, fontSize: 14, onClick: () => this.reload() }));
      return;
    }
    const s = this.state;

    // --- Oro + contratos ---
    c.add(bodyText(this, PAD, 128, `Oro: ${s.gold}`, 14, COLORS.gold).setOrigin(0, 0.5));
    const contractsTxt = (['white', 'red', 'blue', 'purple'] as ContractColor[])
      .map((col) => `${CONTRACT_ICON[col]}${s.contracts[col]}`)
      .join('   ');
    c.add(bodyText(this, GAME_W - PAD, 128, contractsTxt, 16, COLORS.cream).setOrigin(1, 0.5));

    // --- Petición diaria (préstamo temporal) ---
    c.add(retroPanel(this, cx, 232, CONTENT_W, 132, COLORS.card));
    c.add(titleText(this, cx, 186, '🎁 Petición diaria', 14, COLORS.ink));
    if (s.loan) {
      const hoursLeft = Math.max(1, Math.ceil((s.loan.expiresAt - Date.now()) / 3600_000));
      c.add(bodyText(this, cx, 222, `Préstamo: ${s.loan.name} (${s.loan.affinity})`, 13, COLORS.ink));
      c.add(bodyText(this, cx, 250, `Temporal · expira en ~${hoursLeft}h · úsalo en tus runs`, 11, COLORS.ink));
      c.add(retroButton(this, cx, 292, 'PRÉSTAMO ACTIVO', { variant: 'grey', width: CONTENT_W - 60, height: 48, fontSize: 13, enabled: false }));
    } else if (s.loanAvailable) {
      c.add(bodyText(this, cx, 224, 'Pide un consejero al azar prestado por 24h (pruébalo).', 12, COLORS.ink).setWordWrapWidth(CONTENT_W - 60).setAlign('center'));
      c.add(retroButton(this, cx, 290, 'PEDIR CONSEJERO (24h)', { variant: 'lime', width: CONTENT_W - 60, height: 52, fontSize: 14, onClick: () => this.requestLoan() }));
    } else {
      c.add(bodyText(this, cx, 240, 'Ya tienes todos los consejeros disponibles.', 12, COLORS.ink));
    }

    // --- Catálogo: desbloqueo permanente con contrato ---
    c.add(bodyText(this, cx, 332, `Recluta permanente (contrato del color + ${s.unlockCost} oro · blanco = comodín)`, 11, COLORS.cream));
    const rowH = 104;
    s.candidates.forEach((cand, i) => {
      const ry = 396 + i * rowH;
      const tint = affinityColor(cand.affinity);
      c.add(retroPanel(this, cx, ry, CONTENT_W, rowH - 12, COLORS.card2));
      c.add(portrait(this, PAD + 52, ry, cand.id, 64, tint));
      c.add(bodyText(this, PAD + 100, ry - 18, cand.name, 14, COLORS.ink).setOrigin(0, 0.5));
      c.add(bodyText(this, PAD + 100, ry + 10, `Afinidad ${cand.affinity}`, 11, COLORS.ink).setOrigin(0, 0.5));

      if (cand.owned) {
        c.add(bodyText(this, GAME_W - PAD - 96, ry, '✔ RECLUTADO', 12, COLORS.lime));
        return;
      }

      // Color que se gastaría: preferir el de afinidad; si no, comodín blanco.
      const match = AFF_COLOR[cand.affinity];
      const useColor: ContractColor | null = s.contracts[match] > 0 ? match : s.contracts.white > 0 ? 'white' : null;
      const canPay = useColor !== null && s.gold >= s.unlockCost;
      const label = useColor
        ? `RECLUTAR ${CONTRACT_ICON[useColor]}`
        : `Falta contrato ${CONTRACT_NAME[match]}`;
      if (cand.onLoan) {
        c.add(bodyText(this, GAME_W - PAD - 200, ry - 30, '⏳ prestado', 10, COLORS.gold).setOrigin(0.5));
      }
      c.add(
        retroButton(this, GAME_W - PAD - 130, ry, label, {
          variant: canPay ? 'lime' : 'grey',
          width: 236,
          height: 60,
          fontSize: 12,
          enabled: canPay,
          onClick: () => this.unlock(cand.id, useColor as ContractColor),
        })
      );
    });

    c.add(bodyText(this, cx, GAME_H - 30, 'Los contratos se ganan reclamando el reto diario en Eventos.', 11, COLORS.cream));
  }

  private async requestLoan(): Promise<void> {
    const hide = loadingOverlay(this, 'PIDIENDO...');
    try {
      const res = await api.post<{ advisor: { name: string } }>('/api/recruitment/loan', {});
      await loadUserData();
      hide();
      toast(this, `Préstamo 24h: ${res.advisor.name}`, COLORS.lime);
      await this.reload();
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Error en la petición', COLORS.danger);
    }
  }

  private async unlock(advisorId: string, color: ContractColor): Promise<void> {
    const hide = loadingOverlay(this, 'RECLUTANDO...');
    try {
      const res = await api.post<{ advisor: { name: string } }>('/api/recruitment/unlock', { advisorId, color });
      await loadUserData();
      hide();
      toast(this, `¡Reclutado: ${res.advisor.name}!`, COLORS.lime);
      await this.reload();
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Error al reclutar', COLORS.danger);
    }
  }
}
