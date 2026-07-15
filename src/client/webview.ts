/* ============================================================
   webview.ts — puente con el modo de presentación del webview de Devvit.

   En un post de Reddit, el webview arranca INLINE dentro del feed: los
   gestos táctiles compiten con el scroll del feed. La solución nativa es
   pedir el modo EXPANDED (`requestExpandedMode`), que abre el juego en un
   modal a pantalla completa donde el juego es dueño del gesto y ya no hay
   feed que scrollear.

   Este módulo SOLO debe cargarse vía import() dinámico desde main.ts, para
   que `@devvit/web/client` (pesado y dependiente del runtime de Devvit)
   quede en un chunk aparte y nunca se evalúe en `dev:client` (donde no
   existe el global `devvit`). Todas las llamadas van protegidas: si la API
   no está disponible, degradamos con seguridad en vez de romper el juego.
   ============================================================ */
import { getWebViewMode, requestExpandedMode } from '@devvit/web/client';

export type WvMode = 'inline' | 'expanded';

/** Modo actual. Si la API no está (dev/sin runtime) asumimos 'expanded'
 *  para que el juego arranque jugable en vez de quedarse en el splash. */
export function getMode(): WvMode {
  try {
    return getWebViewMode();
  } catch {
    return 'expanded';
  }
}

/** Pide pasar a pantalla completa. DEBE llamarse desde un click DOM real
 *  y "trusted" (no un pointer de Phaser). Devuelve true si la petición se
 *  emitió; false si la API no está disponible o lanzó. */
export function expand(ev: MouseEvent): boolean {
  try {
    requestExpandedMode(ev, 'default');
    return true;
  } catch (err) {
    console.warn('[webview] requestExpandedMode no disponible:', err);
    return false;
  }
}

/** Notifica cambios de modo. Al expandir, Reddit puede recargar el webview
 *  o solo cambiar el modo en caliente; cubrimos ambos escuchando el foco
 *  (recomendado por Devvit) y reportando el modo resuelto. */
export function onModeChange(cb: (mode: WvMode) => void): void {
  const fire = (): void => {
    try {
      cb(getMode());
    } catch {
      /* noop */
    }
  };
  window.addEventListener('focus', fire);
  window.addEventListener('message', (ev: MessageEvent) => {
    if ((ev.data as { type?: string })?.type === 'devvit-message') fire();
  });
}
