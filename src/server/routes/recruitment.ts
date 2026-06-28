/* ============================================================
   Rutas de reclutamiento de consejeros (meta-progresión).
   GET  /api/recruitment        — estado (oro, contratos, préstamo, catálogo).
   POST /api/recruitment/loan    — petición diaria (préstamo temporal 24h).
   POST /api/recruitment/unlock  — desbloqueo permanente con contrato + oro.
   ============================================================ */
import { Router } from 'express';
import { getCurrentUserId } from '../core/auth.ts';
import { checkRateLimit } from '../core/rateLimit.ts';
import { getRecruitmentState, requestDailyLoan, unlockWithContract } from '../core/recruitment.ts';
import { ContractColor } from '../../shared/types/index.ts';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const userId = getCurrentUserId();
    res.json(await getRecruitmentState(userId));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error obteniendo el estado de reclutamiento' });
  }
});

router.post('/loan', async (_req, res) => {
  try {
    const userId = getCurrentUserId();
    await checkRateLimit('loan-request', userId, 10, 3600_000);
    const advisor = await requestDailyLoan(userId);
    res.json({ advisor });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error en la petición diaria' });
  }
});

router.post('/unlock', async (req, res) => {
  const { advisorId, color } = req.body || {};
  try {
    const userId = getCurrentUserId();
    if (!advisorId || !color) {
      return res.status(400).json({ error: 'advisorId y color son requeridos.' });
    }
    await checkRateLimit('recruit-unlock', userId, 30, 3600_000);
    const result = await unlockWithContract(userId, advisorId, color as ContractColor);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error al reclutar el consejero' });
  }
});

export default router;
