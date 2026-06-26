/* ============================================================
   PvpCombatScene — SIMULADOR de batalla 6v6 (Fase 2).

   La VERDAD sigue siendo el `BattleResult` 1v1 determinista que
   computa el servidor (`simulateBattle`). Esta escena solo lo
   VISUALIZA: cada general despliega 6 unidades (derivadas de sus
   stats) que corren, chocan, disparan flechas y caen según el log
   de rondas. El HP del general por ronda decide cuántas unidades
   quedan en pie; el bando ganador es el del `winnerId`.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W, PAD, CONTENT_W } from '../ui/theme.ts';
import {
  headerBar,
  retroButton,
  retroPanel,
  titleText,
  bodyText,
  portrait,
  hpBar,
  floatingGain,
  outcomeBanner,
} from '../ui/widgets.ts';
import { loadUserData } from '../state.ts';
import { deriveArmy, animKey, RANGED, UNIT_SIZE, ARMY_SIZE } from '../combat/army.ts';
import type { UnitType, UnitColor } from '../combat/army.ts';
import type { BattleResult, BattleRound, General } from '../../shared/types/index.ts';

interface CombatData {
  battleResult: BattleResult;
  rewards: { goldEarned: number; scoreEarned: number };
  returnScene?: string;
  note?: string;
}

/* ---- Unidad visual: sprite + estado + comportamientos --------- */
class BattleUnit {
  readonly type: UnitType;
  readonly color: UnitColor;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly homeX: number;
  readonly homeY: number;
  alive = true;
  private scene: Phaser.Scene;
  private atkToggle = false;

  constructor(scene: Phaser.Scene, type: UnitType, color: UnitColor, x: number, y: number) {
    this.scene = scene;
    this.type = type;
    this.color = color;
    this.homeX = x;
    this.homeY = y;
    const size = UNIT_SIZE[type];
    this.sprite = scene.add
      .sprite(x, y, animKey(type, color, 'idle'))
      .setOrigin(0.5, 0.82)
      .setDisplaySize(size, size)
      .setFlipX(color === 'red');
    this.sprite.play(animKey(type, color, 'idle'));
  }

  get facing(): number {
    return this.color === 'blue' ? 1 : -1; // blue mira a la derecha, red a la izquierda
  }

  idle(): void {
    if (this.alive) this.sprite.play(animKey(this.type, this.color, 'idle'), true);
  }

  meleeAttack(onHit: () => void): void {
    if (!this.alive) {
      onHit();
      return;
    }
    let action = 'attack';
    if (this.type === 'warrior') {
      this.atkToggle = !this.atkToggle;
      action = this.atkToggle ? 'attack1' : 'attack2';
    }
    this.sprite.play(animKey(this.type, this.color, action));
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.homeX + this.facing * 46,
      duration: 140,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    this.scene.time.delayedCall(150, onHit);
    this.sprite.once('animationcomplete', () => this.idle());
  }

  shoot(onRelease: () => void): void {
    if (!this.alive) {
      onRelease();
      return;
    }
    this.sprite.play(animKey(this.type, this.color, 'shoot'));
    this.scene.time.delayedCall(220, onRelease);
    this.sprite.once('animationcomplete', () => this.idle());
  }

  flinch(): void {
    if (!this.alive) return;
    // Flash blanco (Phaser 4: tint + modo FILL).
    this.sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(90, () => {
      if (this.sprite.active) this.sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
    });
    this.scene.tweens.add({ targets: this.sprite, x: this.homeX - this.facing * 14, duration: 70, yoyo: true });
  }

  die(): void {
    if (!this.alive) return;
    this.alive = false;
    this.sprite.stop();
    this.sprite.setTint(0x6a6a6a);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: this.facing * 82,
      alpha: 0.12,
      y: this.homeY + 16,
      duration: 480,
      ease: 'Quad.easeIn',
    });
  }
}

export class PvpCombatScene extends Phaser.Scene {
  private battle!: BattleResult;
  private rewards!: { goldEarned: number; scoreEarned: number };
  private returnScene = 'Home';
  private note?: string;

  private cx = GAME_W / 2;
  private bandY = 700;
  private stepMs = 850;
  private finished = false;

  private units: Record<UnitColor, BattleUnit[]> = { blue: [], red: [] };
  private maxHp: Record<UnitColor, number> = { blue: 1, red: 1 };
  private aliveCount: Record<UnitColor, number> = { blue: ARMY_SIZE, red: ARMY_SIZE };
  private curHpFrac: Record<UnitColor, number> = { blue: 1, red: 1 };
  private setHp: Record<UnitColor, (p: number) => void> = { blue: () => {}, red: () => {} };
  private actorIdx: Record<UnitColor, number> = { blue: 0, red: 0 };
  private targetIdx: Record<UnitColor, number> = { blue: 0, red: 0 };

  private roundLabel!: Phaser.GameObjects.Text;
  private logText!: Phaser.GameObjects.Text;
  private logLines: string[] = [];
  private stepTimer?: Phaser.Time.TimerEvent;
  private skipBtn?: Phaser.GameObjects.Container;

  constructor() {
    super('PvpCombat');
  }

  init(data: CombatData): void {
    this.battle = data.battleResult;
    this.rewards = data.rewards || { goldEarned: 0, scoreEarned: 0 };
    this.returnScene = data.returnScene || 'Home';
    this.note = data.note;
    this.finished = false;
    this.units = { blue: [], red: [] };
    this.aliveCount = { blue: ARMY_SIZE, red: ARMY_SIZE };
    this.curHpFrac = { blue: 1, red: 1 };
    this.actorIdx = { blue: 0, red: 0 };
    this.targetIdx = { blue: 0, red: 0 };
    this.logLines = [];
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    const cx = this.cx;
    headerBar(this, cx, 92, CONTENT_W, '⚔️ Simulador de Batalla ⚔️', 14);

    const a = this.battle.generalA;
    const b = this.battle.generalB;
    this.maxHp.blue = 100 + a.stats.def * 3 + a.stats.man * 2;
    this.maxHp.red = 100 + b.stats.def * 3 + b.stats.man * 2;

    this.sideHeader(a, cx - 170, 0x4a86c0);
    this.sideHeader(b, cx + 170, 0xb85048);
    titleText(this, cx, 250, 'VS', 26, COLORS.danger);

    // Iniciativa (quién pega primero = mayor Mando, ya reflejado en rounds[0]).
    const firstBlue = this.battle.rounds[0]?.attackerId === a.id;
    titleText(this, firstBlue ? cx - 170 : cx + 170, 360, '▶ INICIATIVA', 10, COLORS.gold);

    // Barras de HP de ejército.
    const barA = hpBar(this, PAD + 6, 396, 300, 1);
    this.setHp.blue = barA.set;
    const barB = hpBar(this, cx + 14, 396, 300, 1);
    this.setHp.red = barB.set;

    // Campo de batalla.
    this.add.rectangle(cx, 660, CONTENT_W, 470, COLORS.grassDark).setStrokeStyle(3, 0x2c2319);
    this.placeArmy('blue');
    this.placeArmy('red');

    // Log + ronda.
    this.roundLabel = titleText(this, cx, 918, `Ronda 0 / ${this.battle.rounds.length}`, 12, COLORS.cream);
    retroPanel(this, cx, 1010, CONTENT_W, 150, COLORS.card);
    this.logText = bodyText(this, cx, 1010, 'Las tropas se forman para la batalla...', 13, COLORS.ink)
      .setWordWrapWidth(CONTENT_W - 60)
      .setAlign('center');

    this.buildSkipControl();

    this.time.delayedCall(700, () => this.playRound(0));
  }

  /* ---- Cabecera de cada bando --------------------------------- */
  private sideHeader(gen: General, x: number, tint: number): void {
    titleText(this, x, 158, gen.name.length > 12 ? gen.name.slice(0, 12) + '…' : gen.name, 13, COLORS.cream);
    portrait(this, x, 240, gen.id, 88, tint);
    bodyText(this, x, 300, `O${gen.stats.ofe}  D${gen.stats.def}  M${gen.stats.man}`, 12, COLORS.cream);
    const ab = gen.abilities.length ? gen.abilities.slice(0, 2).join(' · ') : 'Sin habilidades';
    bodyText(this, x, 326, ab, 9, COLORS.gold).setWordWrapWidth(300).setAlign('center');
  }

  /* ---- Despliegue de las 6 unidades --------------------------- */
  private placeArmy(side: UnitColor): void {
    const dir = side === 'blue' ? -1 : 1; // blue a la izquierda
    const frontX = this.cx + dir * 120;
    const backX = this.cx + dir * 252;
    const army = deriveArmy(side === 'blue' ? this.battle.generalA : this.battle.generalB);
    const melee = army.filter((t) => !RANGED[t]);
    const ranged = army.filter((t) => RANGED[t]);

    const place = (list: UnitType[], baseX: number) => {
      const n = list.length;
      list.forEach((t, i) => {
        const y = this.bandY + (i - (n - 1) / 2) * 70;
        const x = baseX + (i % 2 === 0 ? 0 : dir * 26);
        this.units[side].push(new BattleUnit(this, t, side, x, y));
      });
    };
    place(melee, frontX);
    place(ranged, backX);
  }

  /* ---- Driver de coreografía ---------------------------------- */
  private playRound(i: number): void {
    if (this.finished) return;
    if (i >= this.battle.rounds.length) {
      this.resolve();
      return;
    }
    const r = this.battle.rounds[i];
    const atkSide: UnitColor = r.attackerId === this.battle.generalA.id ? 'blue' : 'red';
    const defSide: UnitColor = atkSide === 'blue' ? 'red' : 'blue';

    this.pushLog(r.log);
    this.roundLabel.setText(`Ronda ${i + 1} / ${this.battle.rounds.length}`);

    const attacker = this.pickActor(atkSide);
    const target = this.pickTarget(defSide);
    const impact = () => this.applyImpact(r, defSide, target);

    if (attacker) {
      if (attacker.type === 'archer') attacker.shoot(() => this.fireArrow(attacker, target, impact));
      else attacker.meleeAttack(impact);
    } else {
      this.time.delayedCall(200, impact);
    }

    this.stepTimer = this.time.delayedCall(this.stepMs, () => this.playRound(i + 1));
  }

  private applyImpact(r: BattleRound, defSide: UnitColor, target: BattleUnit | null): void {
    if (this.finished) return;
    const crit = !!r.crit;
    const fx = target ? target.sprite.x : defSide === 'blue' ? this.cx - 160 : this.cx + 160;
    const fy = (target ? target.sprite.y : this.bandY) - 80;
    const dmgText = r.blocked ? `${r.damage} 🛡` : crit ? `¡${r.damage}!` : `${r.damage}`;
    const col = r.blocked ? 0x9fd0ff : crit ? COLORS.gold : COLORS.danger;
    floatingGain(this, fx, fy, dmgText, col, crit ? 30 : 22);
    if (target) target.flinch();

    const procs = r.abilityProcs ?? [];
    if (crit) {
      outcomeBanner(this, '✦ ¡GOLPE CRÍTICO!', COLORS.gold, true);
      this.cameras.main.shake(180, 0.01);
      this.fxAnim('cu_explosion', fx, fy + 30, 0.75);
    } else if (procs.length) {
      outcomeBanner(this, `¡${procs[0].toUpperCase()}!`, COLORS.gold, false);
    }

    this.applyHp(defSide, r.defenderHpAfter);
  }

  private applyHp(side: UnitColor, hpAfter: number): void {
    const frac = Math.max(0, hpAfter) / this.maxHp[side];
    this.tweenHp(side, frac);
    const targetAlive = hpAfter <= 0 ? 0 : Math.max(1, Math.ceil(frac * ARMY_SIZE));
    const toKill = this.aliveCount[side] - targetAlive;
    if (toKill > 0) this.killUnits(side, toKill);
    this.aliveCount[side] = Math.max(0, targetAlive);
  }

  private killUnits(side: UnitColor, n: number): void {
    const alive = this.units[side].filter((u) => u.alive);
    for (let k = 0; k < n && k < alive.length; k++) {
      const u = alive[alive.length - 1 - k];
      this.fxAnim('cu_dust', u.sprite.x, u.sprite.y, 1.3);
      u.die();
    }
  }

  private tweenHp(side: UnitColor, frac: number): void {
    const o = { v: this.curHpFrac[side] };
    this.tweens.add({ targets: o, v: frac, duration: 320, onUpdate: () => this.setHp[side](o.v) });
    this.curHpFrac[side] = frac;
  }

  private pickActor(side: UnitColor): BattleUnit | null {
    const alive = this.units[side].filter((u) => u.alive);
    if (!alive.length) return null;
    const u = alive[this.actorIdx[side] % alive.length];
    this.actorIdx[side]++;
    return u;
  }

  private pickTarget(side: UnitColor): BattleUnit | null {
    const alive = this.units[side].filter((u) => u.alive);
    if (!alive.length) return null;
    const u = alive[this.targetIdx[side] % alive.length];
    this.targetIdx[side]++;
    return u;
  }

  private fireArrow(from: BattleUnit, target: BattleUnit | null, onHit: () => void): void {
    const key = from.color === 'blue' ? 'cu_arrow_blue' : 'cu_arrow_red';
    const sx = from.sprite.x;
    const sy = from.sprite.y - 44;
    const tx = target ? target.sprite.x : from.color === 'blue' ? this.cx + 150 : this.cx - 150;
    const ty = (target ? target.sprite.y : this.bandY) - 44;
    const arrow = this.add.image(sx, sy, key).setDepth(45).setDisplaySize(42, 42);
    arrow.setRotation(Math.atan2(ty - sy, tx - sx));
    this.tweens.add({
      targets: arrow,
      x: tx,
      y: ty,
      duration: 260,
      ease: 'Quad.easeIn',
      onComplete: () => {
        arrow.destroy();
        onHit();
      },
    });
  }

  private fxAnim(key: string, x: number, y: number, scale = 1): void {
    const s = this.add.sprite(x, y, key).setDepth(48).setScale(scale);
    s.play(key);
    s.once('animationcomplete', () => s.destroy());
  }

  private pushLog(line: string): void {
    this.logLines.push(line);
    if (this.logLines.length > 4) this.logLines.shift();
    this.logText.setText(this.logLines.join('\n'));
  }

  /* ---- Controles ---------------------------------------------- */
  private buildSkipControl(): void {
    this.skipBtn?.destroy();
    const c = this.add.container(0, 0);
    this.skipBtn = c;
    c.add(
      retroButton(this, this.cx, 1140, '⏩ SALTAR AL RESULTADO', {
        variant: 'grey',
        width: CONTENT_W,
        height: 64,
        fontSize: 14,
        onClick: () => this.skip(),
      })
    );
  }

  private skip(): void {
    if (this.finished) return;
    this.stepTimer?.remove();
    this.resolve();
  }

  /* ---- Resolución final --------------------------------------- */
  private resolve(): void {
    if (this.finished) return;
    this.finished = true;
    this.stepTimer?.remove();
    this.skipBtn?.destroy();

    const winnerSide: UnitColor = this.battle.winnerId === this.battle.generalA.id ? 'blue' : 'red';
    const loserSide: UnitColor = winnerSide === 'blue' ? 'red' : 'blue';

    // Estado final coherente con el resultado autoritativo.
    this.killUnits(loserSide, this.aliveCount[loserSide]);
    this.aliveCount[loserSide] = 0;
    this.setHp.red(this.curHpFrac.red);
    this.setHp.blue(this.curHpFrac.blue);
    this.tweenHp(loserSide, 0);

    void loadUserData();
    this.showResult(winnerSide === 'blue');
  }

  private showResult(attackerWon: boolean): void {
    const cx = this.cx;
    this.cameras.main.flash(250, attackerWon ? 40 : 80, attackerWon ? 80 : 20, 20);
    outcomeBanner(this, attackerWon ? '🏆 ¡VICTORIA!' : '💀 DERROTA', attackerWon ? COLORS.lime : COLORS.danger, !attackerWon);

    const panel = this.add.container(0, 0).setDepth(60);
    panel.add(retroPanel(this, cx, 1070, CONTENT_W, 200, attackerWon ? 0xd8f0d8 : COLORS.card));
    panel.add(
      titleText(this, cx, 1010, attackerWon ? '🏆 ¡VICTORIA!' : '💀 DERROTA', 18, attackerWon ? 0x2e6b2e : COLORS.danger)
    );
    panel.add(
      bodyText(
        this,
        cx,
        1058,
        this.note ?? `Recompensa: +${this.rewards.goldEarned} oro  ·  +${this.rewards.scoreEarned} pts`,
        13,
        COLORS.ink
      )
        .setWordWrapWidth(CONTENT_W - 60)
        .setAlign('center')
    );
    panel.add(
      retroButton(this, cx, 1130, this.returnScene === 'Home' ? 'IR AL INICIO' : 'VOLVER', {
        width: 380,
        height: 60,
        fontSize: 14,
        onClick: () => this.scene.start(this.returnScene),
      })
    );
  }
}
