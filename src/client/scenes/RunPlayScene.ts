/* ============================================================
   RunPlayScene — campaña de entrenamiento de RUN_TURNS turnos.
   Layout basado en `mockups/run.md` (LIVE FEED del campamento,
   deck de asesores, energía/ánimo y las decisiones al fondo).

   Paridad cliente/servidor: TODA la lógica de turnos vive en la
   función compartida `stepRun` (src/shared/sim/stepRun.ts). Esta
   escena NO duplica matemática: tras cada decisión re-simula con
   `stepRun(seed, deck, actionLog)` y pinta stats/energía + el
   feedback desde el `TurnResult`. El servidor acuña con la MISMA
   función, así que no pueden divergir.

   La decisión del turno es una apuesta legible:
   - Entrenar OFE/DEF/MAN: gasta energía; energía baja = riesgo de
     FALLO; cada tirada puede ser fallo / normal / CRÍTICO.
   - Descansar: recupera energía a cambio del turno.
   - Eventos (turnos derivados del seed): dilema con 2 ramas.
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
  floatingGain,
  outcomeBanner,
} from '../ui/widgets.ts';
import {
  stepRun,
  previewTurn,
  isEventTurn,
  eventForTurn,
  calculatePower,
  BASE_STAT,
  ENERGY_MAX,
  RUN_TURNS,
} from '../../shared/sim/index.ts';
import { loadUserData } from '../state.ts';
import { api } from '../api.ts';
import type {
  Affinity,
  ActionLog,
  Consejero,
  GeneralStats,
  TurnResult,
} from '../../shared/types/index.ts';

interface RunData {
  runId: string;
  seed: string;
  name: string;
  advisors: Consejero[];
}

const MOOD_MAX = 1.5;

/** Paleta de cada tarjeta de stat (OFE rojo, DEF verde, MAN azul). */
const STAT_PALETTE: Record<Affinity, { fill: number; top: number; edge: number; text: number }> = {
  OFE: { fill: 0x9a3b34, top: 0xb85048, edge: 0x5e211c, text: COLORS.cream },
  DEF: { fill: COLORS.lime, top: COLORS.limeTop, edge: COLORS.limeEdge, text: COLORS.ink },
  MAN: { fill: 0x2f6aa3, top: 0x4a86c0, edge: 0x1c466b, text: COLORS.cream },
};

const STAT_KEY: Record<Affinity, keyof GeneralStats> = { OFE: 'ofe', DEF: 'def', MAN: 'man' };

export class RunPlayScene extends Phaser.Scene {
  private run!: RunData;
  private turn = 0;
  private stats: GeneralStats = { ofe: BASE_STAT, def: BASE_STAT, man: BASE_STAT };
  private actionLog: ActionLog = [];
  private energy = ENERGY_MAX;
  private mood = 1.0;
  private dyn?: Phaser.GameObjects.Container;

  constructor() {
    super('RunPlay');
  }

  init(data: RunData): void {
    this.run = data;
    this.turn = 0;
    this.stats = { ofe: BASE_STAT, def: BASE_STAT, man: BASE_STAT };
    this.actionLog = [];
    this.energy = ENERGY_MAX;
    this.mood = 1.0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    screenTopbar(this, `Campamento: ${this.run.name}`, () => this.scene.start('Home'));
    this.add.image(GAME_W - PAD - 22, 52, 'icon_gear').setDisplaySize(40, 40).setAlpha(0.9);
    this.render();
  }

  private render(): void {
    this.dyn?.destroy();
    const c = this.add.container(0, 0);
    this.dyn = c;

    this.turnEnergyHeader(c);
    this.advisorDeck(c);
    this.liveFeed(c);

    if (this.turn >= RUN_TURNS) {
      this.completion(c);
    } else if (isEventTurn(this.run.seed, this.turn)) {
      this.eventCard(c);
    } else {
      this.recovery(c);
      this.trainingCards(c);
    }
  }

  /* ---- 1. Estado de turno + energía ---------------------------- */
  private turnEnergyHeader(c: Phaser.GameObjects.Container): void {
    const shown = Math.min(this.turn + 1, RUN_TURNS);
    const total = String(RUN_TURNS).padStart(2, '0');

    const turnW = 416;
    const turnX = PAD + turnW / 2;
    c.add(retroPanel(this, turnX, 150, turnW, 88, COLORS.card));
    c.add(titleText(this, turnX, 132, 'TURNO ACTUAL', 12, COLORS.ink));
    c.add(titleText(this, turnX, 164, `${String(shown).padStart(2, '0')} / ${total}`, 24, COLORS.ink));

    const moodW = CONTENT_W - turnW - 16;
    const moodX = GAME_W - PAD - moodW / 2;
    const face = this.mood >= 1.2 ? ':D' : this.mood >= 0.9 ? ':)' : ':(';
    c.add(retroPanel(this, moodX, 150, moodW, 88, COLORS.card));
    c.add(titleText(this, moodX, 132, 'ANIMO', 11, COLORS.ink));
    c.add(bodyText(this, moodX, 166, `${face}  x${this.mood.toFixed(1)}`, 18, COLORS.ink));

    // Barra de energía (ahora REAL: gobierna el riesgo de fallo).
    const pct = this.energy / ENERGY_MAX;
    const col = this.energy > 55 ? COLORS.lime : this.energy > 30 ? COLORS.gold : COLORS.danger;
    c.add(bodyText(this, PAD, 212, 'ENERGIA', 15, COLORS.cream).setOrigin(0, 0.5));
    c.add(bodyText(this, GAME_W - PAD, 212, `${Math.round(this.energy)}%`, 15, col).setOrigin(1, 0.5));
    c.add(this.add.rectangle(PAD, 248, CONTENT_W, 28, 0x3a2f22).setOrigin(0, 0.5).setStrokeStyle(3, COLORS.border));
    c.add(this.add.rectangle(PAD + 3, 248, Math.max(2, (CONTENT_W - 6) * pct), 20, col).setOrigin(0, 0.5));
  }

  /* ---- 2. Estado de asesores (deck) ---------------------------- */
  private advisorDeck(c: Phaser.GameObjects.Container): void {
    c.add(bodyText(this, PAD, 292, 'ESTADO DE ASESORES', 14, COLORS.cream).setOrigin(0, 0.5));
    c.add(bodyText(this, GAME_W - PAD, 292, '* ACTIVOS', 12, COLORS.gold).setOrigin(1, 0.5));

    const slotW = 150;
    const slotH = 132;
    for (let i = 0; i < 4; i++) {
      const x = PAD + slotW / 2 + i * (slotW + 16);
      const adv = this.run.advisors[i];
      c.add(this.advisorSlot(adv ?? null, x, 374, slotW, slotH));
    }
  }

  private advisorSlot(
    adv: Consejero | null,
    x: number,
    y: number,
    w: number,
    h: number
  ): Phaser.GameObjects.Container {
    const slot = this.add.container(x, y);
    const tint = adv ? affinityColor(adv.affinity) : COLORS.cardLo;
    slot.add(this.add.rectangle(0, 0, w, h, adv ? COLORS.card2 : 0x3a342c).setStrokeStyle(3, adv ? tint : COLORS.border));

    if (!adv) {
      slot.add(bodyText(this, 0, 0, 'vacío', 14, COLORS.cardLo));
      return slot;
    }

    slot.add(portrait(this, 0, -12, adv.id, 78, tint));
    slot.add(this.add.rectangle(w / 2 - 28, -h / 2 + 16, 50, 24, COLORS.panelDark).setStrokeStyle(2, COLORS.border));
    slot.add(titleText(this, w / 2 - 28, -h / 2 + 16, `LV.${adv.level}`, 10, COLORS.cream));
    slot.add(bodyText(this, 0, h / 2 - 18, `* ${adv.name.split(' ')[0]}`, 13, COLORS.gold));
    return slot;
  }

  /* ---- 3. Recuperación (descanso consume el turno) ------------- */
  private recovery(c: Phaser.GameObjects.Container): void {
    c.add(bodyText(this, PAD, 462, 'RECUPERACIÓN', 14, COLORS.cream).setOrigin(0, 0.5));
    const full = this.energy >= ENERGY_MAX;
    c.add(
      retroButton(this, GAME_W / 2, 510, full ? 'ENERGÍA AL MÁXIMO' : 'DESCANSO REPARADOR   (recupera energía)', {
        variant: 'grey',
        width: CONTENT_W,
        height: 56,
        fontSize: 14,
        enabled: !full,
        onClick: () => this.rest(),
      })
    );
  }

  /* ---- 4. LIVE FEED -------------------------------------------- */
  private liveFeed(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    const py = 720;
    const ph = 240;

    c.add(bodyText(this, PAD, 596, '* LIVE FEED', 14, COLORS.gold).setOrigin(0, 0.5));
    c.add(this.add.rectangle(cx, py, CONTENT_W, ph, COLORS.panelDark).setStrokeStyle(3, COLORS.border));
    c.add(this.add.rectangle(cx, py, CONTENT_W - 16, ph - 16, COLORS.grassDark).setStrokeStyle(2, 0x2c2319));

    c.add(this.add.image(cx - 218, py - 18, 'tower').setDisplaySize(110, 110));
    c.add(this.add.image(cx + 214, py + 6, 'barracks').setDisplaySize(138, 110));
    c.add(this.add.sprite(cx - 150, py + 72, 'warriorBlue').setDisplaySize(74, 74).play('warriorBlue_idle'));
    c.add(this.add.sprite(cx + 130, py + 78, 'warriorBlue').setDisplaySize(74, 74).play('warriorBlue_idle'));

    c.add(portrait(this, cx, py - 12, this.run.name, 104, COLORS.gold));
    c.add(bodyText(this, cx, py + 56, 'RETRATO GENERAL', 12, COLORS.cream));
    c.add(bodyText(this, cx, py + ph / 2 - 16, 'SECTOR 7G // TRAINING GROUND', 11, 0xcfe3a8).setAlpha(0.85));
  }

  /* ---- 5. Tarjetas de entrenamiento (la apuesta) -------------- */
  private trainingCards(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    c.add(titleText(this, cx, 982, 'ENTRENAMIENTO', 14, COLORS.cream));
    (['OFE', 'DEF', 'MAN'] as Affinity[]).forEach((choice, j) => {
      c.add(this.statCard(choice, cx + (j - 1) * 214, 1130));
    });
  }

  private statCard(choice: Affinity, x: number, y: number): Phaser.GameObjects.Container {
    const W = 200;
    const H = 222;
    const pal = STAT_PALETTE[choice];
    const pv = previewTurn(this.run.advisors, choice, this.energy);
    const risky = pv.successPct < 0.7;

    const card = this.add.container(x, y);
    const shadow = this.add.rectangle(5, 5, W, H, 0x000000, 0.4);
    const body = this.add.rectangle(0, 0, W, H, pal.fill).setStrokeStyle(4, risky ? COLORS.danger : COLORS.border);
    const top = this.add.rectangle(0, -H / 2 + 4, W - 8, 5, pal.top);
    const bottom = this.add.rectangle(0, H / 2 - 5, W - 8, 6, pal.edge);

    const name = titleText(this, 0, -78, choice, 22, pal.text);
    const val = titleText(this, 0, -28, String(this.stats[STAT_KEY[choice]]), 30, pal.text);
    const gain = bodyText(this, 0, 18, `+${pv.normalGain}  (✦+${pv.critGain})`, 15, pal.text);
    const odds = bodyText(
      this,
      0,
      48,
      `✓${Math.round(pv.successPct * 100)}%   ✦${Math.round(pv.critPct * 100)}%`,
      13,
      risky ? COLORS.gold : pal.text
    );
    const cost = bodyText(this, 0, 76, `⚡ -${pv.energyCost} energía`, 12, pal.text).setAlpha(0.85);

    const press = this.add.container(0, 0, [body, top, bottom, name, val, gain, odds, cost]);
    card.add([shadow, press]);
    card.setSize(W, H);

    card.setInteractive(new Phaser.Geom.Rectangle(-W / 2, -H / 2, W, H), Phaser.Geom.Rectangle.Contains);
    if (card.input) card.input.cursor = 'pointer';
    card.on('pointerdown', () => {
      press.setPosition(3, 3);
      shadow.setVisible(false);
    });
    card.on('pointerout', () => {
      press.setPosition(0, 0);
      shadow.setVisible(true);
    });
    card.on('pointerup', () => {
      press.setPosition(0, 0);
      shadow.setVisible(true);
      this.train(choice);
    });
    return card;
  }

  /* ---- 5b. Carta de evento (dilema con 2 ramas) --------------- */
  private eventCard(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    const ev = eventForTurn(this.run.seed, this.turn);

    c.add(titleText(this, cx, 974, '⚡ EVENTO', 16, COLORS.gold));
    c.add(retroPanel(this, cx, 1058, CONTENT_W, 120, COLORS.card));
    c.add(titleText(this, cx, 1018, ev.name, 16, COLORS.ink));
    c.add(
      bodyText(this, cx, 1066, ev.description, 13, COLORS.ink).setWordWrapWidth(CONTENT_W - 60).setAlign('center')
    );

    c.add(
      retroButton(this, cx, 1150, ev.branches[0].label, {
        width: CONTENT_W,
        height: 56,
        fontSize: 14,
        onClick: () => this.chooseEvent(0),
      })
    );
    c.add(
      retroButton(this, cx, 1214, ev.branches[1].label, {
        variant: 'grey',
        width: CONTENT_W,
        height: 56,
        fontSize: 14,
        onClick: () => this.chooseEvent(1),
      })
    );
  }

  /* ---- Estado final: acuñar ------------------------------------ */
  private completion(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    c.add(titleText(this, cx, 1000, 'ENTRENAMIENTO COMPLETO', 18, COLORS.gold));
    c.add(
      bodyText(this, cx, 1052, 'Tu recluta terminó la campaña. Acuña la unidad\ninmutable para enviarla al combate.', 14, COLORS.cream).setAlign(
        'center'
      )
    );
    c.add(titleText(this, cx, 1110, `PODER  ${calculatePower(this.stats)}`, 18, COLORS.cream));
    c.add(
      retroButton(this, cx, 1196, '🎖️ ACUÑAR GENERAL', {
        width: CONTENT_W,
        height: 84,
        fontSize: 18,
        onClick: () => this.submit(),
      })
    );
  }

  /* ---- Lógica: una sola fuente de verdad vía stepRun ---------- */

  /** Re-simula la run con el actionLog actual y devuelve el TurnResult del último turno. */
  private recompute(): TurnResult {
    const res = stepRun(this.run.seed, this.run.advisors, this.actionLog);
    this.stats = res.stats;
    this.energy = res.energy;
    return res.turns[res.turns.length - 1];
  }

  private train(choice: Affinity): void {
    if (this.turn >= RUN_TURNS || isEventTurn(this.run.seed, this.turn)) return;
    this.actionLog.push({ kind: 'train', choice });
    const tr = this.recompute();
    this.applyMood(tr);
    this.turn += 1;
    this.render();
    this.showTrainFeedback(tr);
  }

  private rest(): void {
    if (this.turn >= RUN_TURNS || isEventTurn(this.run.seed, this.turn)) return;
    this.actionLog.push({ kind: 'rest' });
    const tr = this.recompute();
    this.mood = Math.min(MOOD_MAX, this.mood + 0.05);
    this.turn += 1;
    this.render();
    floatingGain(this, GAME_W / 2, 520, `+${tr.energyAfter - tr.energyBefore} ENERGÍA`, COLORS.lime, 20);
  }

  private chooseEvent(branch: 0 | 1): void {
    if (this.turn >= RUN_TURNS || !isEventTurn(this.run.seed, this.turn)) return;
    this.actionLog.push({ kind: 'event', branch });
    const tr = this.recompute();
    this.turn += 1;
    this.render();
    if (tr.event) {
      const keys = Object.keys(tr.gains) as (keyof GeneralStats)[];
      const positive = keys.length > 0 && keys.every((k) => (tr.gains[k] ?? 0) >= 0);
      const negative = keys.some((k) => (tr.gains[k] ?? 0) < 0);
      const col = negative ? COLORS.danger : positive ? COLORS.gold : COLORS.cream;
      outcomeBanner(this, tr.event.name, col, negative);
      toast(this, tr.event.outcomeText, col);
      this.showStatDeltas(tr);
      this.mood = Phaser.Math.Clamp(this.mood + (negative ? -0.1 : positive ? 0.1 : 0), 0.5, MOOD_MAX);
    }
  }

  /* ---- Feedback por acción ------------------------------------- */
  private showTrainFeedback(tr: TurnResult): void {
    if (tr.kind !== 'train' || !tr.choice) return;
    const idx = (['OFE', 'DEF', 'MAN'] as Affinity[]).indexOf(tr.choice);
    const x = GAME_W / 2 + (idx - 1) * 214;
    const y = 1010;
    if (tr.outcome === 'fail') {
      floatingGain(this, x, y, '✗ FALLO', COLORS.danger, 24);
      outcomeBanner(this, '✗ ENTRENAMIENTO FALLIDO', COLORS.danger, true);
      return;
    }
    const delta = tr.gains[STAT_KEY[tr.choice]] ?? 0;
    const crit = tr.outcome === 'crit';
    floatingGain(this, x, y, `+${delta} ${tr.choice}`, crit ? COLORS.gold : COLORS.lime, crit ? 30 : 24);
    if (crit) outcomeBanner(this, '✦ ¡ENTRENAMIENTO PERFECTO! ✦', COLORS.gold, false);
  }

  private showStatDeltas(tr: TurnResult): void {
    const order: (keyof GeneralStats)[] = ['ofe', 'def', 'man'];
    const present = order.filter((k) => tr.gains[k]);
    present.forEach((k, i) => {
      const d = tr.gains[k] ?? 0;
      const x = GAME_W / 2 + (i - (present.length - 1) / 2) * 130;
      floatingGain(this, x, 660, `${d > 0 ? '+' : ''}${d} ${k.toUpperCase()}`, d > 0 ? COLORS.lime : COLORS.danger, 20);
    });
  }

  private applyMood(tr: TurnResult): void {
    if (tr.kind !== 'train') return;
    if (tr.outcome === 'crit') this.mood = Math.min(MOOD_MAX, this.mood + 0.1);
    else if (tr.outcome === 'fail') this.mood = Math.max(0.5, this.mood - 0.15);
  }

  private async submit(): Promise<void> {
    const hide = loadingOverlay(this);
    try {
      await api.post('/api/run/submit', { runId: this.run.runId, actionLog: this.actionLog, name: this.run.name });
      await loadUserData();
      hide();
      this.scene.start('Home');
    } catch (err: any) {
      hide();
      toast(this, err.message || 'Error al acuñar', COLORS.danger);
    }
  }
}
