/* ============================================================
   Tiny Tacticians — punto de entrada del cliente Phaser.
   El servidor mantiene la autoridad sobre el estado (ver AGENTS.md);
   este cliente solo renderiza y envía intenciones vía /api.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, hex, GAME_W, GAME_H } from './ui/theme.ts';
import { BootScene } from './scenes/BootScene.ts';
import { HomeScene } from './scenes/HomeScene.ts';
import { CollectionScene } from './scenes/CollectionScene.ts';
import { RunSetupScene } from './scenes/RunSetupScene.ts';
import { RunPlayScene } from './scenes/RunPlayScene.ts';
import { ReclutamientoScene } from './scenes/ReclutamientoScene.ts';
import { PvpScene } from './scenes/PvpScene.ts';
import { PvpCombatScene } from './scenes/PvpCombatScene.ts';
import { EventosScene } from './scenes/EventosScene.ts';
import { IntroScene } from './scenes/IntroScene.ts';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: hex(COLORS.bg),
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    // El CSS (#game con flexbox) centra el lienzo y autoCenter queda en NONE
    // para no duplicar el centrado por márgenes. El render y el hit-testing de
    // Phaser comparten esta misma transformación de cámara/escala, así que el
    // modo de escala NO puede desfasar un botón respecto de su zona clickeable
    // (ambos se mueven juntos). El desfase histórico arriba-izquierda venía del
    // origen del hit-area de los Container, ya corregido en widgets/scenes.
    autoCenter: Phaser.Scale.NONE,
    width: GAME_W,
    height: GAME_H,
  },
  scene: [
    BootScene,
    HomeScene,
    CollectionScene,
    RunSetupScene,
    RunPlayScene,
    ReclutamientoScene,
    PvpScene,
    PvpCombatScene,
    EventosScene,
    IntroScene,
  ],
};

async function start(): Promise<void> {
  // Esperar a las fuentes web (Oswald / JetBrains Mono) para que los textos
  // no se rendericen primero con una fuente de respaldo (FOUT).
  try {
    await document.fonts.ready;
  } catch {
    /* document.fonts no disponible: continuar igualmente */
  }
  const game = new Phaser.Game(config);
  // Solo en dev: expone el juego para scripts de verificación (CDP/headless).
  if (import.meta.env.DEV) (window as unknown as { __game?: Phaser.Game }).__game = game;

  // El lienzo toma su posición FINAL después de crear el juego (el CSS lo centra
  // tras el layout/fuentes). Refrescamos los bounds para que `canvasBounds`
  // (origen que Phaser usa para mapear el puntero a coords del lienzo) quede al
  // día y el puntero caiga donde se ve. Esto corrige una traslación global del
  // input, distinto del bug de origen del hit-area que se arregló en widgets.
  const refresh = (): void => {
    game.scale.refresh();
    game.scale.updateBounds();
  };
  window.addEventListener('resize', refresh);
  window.addEventListener('orientationchange', refresh);
  if (typeof ResizeObserver !== 'undefined') {
    const parent = document.getElementById('game');
    if (parent) new ResizeObserver(refresh).observe(parent);
  }
  requestAnimationFrame(refresh);
  setTimeout(refresh, 250);
  setTimeout(refresh, 1200);
}

void start();
