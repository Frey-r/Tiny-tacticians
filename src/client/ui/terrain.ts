/* ============================================================
   terrain.ts — campo de césped decorado reutilizable.

   `grassField` arma un terreno vivo a partir del pack de Terrain:
   un césped tileado (TileSprite con el tile central del tileset,
   que repite sin costuras) más árboles, arbustos, rocas y una
   oveja repartidos de forma DETERMINISTA (semilla) para que el
   layout sea estable entre renders. Todo va dentro de un Container
   recortado por una máscara, así que ninguna decoración se sale
   del panel. Lo usan el LIVE FEED del campamento (RunPlayScene) y
   el campo de batalla (PvpCombatScene).
   ============================================================ */
import Phaser from 'phaser';
import { COLORS } from './theme.ts';
import { TERRAIN } from '../assets.ts';

export interface FieldOpts {
  /** Semilla del reparto (mismo valor => mismo layout). */
  seed?: number;
  trees?: number;
  bushes?: number;
  rocks?: number;
  /** Coloca una oveja idle en primer plano (campamento). */
  sheep?: boolean;
  /** Concentra arbustos/rocas en la banda superior y deja el centro
   *  libre para la acción (campo de batalla). */
  decoTopOnly?: boolean;
  /** Altura de los árboles en px (se recortan por arriba si exceden). */
  treeH?: number;
}

/** PRNG mulberry32: determinista a partir de la semilla. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Devuelve un Container con el césped + decoración listo para añadir a la
 * escena. Centrado en (cx, cy) con tamaño (w, h). El marco oscuro y el
 * borde replican el look de panel del resto del juego.
 */
export function grassField(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  opts: FieldOpts = {}
): Phaser.GameObjects.Container {
  const { trees = 3, bushes = 3, rocks = 2, sheep = false, decoTopOnly = false } = opts;
  const rand = rng(((opts.seed ?? 1) * 0x9e3779b1) | 0);
  const left = cx - w / 2;
  const top = cy - h / 2;
  const root = scene.add.container(0, 0);

  // Marco oscuro + base de césped (fallback sólido: nunca hay huecos).
  root.add(scene.add.rectangle(cx, cy, w, h, COLORS.panelDark).setStrokeStyle(3, COLORS.border));
  const innerW = w - 16;
  const innerH = h - 16;
  root.add(scene.add.rectangle(cx, cy, innerW, innerH, COLORS.grassDark).setStrokeStyle(2, 0x2c2319));

  // Césped tileado: tile central del tileset repetido sin costuras.
  root.add(
    scene.add.tileSprite(cx, cy, innerW - 4, innerH - 4, TERRAIN.tilesetKey, TERRAIN.grassCenterFrame).setAlpha(0.97)
  );

  // Contenedor de decoración recortado al campo (la máscara va invisible
  // dentro de root para que se destruya junto con el campo, sin fugas).
  const deco = scene.add.container(0, 0);
  const maskG = scene.add
    .graphics()
    .setVisible(false)
    .fillStyle(0xffffff)
    .fillRect(left + 8, top + 8, innerW - 8, innerH - 8);
  deco.setMask(maskG.createGeometryMask());
  root.add(deco);
  root.add(maskG);

  const sprites: Array<Phaser.GameObjects.Sprite | Phaser.GameObjects.Image> = [];

  // Árboles: banda superior (fondo). Se recortan por arriba => línea de bosque.
  // En modo batalla (`decoTopOnly`) van MÁS arriba y agrupados en el tercio
  // superior para que la línea de bosque quede detrás y por encima de los
  // carriles de tropas, sin invadirlos.
  const treeH = opts.treeH ?? Math.min(140, Math.round(h * 0.62));
  const treeW = Math.round(treeH * (192 / 256));
  for (let i = 0; i < trees; i++) {
    const x = left + 24 + rand() * (w - 48);
    const y = decoTopOnly ? top + h * (0.1 + rand() * 0.12) : top + h * (0.28 + rand() * 0.16);
    const t = scene.add.sprite(x, y, 'terrainTree').setOrigin(0.5, 1).setDisplaySize(treeW, treeH);
    t.play({ key: 'terrainTree', startFrame: Math.floor(rand() * 8) });
    if (rand() > 0.5) t.setFlipX(true);
    sprites.push(t);
  }

  // Banda de arbustos/rocas/oveja: arriba (batalla) o abajo (campamento).
  const bandY = (f: number): number =>
    decoTopOnly ? top + h * (0.12 + f * 0.18) : top + h * (0.6 + f * 0.34);

  const bushH = Math.round(Math.min(60, h * 0.24));
  for (let i = 0; i < bushes; i++) {
    const x = left + 20 + rand() * (w - 40);
    const b = scene.add.sprite(x, bandY(rand()), 'terrainBush').setOrigin(0.5, 1).setDisplaySize(bushH, bushH);
    b.play({ key: 'terrainBush', startFrame: Math.floor(rand() * 8) });
    if (rand() > 0.5) b.setFlipX(true);
    sprites.push(b);
  }

  const rockH = Math.round(Math.min(34, h * 0.14));
  for (let i = 0; i < rocks; i++) {
    const x = left + 16 + rand() * (w - 32);
    const key = `terrain_rock${1 + Math.floor(rand() * 4)}`;
    sprites.push(scene.add.image(x, bandY(rand()), key).setOrigin(0.5, 1).setDisplaySize(rockH, rockH));
  }

  if (sheep) {
    const x = left + w * (0.16 + rand() * 0.68);
    const s = scene.add
      .sprite(x, bandY(0.85), 'terrainSheep')
      .setOrigin(0.5, 1)
      .setDisplaySize(46, 46)
      .setFlipX(rand() > 0.5);
    s.play({ key: 'terrainSheep', startFrame: Math.floor(rand() * 6) });
    sprites.push(s);
  }

  // Orden por Y => profundidad coherente (lo de atrás se dibuja antes).
  sprites.sort((a, b) => a.y - b.y);
  sprites.forEach((s) => deco.add(s));

  return root;
}
