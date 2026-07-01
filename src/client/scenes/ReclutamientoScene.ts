/* ============================================================
   ReclutamientoScene — desbloquear consejeros (meta-progresión).
   Dos vías (daily-events/meta specs):
     1) Petición diaria  -> POST /api/recruitment/loan  (préstamo 24h)
     2) Contrato + oro    -> POST /api/recruitment/unlock (permanente)
   El servidor es autoritativo; el cliente solo pinta y envía intención.

   El catálogo adquirible (37 consejeros) se pinta como una REJILLA de
   tarjetas ligeras dentro de un viewport enmascarado y scrollable
   (arrastre + rueda). Tocar una tarjeta abre la MISMA ventana de detalle
   que Colección (openConsejeroModal), aquí con la acción RECLUTAR.
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
import { openConsejeroModal } from '../ui/consejeroDetail.ts';
import { loadUserData } from '../state.ts';
import { api } from '../api.ts';
import type { Affinity, ContractColor, RecruitCandidate, RecruitmentState } from '../../shared/types/index.ts';

const CONTRACT_NAME: Record<ContractColor, string> = { white: 'comodín', red: 'rojo', blue: 'azul', purple: 'morado' };
const AFF_COLOR: Record<Affinity, ContractColor> = { OFE: 'red', DEF: 'blue', MAN: 'purple' };

// Geometría de la rejilla / viewport scrollable.
const COLS = 3;
const COL_GAP = 290;
const CARD_W = 264;
const CARD_H = 188;
const ROW_GAP = 208;
const VIEW_TOP = 352;
const VIEW_BOTTOM = GAME_H - 52;

interface ScrollHandlers {
  down: (p: Phaser.Input.Pointer) => void;
  move: (p: Phaser.Input.Pointer) => void;
  up: () => void;
  wheel: (p: Phaser.Input.Pointer, o: unknown, dx: number, dy: number) => void;
}

export class ReclutamientoScene extends Phaser.Scene {
  private state?: RecruitmentState;
  private dyn?: Phaser.GameObjects.Container;
  private modal?: Phaser.GameObjects.Container;
  private scrollHandlers?: ScrollHandlers;
  /** Se pone a true si el puntero arrastró: suprime el click de la tarjeta. */
  private scrollMoved = false;

  constructor() {
    super('Reclutamiento');
  }

  async create(): Promise<void> {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardownScroll());
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

  /** Quita los listeners del scroll (idempotente). */
  private teardownScroll(): void {
    if (this.scrollHandlers) {
      this.input.off('pointerdown', this.scrollHandlers.down);
      this.input.off('pointermove', this.scrollHandlers.move);
      this.input.off('pointerup', this.scrollHandlers.up);
      this.input.off('wheel', this.scrollHandlers.wheel);
      this.scrollHandlers = undefined;
    }
  }

  /** Barra de título al frente (redibujada cada render para quedar sobre las cortinas). */
  private addTopbar(c: Phaser.GameObjects.Container): void {
    c.add(screenTopbar(this, 'Reclutamiento', () => this.scene.start('Collection')));
  }

  private render(): void {
    this.teardownScroll();
    this.modal?.destroy();
    this.modal = undefined;
    this.dyn?.destroy();
    const c = this.add.container(0, 0);
    this.dyn = c;
    const cx = GAME_W / 2;

    if (!this.state) {
      c.add(bodyText(this, cx, 360, 'No se pudo cargar el reclutamiento.', 14, COLORS.cream));
      c.add(retroButton(this, cx, 440, '[ REINTENTAR ]', { width: 360, height: 64, fontSize: 14, onClick: () => this.reload() }));
      this.addTopbar(c);
      return;
    }
    const s = this.state;

    // La rejilla scrollable se dibuja PRIMERO (queda al fondo del display list).
    this.buildCandidateGrid(c, s);

    // Cortinas opacas encima de la rejilla: definen el viewport recortando el
    // contenido que se desplaza fuera de él (arriba/abajo). Son interactivas para
    // tragar los clicks de tarjetas ocultas y que no roben la UI fija de encima.
    c.add(this.add.rectangle(0, 0, GAME_W, VIEW_TOP, COLORS.screen).setOrigin(0, 0).setInteractive());
    c.add(this.add.rectangle(0, VIEW_BOTTOM, GAME_W, GAME_H - VIEW_BOTTOM, COLORS.screen).setOrigin(0, 0).setInteractive());

    // --- Oro + contratos ---
    c.add(bodyText(this, PAD, 128, `Oro: ${s.gold}`, 14, COLORS.gold).setOrigin(0, 0.5));
    let startX = GAME_W - PAD;
    const colorsList = ['purple', 'blue', 'red', 'white'] as ContractColor[];
    const colorHex: Record<ContractColor, number> = {
      white: 0xefe7d6,
      red: COLORS.affOFE,
      blue: COLORS.affDEF,
      purple: COLORS.affMAN,
    };
    colorsList.forEach((col) => {
      const val = s.contracts[col];
      const t = bodyText(this, startX, 128, String(val), 16, COLORS.cream).setOrigin(1, 0.5);
      startX -= t.width + 8;
      const sq = this.add.rectangle(startX - 10, 128, 20, 20, colorHex[col]).setStrokeStyle(2, COLORS.border);
      c.add(sq);
      c.add(t);
      startX -= 32;
    });

    // --- Petición diaria (préstamo temporal) ---
    c.add(retroPanel(this, cx, 232, CONTENT_W, 132, COLORS.card));
    c.add(titleText(this, cx, 186, 'Petición diaria', 14, COLORS.ink));
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

    // --- Cabecera del catálogo + pie de ayuda (fijos, encima de la rejilla) ---
    c.add(
      bodyText(this, cx, 322, `Recluta permanente · contrato del color + ${s.unlockCost} oro (blanco = comodín)`, 12, COLORS.cream).setWordWrapWidth(CONTENT_W)
    );
    c.add(bodyText(this, cx, GAME_H - 26, 'Toca un consejero para ver su detalle y reclutarlo · Contratos en Eventos.', 11, COLORS.cream));

    // Barra de título al frente (sobre las cortinas).
    this.addTopbar(c);
  }

  /** Rejilla de tarjetas scrollable (recortada por las cortinas del viewport). */
  private buildCandidateGrid(c: Phaser.GameObjects.Container, s: RecruitmentState): void {
    const cx = GAME_W / 2;
    const viewH = VIEW_BOTTOM - VIEW_TOP;
    const topPad = CARD_H / 2 + 6;

    const content = this.add.container(0, 0);
    c.add(content);

    s.candidates.forEach((cand, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = cx + (col - 1) * COL_GAP;
      const y = VIEW_TOP + topPad + row * ROW_GAP;
      content.add(this.makeCandidateCard(cand, s, x, y));
    });

    const rows = Math.ceil(s.candidates.length / COLS);
    const contentH = topPad + Math.max(0, rows - 1) * ROW_GAP + CARD_H / 2 + 12;

    // Scroll acotado: content.y en [minY, 0] (0 = tope, minY = final del contenido).
    const minY = Math.min(0, viewH - contentH);
    const clamp = (yy: number): number => Phaser.Math.Clamp(yy, minY, 0);

    let dragging = false;
    let lastPy = 0;
    let startPy = 0;
    const down = (p: Phaser.Input.Pointer): void => {
      if (this.modal) return; // no arrastrar la rejilla con el detalle abierto
      if (p.y >= VIEW_TOP && p.y <= VIEW_TOP + viewH) {
        dragging = true;
        lastPy = p.y;
        startPy = p.y;
        this.scrollMoved = false;
      }
    };
    const move = (p: Phaser.Input.Pointer): void => {
      if (!dragging) return;
      content.y = clamp(content.y + (p.y - lastPy));
      lastPy = p.y;
      if (Math.abs(p.y - startPy) > 8) this.scrollMoved = true;
    };
    const up = (): void => {
      dragging = false;
    };
    const wheel = (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number): void => {
      if (this.modal) return;
      if (p.y < VIEW_TOP || p.y > VIEW_TOP + viewH) return;
      content.y = clamp(content.y - dy * 0.5);
    };

    this.input.on('pointerdown', down);
    this.input.on('pointermove', move);
    this.input.on('pointerup', up);
    this.input.on('wheel', wheel);
    this.scrollHandlers = { down, move, up, wheel };
  }

  /** Tarjeta ligera de un candidato (rect + retrato + 2 textos). */
  private makeCandidateCard(cand: RecruitCandidate, s: RecruitmentState, x: number, y: number): Phaser.GameObjects.Container {
    const card = this.add.container(x, y);
    const tint = affinityColor(cand.affinity);
    card.add(this.add.rectangle(0, 0, CARD_W, CARD_H, cand.owned ? COLORS.card : COLORS.card2).setStrokeStyle(3, COLORS.border));
    card.add(portrait(this, 0, -30, cand.id, 92, tint));
    card.add(bodyText(this, 0, 40, cand.name.split(' ')[0], 15, COLORS.ink));

    let status = `Afinidad ${cand.affinity}`;
    let statusColor: number = COLORS.ink;
    if (cand.owned) {
      status = 'RECLUTADO';
      statusColor = COLORS.limeEdge;
    } else if (cand.onLoan) {
      status = `${cand.affinity} · prestado`;
    }
    card.add(bodyText(this, 0, 66, status, 12, statusColor));
    if (cand.owned) card.setAlpha(0.85);

    // Hit-area en coords top-left (Phaser suma displayOrigin al punto local).
    card.setSize(CARD_W, CARD_H).setInteractive(new Phaser.Geom.Rectangle(0, 0, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
    if (card.input) card.input.cursor = 'pointer';
    card.on('pointerup', () => {
      if (!this.scrollMoved) this.openCandidate(cand, s);
    });
    return card;
  }

  /** Ventana de detalle compartida, con la acción RECLUTAR en el pie. */
  private openCandidate(cand: RecruitCandidate, s: RecruitmentState): void {
    this.modal?.destroy();

    let subtitle = `Afinidad ${cand.affinity}`;
    if (cand.onLoan) subtitle += ' · prestado ahora';

    let hint: string;
    let costText: string;
    let costColor: number;
    let primaryLabel: string;
    let primaryEnabled: boolean;
    let primaryVariant: 'lime' | 'grey' | 'maroon' = 'lime';
    let onPrimary: () => void = () => {};

    if (cand.owned) {
      hint = 'Ya forma parte de tu corte. Súbele el nivel desde Colección.';
      costText = 'RECLUTADO';
      costColor = COLORS.lime;
      primaryLabel = 'RECLUTADO';
      primaryEnabled = false;
      primaryVariant = 'grey';
    } else {
      const match = AFF_COLOR[cand.affinity];
      const useColor: ContractColor | null = s.contracts[match] > 0 ? match : s.contracts.white > 0 ? 'white' : null;
      const canPay = useColor !== null && s.gold >= s.unlockCost;
      hint = `Reclutar es permanente: gasta 1 contrato (${CONTRACT_NAME[match]} o comodín) + ${s.unlockCost} oro.`;
      costText = useColor
        ? `Costo: ${s.unlockCost} oro + 1 contrato ${CONTRACT_NAME[useColor]}`
        : `Falta un contrato ${CONTRACT_NAME[match]} (o comodín)`;
      costColor = canPay ? COLORS.gold : COLORS.danger;
      primaryLabel = useColor ? `RECLUTAR (${CONTRACT_NAME[useColor].toUpperCase()})` : 'FALTA CONTRATO';
      primaryEnabled = canPay;
      primaryVariant = canPay ? 'lime' : 'grey';
      if (canPay) onPrimary = () => this.unlock(cand.id, useColor as ContractColor);
    }

    this.modal = openConsejeroModal(
      this,
      { id: cand.id, name: cand.name, affinity: cand.affinity, subtitle },
      {
        hint,
        costText,
        costColor,
        primaryLabel,
        primaryEnabled,
        primaryVariant,
        onPrimary,
        onClose: () => {
          this.modal = undefined;
        },
      }
    );
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
    this.modal?.destroy();
    this.modal = undefined;
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
