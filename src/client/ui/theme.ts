/* ============================================================
   Tiny Tacticians — Paleta y tipografías (Phaser)
   Calcado del mockup pixel-art medieval (ver index.css legado).
   Los colores se exponen como número (0xRRGGBB) para Phaser y
   como string CSS para textos / estilos DOM puntuales.
   ============================================================ */

export const COLORS = {
  bg: 0x15110e,
  bg2: 0x1b1612,
  screen: 0x241d17,
  panelDark: 0x2c2319,

  maroon: 0x7e2f30,
  maroonTop: 0x9c4243,
  maroonEdge: 0x4c1a1b,

  lime: 0xb3d23f,
  limeTop: 0xc8e457,
  limeEdge: 0x6f8a22,
  limeHover: 0xc2e04c,

  card: 0xcdc8bd,
  card2: 0xbdb7aa,
  cardHi: 0xeae5da,
  cardLo: 0x8b857a,

  grass: 0x6f9e4b,
  grassDark: 0x57863a,
  grassRow: 0x659146,
  dirt: 0x9a6b3f,

  ink: 0x1a1510,
  cream: 0xefe7d6,
  gold: 0xe8c33a,
  danger: 0xc2402f,
  border: 0x000000,

  // Tintes por afinidad de consejero
  affOFE: 0xa83b34,
  affDEF: 0x2f6aa3,
  affMAN: 0x7a45a8,
} as const;

/** Convierte 0xRRGGBB a string CSS '#rrggbb'. */
export function hex(n: number): string {
  return '#' + n.toString(16).padStart(6, '0');
}

export const FONT = {
  title: '"Oswald", "Arial Narrow", "Helvetica Neue", sans-serif',
  body: '"JetBrains Mono", "VT323", "Courier New", monospace',
} as const;

/** Tamaño base del lienzo (PORTRAIT / móvil, proporción 3:4 = 3 ancho · 4 alto).
 *  Scale.FIT escala este lienzo a cualquier pantalla; en escritorio se
 *  muestra como columna vertical centrada y el sobrante queda como
 *  letterbox (vestido por CSS en index.html). El ancho 960 (vs 720 antiguo)
 *  da una columna más ancha para botones/textos más legibles. */
export const GAME_W = 960;
export const GAME_H = 1280;

/** Margen lateral de la columna de contenido. */
export const PAD = 44;
/** Ancho útil de la columna (botones/paneles full-width). */
export const CONTENT_W = GAME_W - PAD * 2;
/** Altura mínima táctil para botones (px en el espacio de diseño). */
export const TOUCH_H = 72;

/** Multiplicador de resolución para los textos (glifos nítidos).
 *  FIT reescala el lienzo por CSS, así que renderizamos el texto más
 *  denso según el devicePixelRatio para que no salga borroso/dentado.
 *  Acotado para no disparar el uso de memoria de texturas. */
export const TEXT_RES = Math.min(
  4,
  Math.max(2, Math.round((typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1) * 1.5))
);

/** ¿Estamos en escritorio? (puntero fino = ratón). En escritorio el lienzo
 *  portrait 3:4 se reduce mucho con Scale.FIT (la pantalla es apaisada y el
 *  alto manda), así que los textos quedan diminutos. En móvil el lienzo llena
 *  la columna y el tamaño base ya es legible. */
export const IS_DESKTOP =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine)').matches;

/** Multiplicador de tamaño de fuente. En escritorio ampliamos para compensar
 *  el reescalado FIT del lienzo portrait y que el texto siga siendo legible. */
export const FONT_SCALE = IS_DESKTOP ? 1.35 : 1;

/** Aplica FONT_SCALE y redondea (tamaños enteros = glifos pixel más nítidos).
 *  Único punto donde se escala el texto: los widgets que derivan geometría del
 *  tamaño de fuente (botón, cabecera) deben usar esto para medir/dimensionar y
 *  pasar el tamaño BASE a titleText/bodyText, que vuelven a aplicar fontPx. */
export function fontPx(size: number): number {
  return Math.round(size * FONT_SCALE);
}
