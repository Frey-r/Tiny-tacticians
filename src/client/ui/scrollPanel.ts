/* ============================================================
   scrollPanel.ts — modal reutilizable con contenido scrollable.

   Scrim a pantalla completa + panel titulado + lista de párrafos
   dentro de un viewport enmascarado que se arrastra (touch) o rueda
   (desktop). Lo usa PvpCombatScene para mostrar el registro COMPLETO
   de la batalla al terminar.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS } from './theme.ts';
import { retroPanel, retroButton, titleText, bodyText } from './widgets.ts';

type Scene = Phaser.Scene;

export interface ScrollPanelOpts {
  width?: number;
  height?: number;
  fontSize?: number;
  lineColor?: number;
  closeLabel?: string;
}

/** Abre el modal scrollable. Devuelve una fn para cerrarlo programáticamente. */
export function openScrollPanel(
  scene: Scene,
  title: string,
  paragraphs: string[],
  opts: ScrollPanelOpts = {}
): () => void {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const panelW = opts.width ?? W - 60;
  const panelH = opts.height ?? H - 220;
  const cx = W / 2;
  const cy = H / 2;

  const layer = scene.add.container(0, 0).setDepth(800);
  const scrim = scene.add.rectangle(0, 0, W, H, 0x0a0806, 0.78).setOrigin(0, 0).setInteractive();
  const panel = retroPanel(scene, cx, cy, panelW, panelH, COLORS.screen);
  const titleTxt = titleText(scene, cx, cy - panelH / 2 + 30, title, 16, COLORS.cream);

  // Viewport scrollable (entre cabecera y pie).
  const headH = 64;
  const footH = 88;
  const viewX = cx - panelW / 2 + 24;
  const viewTop = cy - panelH / 2 + headH;
  const viewW = panelW - 48;
  const viewH = panelH - headH - footH;

  // Contenido apilado.
  const content = scene.add.container(viewX, viewTop);
  const fontSize = opts.fontSize ?? 13;
  const lineColor = opts.lineColor ?? COLORS.cream;
  let yCursor = 0;
  for (const p of paragraphs) {
    const t = bodyText(scene, 0, yCursor, p, fontSize, lineColor)
      .setOrigin(0, 0)
      .setWordWrapWidth(viewW)
      .setLineSpacing(4);
    content.add(t);
    yCursor += t.height + 16;
  }
  const contentH = yCursor;

  // Máscara geométrica = rectángulo del viewport.
  const maskShape = scene.make.graphics({}).fillStyle(0xffffff, 1).fillRect(viewX, viewTop, viewW, viewH);
  content.setMask(maskShape.createGeometryMask());

  // Scroll por arrastre / rueda, acotado al alto del contenido.
  const minY = viewTop - Math.max(0, contentH - viewH);
  const maxY = viewTop;
  const clampY = (y: number) => Phaser.Math.Clamp(y, minY, maxY);
  let dragging = false;
  let lastPy = 0;

  const onDown = (p: Phaser.Input.Pointer) => {
    if (p.y >= viewTop && p.y <= viewTop + viewH) {
      dragging = true;
      lastPy = p.y;
    }
  };
  const onMove = (p: Phaser.Input.Pointer) => {
    if (!dragging) return;
    content.y = clampY(content.y + (p.y - lastPy));
    lastPy = p.y;
  };
  const onUp = () => {
    dragging = false;
  };
  const onWheel = (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
    content.y = clampY(content.y - dy * 0.5);
  };

  scrim.on('pointerdown', onDown);
  scene.input.on('pointermove', onMove);
  scene.input.on('pointerup', onUp);
  scene.input.on('wheel', onWheel);

  const close = (): void => {
    scene.input.off('pointermove', onMove);
    scene.input.off('pointerup', onUp);
    scene.input.off('wheel', onWheel);
    layer.destroy();
    maskShape.destroy();
  };

  const closeBtn = retroButton(scene, cx, cy + panelH / 2 - 42, opts.closeLabel ?? 'CLOSE', {
    variant: 'maroon',
    width: 260,
    height: 58,
    fontSize: 14,
    onClick: close,
  });

  layer.add([scrim, panel, content, titleTxt, closeBtn]);
  return close;
}
