import { context as devvitContext } from '@devvit/web/server';

/**
 * Diagnóstico TEMPORAL (quitar cuando se resuelva el bug de gRPC).
 *
 * Loguea TODOS los headers que llegan al request (solo nombres, no valores, por
 * seguridad) + los campos de contexto Devvit resueltos. El objetivo es ver, en
 * el endpoint del menú (que corre servidor-a-servidor y cuyas llamadas gRPC el
 * host rechaza con "undefined undefined: undefined"), QUÉ headers de auth llegan
 * realmente — y si falta el header de auth/capabilities que Devvit normalmente
 * reenvía a los requests de cliente.
 *
 * La línea `[diag:<label>] ...` sirve además para confirmar que el bundle nuevo
 * está corriendo: si NO aparece, el playtest está sirviendo código viejo.
 */
export function logDevvitDiag(label: string, req: { headers?: Record<string, unknown> }): void {
  const allKeys = Object.keys(req?.headers ?? {}).sort();
  const devvitKeys = allKeys.filter((h) => h.toLowerCase().startsWith('devvit-'));

  const ctx: Record<string, unknown> = {};
  for (const field of ['subredditId', 'subredditName', 'userId', 'appName', 'appVersion'] as const) {
    try {
      ctx[field] = (devvitContext as Record<string, unknown>)[field];
    } catch (err) {
      ctx[field] = `<err: ${(err as Error)?.message ?? String(err)}>`;
    }
  }

  console.log(`[diag:${label}] ALL headers(${allKeys.length}): [${allKeys.join(', ')}]`);
  console.log(`[diag:${label}] devvit-* (${devvitKeys.length}): [${devvitKeys.join(', ')}]`);
  console.log(`[diag:${label}] context: ${JSON.stringify(ctx)}`);
}
