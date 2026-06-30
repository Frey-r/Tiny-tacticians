/* ============================================================
   Carga diferida de assets de BATALLA (solo PvpCombatScene).
   BootScene ya NO precarga las hojas de unidades `cu_*`, los FX de
   combate ni las flechas: son ~300 KB que ni el menú ni el campamento
   (RunPlayScene, que solo usa el terreno) necesitan. Se encolan en el
   loader de la escena de batalla la primera vez que se entra y quedan
   en caché para entradas posteriores (guards idempotentes por textura
   y por animación, que son globales en Phaser).
   ============================================================ */
import Phaser from 'phaser';
import { UNIT_SHEETS, FX_SHEETS, ARROW, type AnimSheet } from '../assets.ts';

const BATTLE_SHEETS: AnimSheet[] = [...UNIT_SHEETS, ...FX_SHEETS];

/**
 * Encola en el loader de la escena las texturas de batalla que aún no
 * estén en caché. Llamar desde `preload()`; Phaser corre el loader antes
 * de `create()`.
 * @returns `true` si encoló algo (primera entrada) — el llamador puede
 *          mostrar un indicador mientras el loader trabaja.
 */
export function queueBattleAssets(scene: Phaser.Scene): boolean {
  let queued = false;
  for (const s of BATTLE_SHEETS) {
    if (!scene.textures.exists(s.texKey)) {
      scene.load.spritesheet(s.texKey, s.url, { frameWidth: s.frameW, frameHeight: s.frameH });
      queued = true;
    }
  }
  if (!scene.textures.exists('cu_arrow_blue')) {
    scene.load.image('cu_arrow_blue', ARROW.blue);
    queued = true;
  }
  if (!scene.textures.exists('cu_arrow_red')) {
    scene.load.image('cu_arrow_red', ARROW.red);
    queued = true;
  }
  return queued;
}

/**
 * Crea las animaciones de batalla que falten (clave de anim == clave de
 * textura). Llamar al inicio de `create()`, antes de instanciar unidades.
 * Idempotente: las anims son globales, así que se omiten si ya existen.
 */
export function ensureBattleAnims(scene: Phaser.Scene): void {
  for (const s of BATTLE_SHEETS) {
    if (scene.anims.exists(s.texKey)) continue;
    scene.anims.create({
      key: s.texKey,
      frames: scene.anims.generateFrameNumbers(s.texKey, { start: 0, end: s.frames - 1 }),
      frameRate: s.frameRate,
      repeat: s.repeat,
    });
  }
}
