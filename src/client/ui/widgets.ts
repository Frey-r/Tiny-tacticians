/* ============================================================
   Tiny Tacticians — Widgets retro reutilizables (Phaser)
   Botones, paneles, barras de título y textos con el look
   pixel-art biselado del mockup. Devuelven contenedores para
   poder posicionarlos/animarlos como una sola unidad.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, FONT, hex, PAD, TOUCH_H, TEXT_RES } from './theme.ts';
import { avatarKeyFor } from '../assets.ts';

type Scene = Phaser.Scene;

/** Color de tinte según la afinidad del consejero. */
export function affinityColor(aff: string): number {
  return aff === 'OFE' ? COLORS.affOFE : aff === 'DEF' ? COLORS.affDEF : COLORS.affMAN;
}

/** Retrato (avatar) en marco biselado. Origen centrado. */
export function portrait(
  scene: Scene,
  x: number,
  y: number,
  seed: string,
  size = 64,
  tint?: number
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const bg = scene.add.rectangle(0, 0, size, size, tint ?? COLORS.card2).setStrokeStyle(3, COLORS.border);
  const img = scene.add.image(0, 0, avatarKeyFor(seed)).setDisplaySize(size - 6, size - 6);
  container.add([bg, img]);
  container.setSize(size, size);
  return container;
}

/** Barra de HP (verde -> rojo bajo 30%). Origen izquierdo. */
export function hpBar(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  pct: number
): { container: Phaser.GameObjects.Container; set: (p: number) => void } {
  const h = 18;
  const container = scene.add.container(x, y);
  const back = scene.add.rectangle(0, 0, w, h, 0x3a2f22).setOrigin(0, 0.5).setStrokeStyle(2, COLORS.border);
  const fill = scene.add.rectangle(2, 0, Math.max(0, (w - 4) * pct), h - 6, 0x4caf50).setOrigin(0, 0.5);
  container.add([back, fill]);
  const set = (p: number) => {
    const c = Phaser.Math.Clamp(p, 0, 1);
    fill.width = Math.max(0, (w - 4) * c);
    fill.setFillStyle(c < 0.3 ? COLORS.danger : 0x4caf50);
  };
  return { container, set };
}

/** Overlay de carga a pantalla completa. Devuelve fn para ocultarlo. */
export function loadingOverlay(scene: Scene, label = 'PROCESANDO...'): () => void {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const c = scene.add.container(0, 0).setDepth(400);
  const bg = scene.add.rectangle(0, 0, w, h, 0x15110e, 0.9).setOrigin(0, 0).setInteractive();
  const txt = titleText(scene, w / 2, h / 2, label, 16, COLORS.lime);
  const spinner = scene.add.rectangle(w / 2, h / 2 - 60, 30, 30, COLORS.lime).setStrokeStyle(4, COLORS.panelDark);
  scene.tweens.add({ targets: spinner, angle: 360, duration: 900, repeat: -1 });
  c.add([bg, spinner, txt]);
  return () => c.destroy();
}

/** Toast efímero centrado-abajo. */
export function toast(scene: Scene, message: string, color: number = COLORS.cream): void {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const txt = titleText(scene, w / 2, h - 60, message, 14, color).setDepth(500);
  const bg = scene.add
    .rectangle(w / 2, h - 60, txt.width + 48, 48, COLORS.panelDark, 0.95)
    .setStrokeStyle(3, COLORS.border)
    .setDepth(499);
  scene.tweens.add({
    targets: [txt, bg],
    alpha: 0,
    delay: 1600,
    duration: 500,
    onComplete: () => {
      txt.destroy();
      bg.destroy();
    },
  });
}

/** Número/etiqueta que brota de un punto, sube y se desvanece (pop de ganancia). */
export function floatingGain(
  scene: Scene,
  x: number,
  y: number,
  text: string,
  color: number = COLORS.lime,
  size = 22
): void {
  const t = titleText(scene, x, y, text, size, color).setDepth(600);
  scene.tweens.add({
    targets: t,
    y: y - 80,
    alpha: 0,
    duration: 1100,
    ease: 'Quad.easeOut',
    onComplete: () => t.destroy(),
  });
}

/** Banner central que aparece con un golpe (crítico / fallo / evento). Opcional shake de cámara. */
export function outcomeBanner(scene: Scene, text: string, color: number, shake = false): void {
  const w = scene.scale.width;
  const h = scene.scale.height;
  const y = h * 0.42;
  const txt = titleText(scene, w / 2, y, text, 30, color).setDepth(620).setScale(0.4);
  const bg = scene.add
    .rectangle(w / 2, y, txt.width + 80, 72, COLORS.panelDark, 0.92)
    .setStrokeStyle(4, color)
    .setDepth(619)
    .setScale(0.4);
  scene.tweens.add({ targets: [txt, bg], scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut' });
  scene.tweens.add({
    targets: [txt, bg],
    alpha: 0,
    delay: 820,
    duration: 420,
    onComplete: () => {
      txt.destroy();
      bg.destroy();
    },
  });
  if (shake) scene.cameras.main.shake(220, 0.008);
}

/** Anima un Text numérico de `from` a `to` (count-up), evitando el cambio silencioso. */
export function countUp(scene: Scene, textObj: Phaser.GameObjects.Text, from: number, to: number): void {
  const o = { v: from };
  textObj.setText(String(Math.round(from)));
  scene.tweens.add({
    targets: o,
    v: to,
    duration: 500,
    ease: 'Cubic.easeOut',
    onUpdate: () => textObj.setText(String(Math.round(o.v))),
    onComplete: () => textObj.setText(String(Math.round(to))),
  });
}

export function titleText(
  scene: Scene,
  x: number,
  y: number,
  str: string,
  size = 18,
  color: number = COLORS.cream
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT.title,
      fontSize: `${size}px`,
      color: hex(color),
    })
    .setResolution(TEXT_RES)
    .setOrigin(0.5)
    .setShadow(2, 2, 'rgba(0,0,0,0.6)', 0, true, true);
}

export function bodyText(
  scene: Scene,
  x: number,
  y: number,
  str: string,
  size = 18,
  color: number = COLORS.ink
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT.body,
      fontSize: `${size}px`,
      color: hex(color),
      fontStyle: 'bold',
    })
    .setResolution(TEXT_RES)
    .setOrigin(0.5);
}

export interface ButtonOpts {
  width?: number;
  height?: number;
  variant?: 'lime' | 'grey' | 'maroon';
  fontSize?: number;
  onClick?: () => void;
  enabled?: boolean;
}

/** Botón biselado estilo CTA. Origen centrado en (x,y). */
export function retroButton(
  scene: Scene,
  x: number,
  y: number,
  label: string,
  opts: ButtonOpts = {}
): Phaser.GameObjects.Container {
  const fontSize = opts.fontSize ?? 16;
  const padX = 28;
  const measure = scene.add
    .text(0, 0, label, { fontFamily: FONT.title, fontSize: `${fontSize}px` })
    .setVisible(false);
  const w = opts.width ?? Math.max(140, Math.ceil(measure.width) + padX * 2);
  // Altura mínima táctil para móvil (los botones se tocan con el dedo).
  const h = opts.height ?? Math.max(TOUCH_H, fontSize * 2 + 26);
  measure.destroy();

  const enabled = opts.enabled !== false;
  const fill = !enabled
    ? 0x6c675c
    : opts.variant === 'grey'
      ? COLORS.card
      : opts.variant === 'maroon'
        ? COLORS.maroon
        : COLORS.lime;
  const topColor =
    opts.variant === 'grey' ? COLORS.cardHi : opts.variant === 'maroon' ? COLORS.maroonTop : COLORS.limeTop;
  const edgeColor =
    opts.variant === 'grey' ? COLORS.cardLo : opts.variant === 'maroon' ? COLORS.maroonEdge : COLORS.limeEdge;
  const textColor = opts.variant === 'lime' || opts.variant === 'grey' ? COLORS.ink : COLORS.cream;

  const container = scene.add.container(x, y);

  const shadow = scene.add.rectangle(4, 4, w, h, 0x000000, 0.45);
  const body = scene.add.rectangle(0, 0, w, h, fill).setStrokeStyle(3, COLORS.border);
  const topEdge = scene.add.rectangle(0, -h / 2 + 3, w - 6, 4, topColor);
  const bottomEdge = scene.add.rectangle(0, h / 2 - 4, w - 6, 5, edgeColor);
  const isLightText = !enabled || opts.variant === 'maroon';
  const shadowColor = isLightText ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 255, 255, 0.25)';
  const shadowOffset = isLightText ? 2 : 1;
  const text = titleText(scene, 0, 0, label, fontSize, enabled ? textColor : 0x46423a).setShadow(
    shadowOffset,
    shadowOffset,
    shadowColor,
    0,
    true,
    isLightText
  );

  const press = scene.add.container(0, 0, [body, topEdge, bottomEdge, text]);
  container.add([shadow, press]);
  container.setSize(w, h);

  if (enabled) {
    container.setInteractive(
      new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    if (container.input) container.input.cursor = 'pointer';
    container.on('pointerover', () => body.setFillStyle(opts.variant === 'lime' ? COLORS.limeHover : opts.variant === 'grey' ? COLORS.card2 : COLORS.maroonTop));
    container.on('pointerout', () => {
      body.setFillStyle(fill);
      press.setPosition(0, 0);
      shadow.setVisible(true);
    });
    container.on('pointerdown', () => {
      press.setPosition(3, 3);
      shadow.setVisible(false);
    });
    container.on('pointerup', () => {
      press.setPosition(0, 0);
      shadow.setVisible(true);
      opts.onClick?.();
    });
  } else {
    container.setAlpha(0.85);
  }

  return container;
}

/** Panel/carta gris biselada. Origen centrado en (x,y). */
export function retroPanel(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number = COLORS.card
): Phaser.GameObjects.Container {
  const container = scene.add.container(x, y);
  const shadow = scene.add.rectangle(4, 4, w, h, 0x000000, 0.35);
  const body = scene.add.rectangle(0, 0, w, h, fill).setStrokeStyle(3, COLORS.border);
  const hi = scene.add.rectangle(-w / 2 + 3, -h / 2 + 3, w - 6, 3, COLORS.cardHi).setOrigin(0, 0.5);
  const lo = scene.add.rectangle(-w / 2 + 3, h / 2 - 3, w - 6, 3, COLORS.cardLo).setOrigin(0, 0.5);
  container.add([shadow, body, hi, lo]);
  container.setSize(w, h);
  return container;
}

/** Cabecera de subpantalla: botón volver + título centrado. */
export function screenTopbar(
  scene: Scene,
  title: string,
  onBack: () => void
): Phaser.GameObjects.Container {
  const w = scene.scale.width;
  const container = scene.add.container(0, 0);
  const back = retroButton(scene, PAD + 78, 52, '< VOLVER', {
    variant: 'grey',
    fontSize: 13,
    width: 156,
    height: 56,
    onClick: onBack,
  });
  const titleTxt = titleText(scene, w / 2, 52, title.toUpperCase(), 17, COLORS.cream);
  container.add([back, titleTxt]);
  return container;
}

/** Pequeña píldora de recurso (icono + valor). Origen izquierdo. */
export function resourcePill(
  scene: Scene,
  x: number,
  y: number,
  iconKey: string,
  label: string,
  fill: number = COLORS.lime
): Phaser.GameObjects.Container {
  const padX = 14;
  const txt = bodyText(scene, 0, 0, label, 18, COLORS.ink).setOrigin(0, 0.5);
  const iconSize = 24;
  const w = padX * 2 + iconSize + 8 + txt.width;
  const h = 38;
  const container = scene.add.container(x, y);
  const body = scene.add.rectangle(0, 0, w, h, fill).setOrigin(0, 0.5).setStrokeStyle(3, COLORS.border);
  const icon = scene.add.image(padX + iconSize / 2, 0, iconKey).setDisplaySize(iconSize, iconSize);
  txt.setX(padX + iconSize + 8);
  container.add([body, icon, txt]);
  container.setSize(w, h);
  return container;
}

/** Barra de título granate (cabecera de pantalla). */
export function headerBar(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  label: string,
  fontSize = 16
): Phaser.GameObjects.Container {
  const h = fontSize * 2 + 12;
  const container = scene.add.container(x, y);
  const body = scene.add.rectangle(0, 0, w, h, COLORS.maroon).setStrokeStyle(3, COLORS.border);
  const top = scene.add.rectangle(0, -h / 2 + 3, w - 6, 3, COLORS.maroonTop);
  const bottom = scene.add.rectangle(0, h / 2 - 3, w - 6, 3, COLORS.maroonEdge);
  const text = titleText(scene, 0, 0, label.toUpperCase(), fontSize, COLORS.cream);
  container.add([body, top, bottom, text]);
  container.setSize(w, h);
  return container;
}
