/* ============================================================
   HomeScene — campo de entrenamiento (estado idle).
   Réplica en Phaser del Home de React: barra de estado,
   campo pixel-art animado y navegación inferior (JUGAR / etc).
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, hex, GAME_W, GAME_H, PAD, CONTENT_W } from '../ui/theme.ts';
import { retroButton, resourcePill, titleText, retroPanel, loadingOverlay, toast } from '../ui/widgets.ts';
import { TERRAIN } from '../assets.ts';
import { store, loadUserData } from '../state.ts';
import { api, getDevUserId } from '../api.ts';

export class HomeScene extends Phaser.Scene {
  private statusBar?: Phaser.GameObjects.Container;
  private jugarModal?: Phaser.GameObjects.Container;

  constructor() {
    super('Home');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.screen);
    this.buildBackground();
    this.buildNav();
    this.buildStatusBar();
    this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      await loadUserData();
    } catch {
      /* perfil aún no disponible: se muestran valores por defecto */
    }
    this.buildStatusBar();
  }

  private buildStatusBar(): void {
    this.statusBar?.destroy();
    const bar = this.add.container(0, 0);
    const gold = store.profile ? store.profile.gold : 120;
    const advisors = store.advisors.length;

    bar.add(resourcePill(this, PAD, 52, 'icon_gold', `${gold} oro`, COLORS.lime));
    bar.add(resourcePill(this, PAD, 104, 'icon_shield', `${advisors} consejeros`, COLORS.card));

    bar.add(
      this.add
        .text(GAME_W - PAD, 110, getDevUserId(), {
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '12px',
          color: hex(0x6b6258),
        })
        .setOrigin(1, 0.5)
    );
    const musicBtn = retroButton(this, GAME_W - PAD - 30, 56, '', {
      variant: 'grey',
      iconKey: 'icon_music',
      iconSize: 28,
      width: 60,
      height: 56,
      onClick: () => {
        this.sound.mute = !this.sound.mute;
        localStorage.setItem('game_muted', this.sound.mute ? 'true' : 'false');
        updateMusicBtn();
      }
    });

    const updateMusicBtn = () => {
      const iconImg = musicBtn.getData('icon') as Phaser.GameObjects.Image | undefined;
      if (iconImg) {
        const isMuted = this.sound.mute;
        iconImg.setAlpha(isMuted ? 0.4 : 1.0);
        iconImg.setTint(isMuted ? 0x888888 : 0xffffff);
      }
    };

    updateMusicBtn();
    bar.add(musicBtn);
    this.statusBar = bar;
  }

  /** Fondo a pantalla completa: cielo, césped tileado (tileset del pack),
   *  skyline del pueblo y caballeros entrenando. Los botones se dibujan
   *  encima (ver buildNav). */
  private buildBackground(): void {
    const cx = GAME_W / 2;
    const grassTop = 600; // horizonte: arriba el cielo, abajo el césped
    const groundY = 724; // línea donde se asientan los edificios

    // Cielo: degradado de atardecer (azul arriba -> cálido en el horizonte).
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x24344f, 0x24344f, 0x8a6f6a, 0x8a6f6a, 1);
    sky.fillRect(0, 0, GAME_W, grassTop + 48);

    // Césped tileado a pantalla completa: tile central del tileset, repite sin
    // costuras de extremo a extremo del lienzo.
    this.add
      .tileSprite(cx, grassTop, GAME_W, GAME_H - grassTop, TERRAIN.tilesetKey, TERRAIN.grassCenterFrame)
      .setOrigin(0.5, 0);
    // Franja de tierra sutil en la línea del horizonte (asienta los edificios).
    this.add.rectangle(0, groundY, GAME_W, 10, COLORS.dirt, 0.45).setOrigin(0, 0);

    // Nubes a la deriva por el cielo (recorridas de lado a lado del lienzo).
    const cloud1 = this.add.image(170, 150, 'cloud1').setScale(0.7).setAlpha(0.85);
    const cloud2 = this.add.image(580, 250, 'cloud2').setScale(0.55).setAlpha(0.7);
    this.driftCloud(cloud1, -140, GAME_W + 140, 30000);
    this.driftCloud(cloud2, -140, GAME_W + 140, 40000);

    // Skyline del pueblo con los edificios del pack: [clave, x, altura px].
    const skyline: Array<[string, number, number]> = [
      ['house1', 70, 104],
      ['monastery', 188, 150],
      ['castle', 348, 204],
      ['tower', 486, 174],
      ['house2', 582, 116],
      ['barracks', 700, 150],
      ['house3', 818, 116],
      ['archery', 906, 128],
    ];
    for (const [key, x, h] of skyline) this.placeBuilding(key, x, groundY, h);

    // Árboles (sprite animado del terreno) intercalados en el horizonte.
    for (const x of [30, 270, 640, 880]) this.placeTree(x, groundY + 14, 132);

    // Arbustos animados en primer plano.
    for (const x of [320, 540, 760]) {
      const b = this.add.sprite(x, groundY + 96, 'terrainBush').setOrigin(0.5, 1).setDisplaySize(58, 58);
      b.play({ key: 'terrainBush', startFrame: Math.floor(Math.random() * 8) });
      if (Math.random() > 0.5) b.setFlipX(true);
    }


    // Caballeros entrenando (sprites animados reales) en primer plano.
    this.add
      .sprite(cx - 165, groundY + 92, 'warriorBlue')
      .setOrigin(0.5, 1)
      .setScale(0.72)
      .play('warriorBlue_idle');
    this.add
      .sprite(cx + 165, groundY + 92, 'warriorRed')
      .setOrigin(0.5, 1)
      .setScale(0.72)
      .setFlipX(true)
      .play('warriorRed_idle');

    // Velo oscuro inferior: asienta el bloque de botones sobre la escena sin
    // tapar la acción (de transparente a oscuro hacia abajo).
    const scrim = this.add.graphics();
    scrim.fillGradientStyle(0x15110e, 0x15110e, 0x15110e, 0x15110e, 0, 0, 0.62, 0.62);
    scrim.fillRect(0, GAME_H - 400, GAME_W, 400);
  }

  private placeBuilding(key: string, x: number, baseY: number, targetH: number): void {
    const img = this.add.image(x, baseY, key).setOrigin(0.5, 1);
    img.setScale(targetH / img.height);
  }

  private placeTree(x: number, baseY: number, h: number): void {
    const w = h * (192 / 256);
    const t = this.add.sprite(x, baseY, 'terrainTree').setOrigin(0.5, 1).setDisplaySize(w, h);
    t.play({ key: 'terrainTree', startFrame: Math.floor(Math.random() * 8) });
    if (Math.random() > 0.5) t.setFlipX(true);
  }

  private driftCloud(img: Phaser.GameObjects.Image, from: number, to: number, duration: number): void {
    img.x = from + Math.random() * (to - from);
    this.tweens.add({
      targets: img,
      x: to,
      duration: duration * ((to - img.x) / (to - from)),
      onComplete: () => {
        img.x = from;
        this.tweens.add({ targets: img, x: to, duration, repeat: -1 });
      },
    });
  }

  private buildNav(): void {
    const cx = GAME_W / 2;
    // Navegación apilada full-width (objetivos táctiles grandes).
    retroButton(this, cx, 1012, 'JUGAR', {
      width: CONTENT_W,
      height: 104,
      fontSize: 28,
      onClick: () => this.toggleJugarModal(true),
    });
    retroButton(this, cx, 1122, 'COLECCIÓN', {
      variant: 'grey',
      width: CONTENT_W,
      height: 80,
      fontSize: 18,
      onClick: () => this.scene.start('Collection'),
    });
    retroButton(this, cx, 1210, 'EVENTOS', {
      variant: 'grey',
      width: CONTENT_W,
      height: 80,
      fontSize: 18,
      onClick: () => this.scene.start('Eventos'),
    });
  }

  private toggleJugarModal(open: boolean): void {
    if (!open) {
      this.jugarModal?.destroy();
      this.jugarModal = undefined;
      return;
    }
    if (this.jugarModal) return;

    const isMod = store.profile?.isModerator === true;

    const modal = this.add.container(0, 0).setDepth(100);
    const backdrop = this.add
      .rectangle(0, 0, GAME_W, GAME_H, 0x0a0806, 0.72)
      .setOrigin(0, 0)
      .setInteractive();
    const cx = GAME_W / 2;
    const cy = GAME_H / 2;
    
    const panelHeight = isMod ? 540 : 440;
    const panel = retroPanel(this, cx, cy, 620, panelHeight, COLORS.panelDark);
    
    const titleY = isMod ? cy - 210 : cy - 160;
    const title = titleText(this, cx, titleY, '¿Qué quieres hacer?', 18, COLORS.cream);
    
    const runY = isMod ? cy - 110 : cy - 60;
    const run = retroButton(this, cx, runY, 'CORRER RUN', {
      variant: 'grey',
      width: 540,
      height: 76,
      fontSize: 16,
      onClick: () => {
        this.toggleJugarModal(false);
        this.scene.start('RunSetup');
      },
    });
    
    const pvpY = isMod ? cy - 10 : cy + 40;
    const pvp = retroButton(this, cx, pvpY, 'PVP / ARENA', {
      variant: 'grey',
      width: 540,
      height: 76,
      fontSize: 16,
      onClick: () => {
        this.toggleJugarModal(false);
        this.scene.start('Pvp');
      },
    });

    const elements: Phaser.GameObjects.GameObject[] = [backdrop, panel, title, run, pvp];

    if (isMod) {
      const resetTutorial = retroButton(this, cx, cy + 90, 'FORZAR TUTORIAL', {
        variant: 'grey',
        width: 540,
        height: 76,
        fontSize: 16,
        onClick: async () => {
          this.toggleJugarModal(false);
          const hide = loadingOverlay(this, 'REINICIANDO...');
          try {
            await api.post('/api/profile/reset-onboarding');
            await loadUserData();
            hide();
            this.scene.start('Intro');
          } catch (err: any) {
            hide();
            toast(this, err.message || 'Error al reiniciar', COLORS.danger);
          }
        },
      });
      elements.push(resetTutorial);
    }
    
    const closeY = isMod ? cy + 200 : cy + 150;
    const close = retroButton(this, cx, closeY, 'CERRAR', {
      variant: 'maroon',
      width: 320,
      height: 60,
      fontSize: 13,
      onClick: () => this.toggleJugarModal(false),
    });
    elements.push(close);

    modal.add(elements);
    this.jugarModal = modal;
  }
}
