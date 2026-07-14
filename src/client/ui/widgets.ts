/* ============================================================
   Tiny Tacticians — Widgets retro reutilizables (Phaser)
   Botones, paneles, barras de título y textos con el look
   pixel-art biselado del mockup. Devuelven contenedores para
   poder posicionarlos/animarlos como una sola unidad.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, FONT, hex, PAD, TOUCH_H, TEXT_RES, fontPx } from './theme.ts';
import { avatarKeyFor, BTN_SKIN, BTN_TEX_SCALE, BAR_SKIN } from '../assets.ts';
import type { ButtonSkin } from '../assets.ts';

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

/** Barra de HP texturizada (pack Bars: marco con remate dorado + tira de
 *  relleno tintable). Verde -> rojo bajo 30%. Origen izquierdo. */
export function hpBar(
  scene: Scene,
  x: number,
  y: number,
  w: number,
  pct: number
): { container: Phaser.GameObjects.Container; set: (p: number) => void } {
  const h = BAR_SKIN.nativeH; // alto nativo de la textura: sin distorsión
  const container = scene.add.container(x, y);
  const base = scene.add
    .nineslice(0, 0, BAR_SKIN.base.key, undefined, w, h, BAR_SKIN.base.l, BAR_SKIN.base.r)
    .setOrigin(0, 0.5);
  const innerW = w - BAR_SKIN.innerInset * 2;
  const innerH = BAR_SKIN.innerBottom - BAR_SKIN.innerTop;
  // Centro del surco interior respecto del centro vertical de la barra.
  const innerY = BAR_SKIN.innerTop + innerH / 2 - h / 2;
  const fill = scene.add.image(BAR_SKIN.innerInset, innerY, BAR_SKIN.fill).setOrigin(0, 0.5);
  container.add([base, fill]);
  const set = (p: number) => {
    const c = Phaser.Math.Clamp(p, 0, 1);
    fill.setVisible(c > 0.005);
    fill.setDisplaySize(Math.max(1, innerW * c), innerH);
    fill.setTint(c < 0.3 ? COLORS.danger : 0x4caf50);
  };
  set(pct);
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
  const px = fontPx(size);
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT.title,
      // Oswald trae pesos reales: usamos 700 en vez del faux-bold por trazo del
      // mismo color, que con el reescalado FIT producía el "doble contorno".
      fontStyle: '700',
      fontSize: `${px}px`,
      color: hex(color),
    })
    .setResolution(TEXT_RES)
    .setOrigin(0.5)
    // Una sola sombra de apoyo (relleno, sin trazo) para separar el título de
    // fondos cargados (campo de batalla) sin fantasma. offsetX=0 evita la
    // sensación de glifo duplicado a lo ancho.
    .setShadow(0, 2, 'rgba(0,0,0,0.5)', 3, false, true);
}

export function bodyText(
  scene: Scene,
  x: number,
  y: number,
  str: string,
  size = 18,
  color: number = COLORS.ink
): Phaser.GameObjects.Text {
  const px = fontPx(size);
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT.body,
      fontSize: `${px}px`,
      color: hex(color),
      fontStyle: 'bold',
      // Engrosado extra: JetBrains Mono bold (700) sigue siendo fino al
      // reducirse el lienzo; el trazo lo lleva a un peso ~800 percibido.
      stroke: hex(color),
      strokeThickness: Math.max(1, Math.round(px * 0.06)),
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
  iconKey?: string;
  iconSize?: number;
}

/** Nine-slice de botón al tamaño de diseño (las texturas van a ~2x y se
 *  renderizan a mitad de escala para que las esquinas no devoren el botón). */
function buttonSlice(scene: Scene, skin: ButtonSkin, w: number, h: number): Phaser.GameObjects.NineSlice {
  const s = BTN_TEX_SCALE;
  return scene.add
    .nineslice(0, 0, skin.key, undefined, w / s, h / s, skin.l, skin.r, skin.t, skin.b)
    .setScale(s);
}

/** Botón texturizado del pack UI (teal = acción, rojo = peligro, piedra =
 *  neutral) con arte real de estado pulsado. Origen centrado en (x,y). */
export function retroButton(
  scene: Scene,
  x: number,
  y: number,
  label: string,
  opts: ButtonOpts = {}
): Phaser.GameObjects.Container {
  const fontSize = opts.fontSize ?? 16;
  // Geometría a partir del tamaño YA escalado (titleText vuelve a aplicar
  // fontPx al renderizar la etiqueta, así medida y render coinciden).
  const px = fontPx(fontSize);
  const padX = 28;

  const hasIcon = !!opts.iconKey;
  const iconSize = opts.iconSize ?? 32;

  let w = opts.width;
  if (!w) {
    if (hasIcon) {
      w = iconSize + 32;
    } else {
      const measure = scene.add
        .text(0, 0, label, { fontFamily: FONT.title, fontStyle: '700', fontSize: `${px}px` })
        .setVisible(false);
      w = Math.max(140, Math.ceil(measure.width) + padX * 2);
      measure.destroy();
    }
  }
  // Altura mínima táctil para móvil (los botones se tocan con el dedo).
  const h = opts.height ?? Math.max(TOUCH_H, px * 2 + 26);

  const enabled = opts.enabled !== false;
  const skin =
    opts.variant === 'maroon' ? BTN_SKIN.danger : opts.variant === 'grey' ? BTN_SKIN.neutral : BTN_SKIN.primary;

  const container = scene.add.container(x, y);

  // Sombra con la silueta real del botón (misma textura tintada a negro:
  // en Phaser 4 el modo FILL sustituye el color respetando el alpha).
  const shadow = buttonSlice(scene, skin.regular, w, h)
    .setPosition(3, 5)
    .setTint(0x000000)
    .setTintMode(Phaser.TintModes.FILL)
    .setAlpha(0.3);
  const bodyReg = buttonSlice(scene, skin.regular, w, h);
  const bodyPre = buttonSlice(scene, skin.pressed, w, h).setVisible(false);

  const press = scene.add.container(0, 0, [bodyReg, bodyPre]);

  if (hasIcon) {
    const iconImg = scene.add.image(0, 0, opts.iconKey!).setDisplaySize(iconSize, iconSize);
    if (!enabled) iconImg.setTint(0x8a8a8a).setAlpha(0.8);
    press.add(iconImg);
    // Referencia estable para quien necesite retocar el icono (p.ej. mute).
    container.setData('icon', iconImg);
  } else {
    const text = titleText(scene, 0, 0, label, fontSize, enabled ? COLORS.cream : 0xb8b0a0).setShadow(
      0,
      2,
      'rgba(0,0,0,0.55)',
      2,
      true,
      true
    );
    press.add(text);
  }

  container.add([shadow, press]);
  container.setSize(w, h);

  if (enabled) {
    // El hit-area de un Container va en coords TOP-LEFT: Phaser suma
    // displayOrigin (w/2, h/2) al punto local antes de probar Contains
    // (ver InputManager.pointWithinHitArea). Con setSize(w,h) el origin
    // queda en el centro, así que un rect (0,0,w,h) cubre el botón visible.
    // Un rect centrado (-w/2,-h/2) se desplazaría medio botón arriba-izq.
    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    if (container.input) container.input.cursor = 'pointer';
    const release = () => {
      bodyReg.setVisible(true);
      bodyPre.setVisible(false);
      press.setPosition(0, 0);
      shadow.setVisible(true);
    };
    container.on('pointerover', () => container.setScale(1.03));
    container.on('pointerout', () => {
      container.setScale(1);
      release();
    });
    container.on('pointerdown', () => {
      bodyReg.setVisible(false);
      bodyPre.setVisible(true);
      press.setPosition(0, 2);
      shadow.setVisible(false);
    });
    container.on('pointerup', () => {
      release();
      opts.onClick?.();
    });
  } else {
    bodyReg.setTint(0x8f8f8f);
    container.setAlpha(0.9);
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

/** Cabecera de subpantalla: barra de título granate (estilo maqueta) con el
 *  título centrado y un botón compacto de volver superpuesto a la izquierda. */
export function screenTopbar(
  scene: Scene,
  title: string,
  onBack: () => void
): Phaser.GameObjects.Container {
  const w = scene.scale.width;
  const container = scene.add.container(0, 0);
  const barW = w - PAD * 2;
  // Barra granate full-width con el título centrado en grande.
  const bar = headerBar(scene, w / 2, 56, barW, title, 20);
  // Botón de volver compacto pegado al borde izquierdo de la barra.
  const back = retroButton(scene, PAD + 40, 56, '‹', {
    variant: 'grey',
    fontSize: 24,
    width: 72,
    height: 60,
    onClick: onBack,
  });

  // Botón de música para silenciar/activar el sonido global.
  const music = retroButton(scene, w - (PAD + 40), 56, '', {
    variant: 'grey',
    iconKey: 'icon_music',
    iconSize: 28,
    width: 72,
    height: 60,
    onClick: () => {
      scene.sound.mute = !scene.sound.mute;
      localStorage.setItem('game_muted', scene.sound.mute ? 'true' : 'false');
      updateMusicBtn();
    },
  });

  const updateMusicBtn = () => {
    const iconImg = music.getData('icon') as Phaser.GameObjects.Image | undefined;
    if (iconImg) {
      const isMuted = scene.sound.mute;
      iconImg.setAlpha(isMuted ? 0.4 : 1.0);
      iconImg.setTint(isMuted ? 0x888888 : 0xffffff);
    }
  };

  updateMusicBtn();

  container.add([bar, back, music]);
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
  const h = fontPx(fontSize) * 2 + 12;
  const container = scene.add.container(x, y);
  const body = scene.add.rectangle(0, 0, w, h, COLORS.maroon).setStrokeStyle(3, COLORS.border);
  const top = scene.add.rectangle(0, -h / 2 + 3, w - 6, 3, COLORS.maroonTop);
  const bottom = scene.add.rectangle(0, h / 2 - 3, w - 6, 3, COLORS.maroonEdge);
  const text = titleText(scene, 0, 0, label.toUpperCase(), fontSize, COLORS.cream);
  container.add([body, top, bottom, text]);
  container.setSize(w, h);
  return container;
}
