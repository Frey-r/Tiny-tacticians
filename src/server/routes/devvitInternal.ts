/* ============================================================
   Endpoints internos invocados por Devvit (no por el cliente).
   Deben colgar de /internal/* (ver patrón InternalEndpoint del
   schema de devvit.json). Aquí viven la acción de menú para crear
   el post jugable y el trigger onAppInstall que evita que el
   subreddit quede vacío al instalar la app (playtest/upload).
   ============================================================ */
import { Router } from 'express';
import { reddit } from '@devvit/web/server';
import { context, redis } from '../devvitProxy/index.ts';
import { keys } from '../core/keys.ts';
import { seedNPCs } from '../core/npc.ts';
import { logDevvitDiag } from '../core/diag.ts';
import { getCanonicalDate, getOrCreateDailyChallenge } from '../core/daily.ts';
import type { DailyChallenge } from '../../shared/types/index.ts';

const router = Router();

const POST_TITLE = 'Tiny Tacticians — ¡Entrena a tu general y conquista la arena!';

/**
 * Crea (o reutiliza) el custom post jugable del subreddit actual.
 * Idempotente: guarda el id del post en Redis y, si ese post sigue vivo, lo
 * devuelve en lugar de crear un duplicado. El primero que se crea se fija
 * (sticky) como entrada del juego.
 */
export async function createGamePost(): Promise<{ id: string; url: string; created: boolean }> {
  // Idempotente: si ya hay un post guardado y sigue vivo, lo reutilizamos en vez de duplicar.
  const storedId = await redis.get(keys.firstPost());
  if (storedId) {
    try {
      const existing = await reddit.getPostById(storedId as any);
      return { id: existing.id, url: existing.url, created: false };
    } catch {
      // El post guardado ya no existe (borrado/eliminado): creamos uno nuevo.
    }
  }

  // Patrón canónico del template oficial (reddit/devvit-template-react): solo `title`.
  // El subreddit y `runAs: 'APP'` se infieren del contexto, y el entrypoint 'default'
  // de devvit.json. Sin fallback runAs USER→APP ni textFallback: menos superficie de
  // fallo y, si el contexto/metadata falla, el error propaga limpio a `devvit logs`.
  const post = await reddit.submitCustomPost({ title: POST_TITLE });

  try {
    await post.sticky(1);
  } catch (err: any) {
    console.error('No se pudo fijar (sticky) el post:', err?.message || err);
  }

  await redis.set(keys.firstPost(), post.id);
  return { id: post.id, url: post.url, created: true };
}


/**
 * Crea (o reutiliza) el post de Reddit asociado al reto diario de `date`.
 * Idempotente: guarda el id en `daily:post:<date>` y, si ese post sigue vivo,
 * lo devuelve en vez de publicar un duplicado.
 */
export async function createDailyPost(
  date: string,
  challenge: DailyChallenge
): Promise<{ id: string; url: string; created: boolean }> {
  const postKey = keys.dailyPost(date);
  const storedId = await redis.get(postKey);
  if (storedId) {
    try {
      const existing = await reddit.getPostById(storedId as any);
      return { id: existing.id, url: existing.url, created: false };
    } catch {
      // El post guardado ya no existe: se crea uno nuevo.
    }
  }

  const post = await reddit.submitCustomPost({
    title: `Tiny Tacticians — Reto Diario ${date}: ${challenge.modifier.name}`,
  });
  await redis.set(postKey, post.id);
  return { id: post.id, url: post.url, created: true };
}

// POST /internal/cron/daily-rollover — rollover diario (scheduler de devvit.json).
// Genera el reto de hoy (idempotente) y publica el post asociado. Tolerante a
// fallos: un error al publicar no rompe la generación del reto.
router.post('/cron/daily-rollover', async (req, res) => {
  logDevvitDiag('cron/daily-rollover', req);
  const date = getCanonicalDate();
  try {
    const challenge = await getOrCreateDailyChallenge(date);
    try {
      const post = await createDailyPost(date, challenge);
      console.log(
        `[cron/daily-rollover] reto ${date} listo; post ${post.created ? 'CREADO' : 'reutilizado'}: ${post.id}`
      );
    } catch (err) {
      console.error('[cron/daily-rollover] no se pudo publicar el post diario:', err);
    }
  } catch (err) {
    console.error('[cron/daily-rollover] no se pudo generar el reto diario:', err);
  }
  res.json({});
});

// GET /internal/test-post — endpoint de diagnóstico para probar creación de posts
router.get('/test-post', async (req, res) => {
  const runAsUser = req.query.runAsUser === 'true';
  const postType = req.query.type || 'custom'; // 'custom' o 'self'
  
  let subredditName = context.subredditName;
  if (!subredditName) {
    try {
      subredditName = (await reddit.getCurrentSubreddit()).name;
    } catch (err: any) {
      console.error('[test-post] no se pudo resolver el subreddit:', err);
    }
  }
  if (!subredditName) {
    subredditName = 'tiny_tacticians_dev';
  }

  console.log(`[test-post] Diagnóstico: type=${postType}, runAsUser=${runAsUser}, subreddit=${subredditName}`);

  try {
    if (postType === 'self') {
      const post = await reddit.submitPost({
        subredditName,
        title: 'Test Self Post ' + Date.now(),
        text: 'This is a test text post from Devvit',
        runAs: runAsUser ? 'USER' : 'APP',
      });
      res.json({ success: true, id: post.id, url: post.url });
    } else {
      const options: any = {
        subredditName,
        title: 'Test Custom Post ' + Date.now(),
        entry: 'default',
        textFallback: {
          text: 'Test Custom Post Fallback',
        },
      };
      if (runAsUser) {
        options.runAs = 'USER';
      }
      const post = await reddit.submitCustomPost(options);
      res.json({ success: true, id: post.id, url: post.url });
    }
  } catch (err: any) {
    console.error('[test-post] Error:', err);
    res.status(500).json({
      success: false,
      message: err.message,
      stack: err.stack,
      errDetails: err.details,
      errCode: err.code,
    });
  }
});

// POST /internal/menu/create-post — acción de menú (moderador).
router.post('/menu/create-post', async (req, res) => {
  try {
    logDevvitDiag('menu/create-post', req);
    // Asegura que haya rivales/leaderboard la primera vez (idempotente).
    await seedNPCs().catch((e) => console.error('seedNPCs (menu) falló:', e));
    // Patrón canónico: el post se crea como APP desde el contexto del menú.
    const post = await createGamePost();
    res.json({
      showToast: post.created
        ? '¡Post de Tiny Tacticians creado!'
        : 'El post de Tiny Tacticians ya existía.',
      navigateTo: post.url,
    });
  } catch (err: any) {
    console.error('[menu/create-post] Error completo:', {
      message: err?.message,
      code: err?.code,
      details: err?.details,
      stack: err?.stack?.split('\n').slice(0, 5).join('\n'),
    });
    res.status(400).json({ showToast: `Error: ${err.message || 'no se pudo crear el post'}` });
  }
});

// POST /internal/on-install — triggers onAppInstall + onAppUpgrade.
// Siembra NPCs y asegura (idempotente) un post jugable para que el subreddit no
// quede vacío. onAppUpgrade hace que esto corra en cada deploy (playtest/upload),
// no solo en la instalación inicial.
router.post('/on-install', async (req, res) => {
  logDevvitDiag('on-install', req);
  try {
    await seedNPCs();
  } catch (err) {
    console.error('[on-install] seedNPCs falló:', err);
  }
  try {
    // El trigger de instalación corre en segundo plano como app.
    const post = await createGamePost();
    console.log(
      `[on-install] post ${post.created ? 'CREADO' : 'reutilizado'}: ${post.id} → ${post.url}`
    );
  } catch (err) {
    console.error('[on-install] createGamePost falló:', err);
  }
  res.json({});
});

export default router;
