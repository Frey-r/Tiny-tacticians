/* ============================================================
   Rutas del reto diario (capability daily-events).
   GET  /api/daily/challenge — reto de hoy (+ estado del usuario).
   POST /api/daily/battle    — combate diario contra el enemigo del reto.
   POST /api/daily/claim     — reclamo único por usuario/día.
   ============================================================ */
import { Router } from 'express';
import { getCurrentUserId } from '../core/auth.ts';
import {
  getOrCreateDailyChallenge,
  getDailyStatus,
  resolveDailyBattle,
  claimDaily,
} from '../core/daily.ts';

const router = Router();

// GET /api/daily/challenge — reto del día (creación perezosa idempotente) + estado.
router.get('/challenge', async (_req, res) => {
  try {
    const userId = getCurrentUserId();
    const challenge = await getOrCreateDailyChallenge();
    const status = await getDailyStatus(userId, challenge.date);
    res.json({ challenge, status });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error obteniendo el reto diario' });
  }
});

// POST /api/daily/battle — resuelve el combate diario; marca completado si gana.
router.post('/battle', async (req, res) => {
  const { attackerId } = req.body;
  try {
    const userId = getCurrentUserId();
    if (!attackerId) {
      return res.status(400).json({ error: 'attackerId es requerido.' });
    }
    const result = await resolveDailyBattle(userId, attackerId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error en el combate diario' });
  }
});

// POST /api/daily/claim — acredita la recompensa una sola vez por usuario/día.
router.post('/claim', async (_req, res) => {
  try {
    const userId = getCurrentUserId();
    const result = await claimDaily(userId);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error al reclamar la recompensa diaria' });
  }
});

export default router;
