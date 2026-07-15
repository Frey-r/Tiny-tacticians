/* ============================================================
   Rate limiting por (acción, usuario, ventana de tiempo).
   Modelo de amenaza: un cliente no confiable que inunda endpoints
   para inflar el leaderboard, la economía o la cuota de Redis
   (ver security.spec.md §Rate Limiting And Abuse Caps).

   Implementación: contador atómico por ventana mediante hIncrBy.
   El índice de ventana es un campo del hash, así que un único key
   acumula las ventanas recientes de la acción. Si el contador
   supera el tope, se revierte el incremento y se rechaza.
   ============================================================ */
import { redis } from '../devvitProxy/index.ts';
import { keys } from './keys.ts';

export async function checkRateLimit(
  action: string,
  userId: string,
  max: number,
  windowMs: number
): Promise<void> {
  const window = Math.floor(Date.now() / windowMs);
  const key = keys.rateLimit(action, userId);

  const count = await redis.hIncrBy(key, String(window), 1);

  if (count > max) {
    // Revertir para no penalizar ventanas futuras con este intento rechazado.
    await redis.hIncrBy(key, String(window), -1);
    throw new Error(
      `RATE_LIMIT_EXCEEDED: You exceeded the limit of ${max} actions (${action}) in this window. Try again later.`
    );
  }
}
