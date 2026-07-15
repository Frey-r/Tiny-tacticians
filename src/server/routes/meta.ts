import { Router } from 'express';
import { getCurrentUserId } from '../core/auth.ts';
import { logDevvitDiag } from '../core/diag.ts';
import { createGamePost } from './devvitInternal.ts';
import { seedNPCs } from '../core/npc.ts';
import { getUserProfile, getUserConsejeros, levelConsejero } from '../core/rewards.ts';
import { checkAndLockIdempotency, saveIdempotency } from '../core/idempotency.ts';
import { checkRateLimit } from '../core/rateLimit.ts';
import { isCurrentUserModerator, getSettingBoolean } from '../core/moderator.ts';
import { redis } from '../devvitProxy/index.ts';
import { keys } from '../core/keys.ts';

const CONSEJERO_LEVEL_PER_HOUR = 60; // anti-abuso (security.spec §Rate Limiting)

const router = Router();

// GET /api/profile - Retrieve authenticated user profile
router.get('/profile', async (req, res) => {
  try {
    logDevvitDiag('api/profile', req);
    const userId = getCurrentUserId();
    const profile = await getUserProfile(userId);

    const isMod = await isCurrentUserModerator(userId);
    const isEventEnabled = await getSettingBoolean('enableFirstRunEvent', false);
    if (isEventEnabled && isMod) {
      delete profile.onboardedAt;
    }

    res.json({
      ...profile,
      isModerator: isMod,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/profile/reset-onboarding - Reset onboarding state (moderators only)
router.post('/profile/reset-onboarding', async (req, res) => {
  try {
    const userId = getCurrentUserId();
    const isMod = await isCurrentUserModerator(userId);
    if (!isMod) {
      return res.status(403).json({ error: 'FORBIDDEN: Solo los moderadores pueden reiniciar el onboarding.' });
    }

    const userKey = keys.user(userId);
    // Setting onboardedAt to empty string makes it invalid/non-finite, effectively resetting it
    await redis.hSet(userKey, { onboardedAt: '' });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// GET /api/consejeros - Retrieve authenticated user's advisors
router.get('/consejeros', async (req, res) => {
  try {
    const userId = getCurrentUserId();
    const advisors = await getUserConsejeros(userId);
    res.json(advisors);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// POST /api/consejeros/:id/level - Level up a specific advisor
router.post('/consejeros/:id/level', async (req, res) => {
  const { id } = req.params;
  const { idempToken } = req.body;

  try {
    const userId = getCurrentUserId();

    // Idempotency check
    if (idempToken) {
      const idemp = await checkAndLockIdempotency(idempToken);
      if (!idemp.isNew) {
        return res.json(JSON.parse(idemp.cachedResult || '{}'));
      }
    }

    await checkRateLimit('consejero-level', userId, CONSEJERO_LEVEL_PER_HOUR, 3600_000);

    const result = await levelConsejero(userId, id);

    if (idempToken) {
      await saveIdempotency(idempToken, JSON.stringify(result));
    }

    res.json(result);
  } catch (err: any) {
    // If idempotency failed, it won't save. If transaction failed, throw.
    res.status(400).json({ error: err.message || 'Error leveling advisor' });
  }
});

// POST /api/create-post — crea el post jugable desde un request DE CLIENTE.
// El menú (/internal/menu/create-post) corre como request servidor-a-servidor y
// el host rechaza sus llamadas gRPC ("undefined undefined: undefined") pese a
// tener contexto. Un request de cliente (webview) sí lleva la auth completa del
// usuario, así que crear el post desde aquí evita ese problema. Sirve además de
// prueba definitiva: si esto funciona, el fallo es solo de endpoints internos;
// si falla igual, el problema es global (bundle/transporte).
router.post('/create-post', async (req, res) => {
  try {
    logDevvitDiag('api/create-post', req);
    // Requiere identidad de Reddit válida (lanza UNAUTHORIZED si no hay contexto).
    getCurrentUserId();
    await seedNPCs().catch((e) => console.error('seedNPCs (api/create-post) falló:', e));
    const post = await createGamePost();
    res.json({
      ok: true,
      created: post.created,
      id: post.id,
      url: post.url,
      message: post.created ? 'Post creado.' : 'El post ya existía.',
    });
  } catch (err: any) {
    console.error('[api/create-post] Error:', {
      message: err?.message,
      code: err?.code,
      details: err?.details,
    });
    res.status(400).json({ ok: false, error: err?.message || 'No se pudo crear el post' });
  }
});

export default router;
