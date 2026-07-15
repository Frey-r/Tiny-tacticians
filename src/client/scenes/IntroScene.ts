/* ============================================================
   IntroScene — cinemática de la PRIMERA RUN (una sola vez).

   Enmarca la primera experiencia: un diálogo con caras grandes
   (comandante enemigo → el comandante que entrenas), una batalla
   final DRAMATIZADA y LENTA con un equipo sin nivelar que termina
   en DERROTA (reusa PvpCombatScene), y la entrada del panda maestro
   que arranca el tutorial. Al final lanza una run REAL en modo
   tutorial (RunPlayScene) que el jugador completa y acuña.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W, GAME_H, PAD } from '../ui/theme.ts';
import { retroButton, loadingOverlay, toast } from '../ui/widgets.ts';
import { runDialogSequence } from '../ui/dialog.ts';
import type { DialogLine } from '../ui/dialog.ts';
import { grassField } from '../ui/terrain.ts';
import { CUTSCENE, PANDA_SHEETS } from '../assets.ts';
import { buildScriptedDefeat } from '../combat/scriptedBattle.ts';
import { store, loadUserData } from '../state.ts';
import { api } from '../api.ts';
import { randomGeneralName } from '../util.ts';
import { LOADOUT_SIZE } from '../../shared/sim/index.ts';
import type { Consejero } from '../../shared/types/index.ts';

/** Semilla fija del retrato del comandante que entrenas (avatar estable). */
const COMMANDER_SEED = 'tut_commander';
const GROUND_Y = 760;

export class IntroScene extends Phaser.Scene {
  private starting = false;

  constructor() {
    super('Intro');
  }

  preload(): void {
    if (!this.textures.exists(CUTSCENE.enemyBossKey)) {
      this.load.image(CUTSCENE.enemyBossKey, CUTSCENE.enemyBossFace);
    }
    for (const s of PANDA_SHEETS) {
      if (!this.textures.exists(s.texKey)) {
        this.load.spritesheet(s.texKey, s.url, { frameWidth: s.frameW, frameHeight: s.frameH });
      }
    }
  }

  create(): void {
    for (const s of PANDA_SHEETS) {
      if (!this.anims.exists(s.texKey)) {
        this.anims.create({
          key: s.texKey,
          frames: this.anims.generateFrameNumbers(s.texKey, { start: 0, end: s.frames - 1 }),
          frameRate: s.frameRate,
          repeat: s.repeat,
        });
      }
    }

    this.buildBackdrop();

    // Saltar toda la cinemática y arrancar directo la run tutorial.
    retroButton(this, GAME_W - PAD - 70, 56, 'SALTAR', {
      variant: 'grey',
      width: 150,
      height: 56,
      fontSize: 13,
      onClick: () => this.startTutorialRun(),
    }).setDepth(900);

    this.playIntroDialog();
  }

  /** Cielo + campo + tropas de figuración (todo detrás de los diálogos). */
  private buildBackdrop(): void {
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x24344f, 0x24344f, 0x8a6f6a, 0x8a6f6a, 1);
    sky.fillRect(0, 0, GAME_W, GROUND_Y);

    grassField(this, GAME_W / 2, GROUND_Y + 120, GAME_W, 460, {
      seed: 7,
      trees: 5,
      bushes: 4,
      rocks: 3,
      decoTopOnly: true,
    });

    // Figuración: tus tropas a la izquierda, el enemigo a la derecha.
    this.add.sprite(GAME_W / 2 - 250, GROUND_Y, 'warriorBlue').setOrigin(0.5, 1).setScale(0.8).play('warriorBlue_idle');
    this.add.sprite(GAME_W / 2 - 150, GROUND_Y + 8, 'warriorBlue').setOrigin(0.5, 1).setScale(0.7).play('warriorBlue_idle');
    this.add
      .sprite(GAME_W / 2 + 250, GROUND_Y, 'warriorRed')
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setFlipX(true)
      .play('warriorRed_idle');

    // Velo inferior para asentar los diálogos.
    const scrim = this.add.graphics();
    scrim.fillGradientStyle(0x15110e, 0x15110e, 0x15110e, 0x15110e, 0, 0, 0.5, 0.5);
    scrim.fillRect(0, GAME_H - 460, GAME_W, 460);
  }

  /* ---- A. Diálogo previo a la batalla -------------------------- */
  private playIntroDialog(): void {
    const lines: DialogLine[] = [
      {
        name: 'Señor de la Guerra',
        text: '¡No pueden detenernos! ¡Su ejército caerá como todos los demás!',
        textureKey: CUTSCENE.enemyBossKey,
        side: 'right',
        tint: COLORS.danger,
      },
      {
        name: 'Tu Comandante',
        text: '...',
        portraitSeed: COMMANDER_SEED,
        side: 'left',
        tint: COLORS.affDEF,
      },
    ];
    runDialogSequence(this, lines, { big: true }, () => this.launchBattle());
  }

  /* ---- B. Batalla scriptada (lenta) → DERROTA ------------------ */
  private launchBattle(): void {
    this.scene.launch('PvpCombat', {
      battleResult: buildScriptedDefeat(),
      rewards: { goldEarned: 0, scoreEarned: 0 },
      title: 'BATALLA FINAL',
      note: 'Tu ejército, sin entrenamiento, no resiste al Señor de la Guerra. ¡Necesitas prepararte mejor!',
      stepMs: 1600,
      onDone: () => {
        this.scene.stop('PvpCombat');
        this.cameras.main.setVisible(true);
        this.scene.resume();
        this.playPandaEntrance();
      },
    });
    // La escena de combate se dibuja ENCIMA; ocultamos la cámara de la intro
    // mientras dura (IntroScene se registra después de PvpCombat, así que su
    // campo/tropas se superponían al combate). `bringToTop` refuerza el orden.
    this.scene.bringToTop('PvpCombat');
    this.cameras.main.setVisible(false);
    this.scene.pause();
  }

  /* ---- C. El panda entra caminando desde el lado enemigo ------- */
  private playPandaEntrance(): void {
    const cx = GAME_W / 2;
    const panda = this.add
      .sprite(GAME_W + 160, GROUND_Y, 'panda_idle')
      .setOrigin(0.5, 1)
      .setDisplaySize(170, 170)
      .setFlipX(true) // camina hacia la izquierda
      .setDepth(50);
    panda.play('panda_run');

    this.tweens.add({
      targets: panda,
      x: cx + 130,
      duration: 2000,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        panda.play('panda_idle'); // sigue mirando a la izquierda, hacia tu comandante
        this.playPandaDialog();
      },
    });
  }

  private playPandaDialog(): void {
    const lines: DialogLine[] = [
      {
        name: 'Maestro Panda',
        text: 'Fue una buena batalla... pero necesitas entrenar mejor a tu ejército. Ven, te enseñaré.',
        textureKey: 'panda_idle',
        frame: 0,
        side: 'left',
        tint: COLORS.lime,
      },
      {
        name: 'Tu Comandante',
        text: '...',
        portraitSeed: COMMANDER_SEED,
        side: 'right',
        tint: COLORS.affDEF,
      },
    ];
    runDialogSequence(this, lines, { big: true }, () => this.startTutorialRun());
  }

  /* ---- D. Arranca la run REAL en modo tutorial ----------------- */
  private async startTutorialRun(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    const hide = loadingOverlay(this, 'PREPARANDO ENTRENAMIENTO...');
    try {
      await loadUserData();
      const deckSnapshot: Consejero[] = store.advisors.slice(0, LOADOUT_SIZE);
      if (deckSnapshot.length < LOADOUT_SIZE) {
        // Sin consejeros suficientes (caso raro): no forzamos el tutorial.
        hide();
        this.scene.start('Home');
        return;
      }
      const result = await api.post<{ runId: string; seed: string; deckSnapshot?: Consejero[] }>(
        '/api/run/start',
        { deckSnapshot }
      );
      hide();
      this.scene.start('RunPlay', {
        runId: result.runId,
        seed: result.seed,
        name: randomGeneralName(),
        advisors: result.deckSnapshot ?? deckSnapshot,
        tutorial: true,
      });
    } catch (err: any) {
      hide();
      toast(this, err?.message || 'No se pudo iniciar el tutorial', COLORS.danger);
      this.starting = false;
      this.time.delayedCall(1600, () => this.scene.start('Home'));
    }
  }
}
