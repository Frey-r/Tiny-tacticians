/* ============================================================
   Tiny Tacticians — horneado de texturas de UI (pack "slots").
   Los botones/barras del pack vienen como parches 3x3 (o 3x1)
   separados por huecos transparentes; aquí se recomponen en
   texturas contiguas listas para nine-slice, con post-proceso
   opcional (desaturar la variante neutral, aclarar los rellenos
   de barra para que admitan tinte). Corre una única vez en
   BootScene.create(), antes de arrancar Home.
   ============================================================ */
import Phaser from 'phaser';
import { UI_BAKES } from '../assets.ts';

export function bakeUiTextures(scene: Phaser.Scene): void {
  for (const spec of UI_BAKES) {
    if (scene.textures.exists(spec.outKey)) continue;
    const src = scene.textures.get(spec.rawKey).getSourceImage() as HTMLImageElement;
    const widths = spec.cols.map(([a, b]) => b - a + 1);
    const heights = spec.rows.map(([a, b]) => b - a + 1);
    const outW = widths.reduce((acc, v) => acc + v, 0);
    const outH = heights.reduce((acc, v) => acc + v, 0);
    const canvas = scene.textures.createCanvas(spec.outKey, outW, outH);
    if (!canvas) continue;
    const ctx = canvas.context;
    let dy = 0;
    spec.rows.forEach(([sy], ri) => {
      let dx = 0;
      spec.cols.forEach(([sx], ci) => {
        ctx.drawImage(src, sx, sy, widths[ci], heights[ri], dx, dy, widths[ci], heights[ri]);
        dx += widths[ci];
      });
      dy += heights[ri];
    });
    if (spec.desaturate || spec.brighten) {
      applyFilters(ctx, outW, outH, spec.desaturate ?? 0, spec.brighten ?? 1);
    }
    canvas.refresh();
    // La imagen fuente ya no hace falta: liberar la textura cruda.
    scene.textures.remove(spec.rawKey);
  }
}

/** Desatura (mezcla hacia la luminancia) y/o aclara el canvas in-place. */
function applyFilters(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  desaturate: number,
  brighten: number
): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (desaturate > 0) {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      r += (luma - r) * desaturate;
      g += (luma - g) * desaturate;
      b += (luma - b) * desaturate;
    }
    d[i] = Math.min(255, Math.round(r * brighten));
    d[i + 1] = Math.min(255, Math.round(g * brighten));
    d[i + 2] = Math.min(255, Math.round(b * brighten));
  }
  ctx.putImageData(img, 0, 0);
}
