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

   La decisión del turno es una apuesta legible resuelta con DADOS:
   - El jugador ASIGNA consejeros del deck al entrenamiento (toca los
     slots); cada uno reforma el dado y sube su "afinidad" (bond),
     que al cruzar el umbral desbloquea su habilidad de combate.
   - Entrenar OFE/DEF/MAN: gasta energía y tira el dado (fallo/normal/
     crítico). Descansar: recupera energía. Eventos: dilema con 2 ramas.
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
import { DiceRoller } from '../ui/diceRoller.ts';
import { grassField } from '../ui/terrain.ts';
import {
  stepRun,
  previewTurn,
  isEventTurn,
  eventForTurn,
  calculatePower,
  activeAdvisorsForTurn,
  BASE_STAT,
  ENERGY_MAX,
  RUN_TURNS,
  BOND_THRESHOLD,
  CONSEJERO_ABILITY,
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
  private bond: Record<string, number> = {};
  /** Consejeros que ASISTEN este turno (set activo determinista por seed+turno). */
  private activeThisTurn = new Set<string>();
  private busy = false;
  private dyn?: Phaser.GameObjects.Container;
  private roller?: DiceRoller;

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
    this.bond = {};
    this.activeThisTurn = new Set<string>();
    this.busy = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    screenTopbar(this, `Campamento: ${this.run.name}`, () => this.scene.start('Home'));
    this.add.image(GAME_W - PAD - 22, 52, 'icon_gear').setDisplaySize(40, 40).setAlpha(0.9);
    this.render();
  }

  private render(): void {
    this.dyn?.destroy();
    this.roller?.destroy();
    this.roller = undefined;
    const c = this.add.container(0, 0);
    this.dyn = c;

    // Set ACTIVO de este turno: determinista (seed+turno). Solo en turnos de entrenamiento.
    const isTrain = this.turn < RUN_TURNS && !isEventTurn(this.run.seed, this.turn);
    this.activeThisTurn = isTrain
      ? new Set(activeAdvisorsForTurn(this.run.seed, this.run.advisors, this.turn).map((adv) => adv.id))
      : new Set<string>();

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

    const turnW = 430;
    const turnX = PAD + turnW / 2;
    c.add(retroPanel(this, turnX, 152, turnW, 92, COLORS.card));
    c.add(titleText(this, turnX, 132, 'TURNO ACTUAL', 14, COLORS.ink));
    c.add(titleText(this, turnX, 166, `${String(shown).padStart(2, '0')} / ${total}`, 26, COLORS.ink));

    const moodW = CONTENT_W - turnW - 16;
    const moodX = GAME_W - PAD - moodW / 2;
    const face = this.mood >= 1.2 ? ':D' : this.mood >= 0.9 ? ':)' : ':(';
    c.add(retroPanel(this, moodX, 152, moodW, 92, COLORS.card));
    c.add(titleText(this, moodX, 132, 'ANIMO', 14, COLORS.ink));
    c.add(bodyText(this, moodX, 168, `${face}  x${this.mood.toFixed(1)}`, 20, COLORS.ink));

    // Barra de energía (ahora REAL: gobierna el riesgo de fallo).
    const pct = this.energy / ENERGY_MAX;
    const col = this.energy > 55 ? COLORS.lime : this.energy > 30 ? COLORS.gold : COLORS.danger;
    c.add(bodyText(this, PAD, 216, 'ENERGIA', 18, COLORS.cream).setOrigin(0, 0.5));
    c.add(bodyText(this, GAME_W - PAD, 216, `${Math.round(this.energy)}%`, 18, col).setOrigin(1, 0.5));
    c.add(this.add.rectangle(PAD, 252, CONTENT_W, 30, 0x3a2f22).setOrigin(0, 0.5).setStrokeStyle(3, COLORS.border));
    c.add(this.add.rectangle(PAD + 3, 252, Math.max(2, (CONTENT_W - 6) * pct), 22, col).setOrigin(0, 0.5));
  }

  /* ---- 2. Estado de asesores (deck) ---------------------------- */
  private advisorDeck(c: Phaser.GameObjects.Container): void {
    c.add(bodyText(this, PAD, 300, 'ESTADO DE ASESORES', 17, COLORS.cream).setOrigin(0, 0.5));
    c.add(
      bodyText(this, GAME_W - PAD, 300, `${this.activeThisTurn.size}/${this.run.advisors.length} ACTIVOS`, 14, COLORS.gold).setOrigin(
        1,
        0.5
      )
    );

    // Dibuja exactamente los asesores del deck (no un 4º slot vacío).
    const advisors = this.run.advisors;
    const n = Math.max(1, advisors.length);
    const gap = 18;
    const slotW = (CONTENT_W - (n - 1) * gap) / n;
    const slotH = 140;
    for (let i = 0; i < n; i++) {
      const x = PAD + slotW / 2 + i * (slotW + gap);
      c.add(this.advisorSlot(advisors[i] ?? null, x, 388, slotW, slotH));
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

    if (!adv) {
      slot.add(this.add.rectangle(0, 0, w, h, 0x3a342c).setStrokeStyle(3, COLORS.border));
      slot.add(bodyText(this, 0, 0, 'vacío', 16, COLORS.cardLo));
      return slot;
    }

    // Activo este turno: el consejero ASISTE (determinista, no se elige a mano).
    const active = this.activeThisTurn.has(adv.id);
    const bondVal = this.bond[adv.id] ?? 0;
    const unlocked = bondVal >= BOND_THRESHOLD;
    const borderCol = active ? COLORS.gold : unlocked ? COLORS.gold : tint;

    slot.add(
      this.add
        .rectangle(0, 0, w, h, active ? 0x4a4636 : COLORS.card2)
        .setStrokeStyle(active ? 4 : 3, borderCol)
    );
    slot.add(portrait(this, 0, -20, adv.id, 82, tint));
    slot.add(this.add.rectangle(w / 2 - 30, -h / 2 + 18, 56, 28, COLORS.panelDark).setStrokeStyle(2, COLORS.border));
    slot.add(titleText(this, w / 2 - 30, -h / 2 + 18, `LV.${adv.level}`, 12, COLORS.cream));
    if (unlocked) slot.add(titleText(this, -w / 2 + 16, -h / 2 + 18, 'MAX', 10, COLORS.gold));
    // Estado de asistencia: ACTIVO (asiste este turno) vs en espera (atenuado).
    slot.add(
      active
        ? titleText(this, 0, -h / 2 + 18, 'ACTIVO', 12, COLORS.gold)
        : bodyText(this, 0, -h / 2 + 18, '· · ·', 14, COLORS.cardLo)
    );
    slot.add(bodyText(this, 0, h / 2 - 32, adv.name.split(' ')[0], 14, COLORS.gold));

    // Medidor de AFINIDAD (bond) — barra fina al pie del slot.
    const barW = w - 28;
    const prog = Math.max(0, Math.min(1, bondVal / BOND_THRESHOLD));
    slot.add(this.add.rectangle(0, h / 2 - 12, barW, 8, 0x3a2f22).setStrokeStyle(1, COLORS.border));
    if (prog > 0) {
      slot.add(
        this.add
          .rectangle(-barW / 2 + 1, h / 2 - 12, Math.max(2, (barW - 2) * prog), 5, unlocked ? COLORS.gold : tint)
          .setOrigin(0, 0.5)
      );
    }

    // Los consejeros en espera se ven ATENUADOS (ya no se tocan: se activan al azar).
    if (!active) slot.setAlpha(0.55);
    return slot;
  }

  /* ---- 3. Recuperación (descanso consume el turno) ------------- */
  private recovery(c: Phaser.GameObjects.Container): void {
    c.add(bodyText(this, PAD, 472, 'RECUPERACIÓN', 17, COLORS.cream).setOrigin(0, 0.5));
    const full = this.energy >= ENERGY_MAX;
    c.add(
      retroButton(this, GAME_W / 2, 520, full ? 'ENERGÍA AL MÁXIMO' : 'DESCANSO REPARADOR   (recupera energía)', {
        variant: 'grey',
        width: CONTENT_W,
        height: 62,
        fontSize: 16,
        enabled: !full,
        onClick: () => this.rest(),
      })
    );
  }

  /* ---- 4. LIVE FEED -------------------------------------------- */
  private liveFeed(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    const py = 700;
    const ph = 210;

    c.add(bodyText(this, PAD, 580, 'LIVE FEED', 17, COLORS.gold).setOrigin(0, 0.5));
    // Césped vivo: árboles de fondo, arbustos, rocas y una oveja pastando.
    // Semilla derivada de la run => el campamento se ve igual entre turnos.
    c.add(
      grassField(this, cx, py, CONTENT_W, ph, {
        seed: this.hashSeed(this.run.seed),
        trees: 3,
        bushes: 3,
        rocks: 2,
        sheep: true,
      })
    );

    c.add(this.add.image(cx - 300, py - 18, 'tower').setDisplaySize(112, 112));
    c.add(this.add.image(cx + 296, py + 6, 'barracks').setDisplaySize(140, 112));
    c.add(this.add.sprite(cx - 210, py + 64, 'warriorBlue').setDisplaySize(76, 76).play('warriorBlue_idle'));
    c.add(this.add.sprite(cx + 190, py + 70, 'warriorBlue').setDisplaySize(76, 76).play('warriorBlue_idle'));

    c.add(portrait(this, cx, py - 12, this.run.name, 104, COLORS.gold));
    c.add(bodyText(this, cx, py + ph / 2 - 18, 'SECTOR 7G // TRAINING GROUND', 13, 0xcfe3a8).setAlpha(0.85));
  }

  /** Hash estable string->int para sembrar el reparto del césped. */
  private hashSeed(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) || 1;
  }

  /* ---- 5. Tarjetas de entrenamiento (la apuesta) -------------- */
  private trainingCards(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    c.add(titleText(this, cx, 958, 'ENTRENAMIENTO', 17, COLORS.cream));
    const n = this.activeThisTurn.size;
    c.add(
      bodyText(
        this,
        cx,
        990,
        n > 0
          ? `${n} consejero(s) ASISTEN este turno · elige una afinidad`
          : 'ningún consejero asiste este turno · elige una afinidad',
        15,
        COLORS.gold
      )
    );
    (['OFE', 'DEF', 'MAN'] as Affinity[]).forEach((choice, j) => {
      c.add(this.statCard(choice, cx + (j - 1) * 248, 1134));
    });
  }

  private statCard(choice: Affinity, x: number, y: number): Phaser.GameObjects.Container {
    const W = 236;
    const H = 236;
    const pal = STAT_PALETTE[choice];
    const pv = previewTurn(this.run.seed, this.run.advisors, choice, this.energy, this.turn);
    const risky = pv.successPct < 0.7;

    const card = this.add.container(x, y);
    const shadow = this.add.rectangle(5, 5, W, H, 0x000000, 0.4);
    const body = this.add.rectangle(0, 0, W, H, pal.fill).setStrokeStyle(4, risky ? COLORS.danger : COLORS.border);
    const top = this.add.rectangle(0, -H / 2 + 4, W - 8, 5, pal.top);
    const bottom = this.add.rectangle(0, H / 2 - 5, W - 8, 6, pal.edge);

    const name = titleText(this, 0, -88, choice, 26, pal.text);
    const val = titleText(this, 0, -40, String(this.stats[STAT_KEY[choice]]), 32, pal.text);
    const gain = bodyText(this, 0, 8, `+${pv.normalGain}  (CRIT +${pv.critGain})`, 17, pal.text);
    const odds = bodyText(
      this,
      0,
      40,
      `EX: ${Math.round(pv.successPct * 100)}%  CR: ${Math.round(pv.critPct * 100)}%`,
      16,
      risky ? COLORS.gold : pal.text
    );
    // Lectura del dado efectivo (rango de caras tras los modificadores).
    const die = pv.roll.dice[0]?.allowed ?? [1, 2, 3, 4, 5, 6];
    const dieLabel =
      pv.roll.dice.length > 1
        ? `DADOS x${pv.roll.dice.length} (${die[0]}-${die[die.length - 1]})`
        : `DADO (${die[0]}-${die[die.length - 1]})`;
    const dieTxt = bodyText(this, 0, 70, dieLabel, 14, pal.text).setAlpha(0.9);
    // Coste NETO de energía: los Intendentes activos pueden reembolsar (incluso a positivo).
    const costLabel = pv.energyCost >= 0 ? `-${pv.energyCost} ENERGÍA` : `+${-pv.energyCost} ENERGÍA`;
    const cost = bodyText(this, 0, 96, costLabel, 14, pal.text).setAlpha(0.85);

    const press = this.add.container(0, 0, [body, top, bottom, name, val, gain, odds, dieTxt, cost]);
    card.add([shadow, press]);
    card.setSize(W, H);

    // Hit-area en coords top-left: Phaser suma displayOrigin (W/2,H/2) al
    // punto local del Container antes de Contains, así que el rect va en (0,0).
    card.setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
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

    c.add(titleText(this, cx, 972, 'EVENTO', 18, COLORS.gold));
    c.add(retroPanel(this, cx, 1056, CONTENT_W, 124, COLORS.card));
    c.add(titleText(this, cx, 1014, ev.name, 18, COLORS.ink));
    c.add(
      bodyText(this, cx, 1064, ev.description, 15, COLORS.ink).setWordWrapWidth(CONTENT_W - 70).setAlign('center')
    );

    c.add(
      retroButton(this, cx, 1150, ev.branches[0].label, {
        width: CONTENT_W,
        height: 60,
        fontSize: 16,
        onClick: () => this.chooseEvent(0),
      })
    );
    c.add(
      retroButton(this, cx, 1216, ev.branches[1].label, {
        variant: 'grey',
        width: CONTENT_W,
        height: 60,
        fontSize: 16,
        onClick: () => this.chooseEvent(1),
      })
    );
  }

  /* ---- Estado final: acuñar ------------------------------------ */
  private completion(c: Phaser.GameObjects.Container): void {
    const cx = GAME_W / 2;
    c.add(titleText(this, cx, 996, 'ENTRENAMIENTO COMPLETO', 20, COLORS.gold));
    c.add(
      bodyText(this, cx, 1050, 'Tu recluta terminó la campaña. Acuña la unidad\ninmutable para enviarla al combate.', 16, COLORS.cream).setAlign(
        'center'
      )
    );
    c.add(titleText(this, cx, 1112, `PODER  ${calculatePower(this.stats)}`, 22, COLORS.cream));
    c.add(
      retroButton(this, cx, 1200, 'ACUÑAR GENERAL', {
        width: CONTENT_W,
        height: 88,
        fontSize: 20,
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
    this.bond = res.bond;
    return res.turns[res.turns.length - 1];
  }

  private train(choice: Affinity): void {
    if (this.busy || this.turn >= RUN_TURNS || isEventTurn(this.run.seed, this.turn)) return;
    this.actionLog.push({ kind: 'train', choice });
    const tr = this.recompute();
    this.applyMood(tr);
    this.turn += 1;
    this.render();
    this.playDiceThenFeedback(tr);
  }

  private rest(): void {
    if (this.busy || this.turn >= RUN_TURNS || isEventTurn(this.run.seed, this.turn)) return;
    this.actionLog.push({ kind: 'rest' });
    const tr = this.recompute();
    this.mood = Math.min(MOOD_MAX, this.mood + 0.05);
    this.turn += 1;
    this.render();
    floatingGain(this, GAME_W / 2, 520, `+${tr.energyAfter - tr.energyBefore} ENERGÍA`, COLORS.lime, 20);
  }

  private chooseEvent(branch: 0 | 1): void {
    if (this.busy || this.turn >= RUN_TURNS || !isEventTurn(this.run.seed, this.turn)) return;
    this.actionLog.push({ kind: 'event', branch });
    const tr = this.recompute();
    this.turn += 1;
    this.render();

    const showOutcome = (): void => {
      if (!tr.event) return;
      const keys = Object.keys(tr.gains) as (keyof GeneralStats)[];
      const positive = keys.length > 0 && keys.every((k) => (tr.gains[k] ?? 0) >= 0);
      const negative = keys.some((k) => (tr.gains[k] ?? 0) < 0);
      const col = negative ? COLORS.danger : positive ? COLORS.gold : COLORS.cream;
      outcomeBanner(this, tr.event.name, col, negative);
      toast(this, tr.event.outcomeText, col);
      this.showStatDeltas(tr);
      this.mood = Phaser.Math.Clamp(this.mood + (negative ? -0.1 : positive ? 0.1 : 0), 0.5, MOOD_MAX);
    };

    if (tr.dice) {
      this.busy = true;
      this.roller?.destroy();
      this.roller = new DiceRoller(this, GAME_W / 2, 880, {
        onSettled: () => {
          this.busy = false;
          showOutcome();
        },
      });
      this.roller.roll(tr.dice);
    } else {
      showOutcome();
    }
  }

  /* ---- Feedback por acción ------------------------------------- */
  /** Tira el dado y, al asentar, dispara el feedback existente. */
  private playDiceThenFeedback(tr: TurnResult): void {
    if (tr.kind === 'train' && tr.dice) {
      this.busy = true;
      this.roller?.destroy();
      this.roller = new DiceRoller(this, GAME_W / 2, 880, {
        onSettled: () => {
          this.busy = false;
          this.showTrainFeedback(tr);
          this.flashUnlocks(tr);
        },
      });
      this.roller.roll(tr.dice);
    } else {
      this.showTrainFeedback(tr);
      this.flashUnlocks(tr);
    }
  }

  /** Banner dorado cuando un consejero CRUZA el umbral de afinidad este turno. */
  private flashUnlocks(tr: TurnResult): void {
    if (!tr.bondDeltas) return;
    for (const [id, delta] of Object.entries(tr.bondDeltas)) {
      const after = this.bond[id] ?? 0;
      if (after >= BOND_THRESHOLD && after - delta < BOND_THRESHOLD) {
        const ability = CONSEJERO_ABILITY[id];
        if (ability) outcomeBanner(this, `AFINIDAD: ${ability}`, COLORS.gold, false);
      }
    }
  }

  private showTrainFeedback(tr: TurnResult): void {
    if (tr.kind !== 'train' || !tr.choice) return;
    // Efectos de run detonados por consejeros activos (el diferenciador del pool).
    if (tr.advisorProcs && tr.advisorProcs.length > 0) {
      const labels = [...new Set(tr.advisorProcs.map((p) => p.label))].join(' · ');
      toast(this, `EFECTO: ${labels}`, COLORS.gold);
    }
    const idx = (['OFE', 'DEF', 'MAN'] as Affinity[]).indexOf(tr.choice);
    const x = GAME_W / 2 + (idx - 1) * 248;
    const y = 1014;
    if (tr.outcome === 'fail') {
      floatingGain(this, x, y, 'FALLO', COLORS.danger, 24);
      outcomeBanner(this, 'ENTRENAMIENTO FALLIDO', COLORS.danger, true);
      return;
    }
    const delta = tr.gains[STAT_KEY[tr.choice]] ?? 0;
    const crit = tr.outcome === 'crit';
    floatingGain(this, x, y, `+${delta} ${tr.choice}`, crit ? COLORS.gold : COLORS.lime, crit ? 30 : 24);
    if (crit) outcomeBanner(this, '¡ENTRENAMIENTO PERFECTO!', COLORS.gold, false);
  }

  private showStatDeltas(tr: TurnResult): void {
    const order: (keyof GeneralStats)[] = ['ofe', 'def', 'man'];
    const present = order.filter((k) => tr.gains[k]);
    present.forEach((k, i) => {
      const d = tr.gains[k] ?? 0;
      const x = GAME_W / 2 + (i - (present.length - 1) / 2) * 130;
      floatingGain(this, x, 640, `${d > 0 ? '+' : ''}${d} ${k.toUpperCase()}`, d > 0 ? COLORS.lime : COLORS.danger, 20);
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
