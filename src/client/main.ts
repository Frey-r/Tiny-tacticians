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
import { PvpScene } from './scenes/PvpScene.ts';
import { PvpCombatScene } from './scenes/PvpCombatScene.ts';
import { EventosScene } from './scenes/EventosScene.ts';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: hex(COLORS.bg),
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    // El lienzo lo centra el CSS (#game con flexbox) y Phaser mapea los clics
    // vía getBoundingClientRect, así que autoCenter DEBE ser NONE. Con
    // CENTER_BOTH (Phaser centra por márgenes) el mapeo de input se desfasa en
    // la webview de Devvit y los clics quedan arriba-izquierda del botón.
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
    PvpScene,
    PvpCombatScene,
    EventosScene,
  ],
};

async function start(): Promise<void> {
  // Esperar a las fuentes web (Press Start 2P / JetBrains Mono) para que
  // los textos pixel-art no se rendericen con una fuente de respaldo.
  try {
    await document.fonts.ready;
  } catch {
    /* document.fonts no disponible: continuar igualmente */
  }
  const game = new Phaser.Game(config);

  // El lienzo toma su posición FINAL después de crear el juego (el CSS lo centra
  // tras el layout/fuentes). Phaser NO detecta ese cambio del DOM, así que su
  // `canvasBounds` (que usa para mapear los clics) queda obsoleto y los clics
  // salen desfasados arriba-izquierda. La doc de Phaser indica llamar a
  // `scale.updateBounds()` para refrescar esos bounds tras cambios del DOM.
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
