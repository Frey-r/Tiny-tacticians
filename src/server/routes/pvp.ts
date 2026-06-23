import { Router } from 'express';
import { getCurrentUserId, verifyOwnership } from '../core/auth.ts';
import { getGeneral } from '../core/generals.ts';
import { findOpponent } from '../core/matchmaking.ts';
import { simulateBattle } from '../../shared/sim/simulateBattle.ts';
import { recordBattleRewards } from '../core/rewards.ts';
import { redis } from '../devvitProxy/index.ts';
import { keys } from '../core/keys.ts';
import { checkAndLockIdempotency, saveIdempotency } from '../core/idempotency.ts';
import { checkRateLimit } from '../core/rateLimit.ts';

const router = Router();
const BATTLE_TTL_SECONDS = 86400; // 24 hours
const PVP_BATTLES_PER_HOUR = 60; // anti-abuso de leaderboard/economía (security.spec)

// POST /api/pvp/battle - Matchmake, simulate battle, and award gold/leaderboard points
router.post('/battle', async (req, res) => {
  const { attackerId, idempToken } = req.body;

  try {
    const userId = getCurrentUserId();

    if (!attackerId) {
      return res.status(400).json({ error: 'attackerId es requerido.' });
    }

    if (idempToken) {
      const idemp = await checkAndLockIdempotency(idempToken);
      if (!idemp.isNew) {
        return res.json(JSON.parse(idemp.cachedResult || '{}'));
      }
    }

    // Rate limit tras la verificación de idempotencia: los reintentos cacheados no
    // consumen cuota, pero las batallas nuevas sí (evita inflar el leaderboard).
    await checkRateLimit('pvp', userId, PVP_BATTLES_PER_HOUR, 3600_000);

    // 1. Fetch and verify attacker general
    const attacker = await getGeneral(attackerId);
    if (!attacker) {
      return res.status(404).json({ error: 'General atacante no encontrado.' });
    }
    verifyOwnership(attacker.ownerId);

    // 2. Perform matchmaking to find opponent
    const opponent = await findOpponent(userId, attacker);

    // 3. Simulate the battle with a REPRODUCIBLE seed derivada de las entradas de
    //    los generales y el contexto de la petición (idempToken). Persistimos la
    //    semilla con el resultado para permitir replay determinista (combat-pvp.spec).
    const seedContext = idempToken || `${attacker.seed}:${opponent.seed}`;
    const battleSeed = `bat_${attacker.id}:${opponent.id}:${seedContext}`;
    const battleResult = simulateBattle(battleSeed, attacker, opponent);

    // 4. Persist battle replay with TTL
    const battleKey = keys.battle(battleResult.battleId);
    await redis.set(battleKey, JSON.stringify(battleResult), { expiration: BATTLE_TTL_SECONDS });

    // 5. Award resources and points based on winner
    const attackerWon = battleResult.winnerId === attacker.id;
    const rewards = await recordBattleRewards(userId, attackerWon, attacker.id);

    const responsePayload = {
      battleResult,
      rewards,
    };

    if (idempToken) {
      await saveIdempotency(idempToken, JSON.stringify(responsePayload));
    }

    res.json(responsePayload);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Error processing battle' });
  }
});

// GET /api/pvp/battle/:id - Fetch battle replay log
router.get('/battle/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const battleKey = keys.battle(id);
    const data = await redis.get(battleKey);

    if (!data) {
      return res.status(404).json({ error: 'Batalla no encontrada o expirada.' });
    }

    res.json(JSON.parse(data));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching battle' });
  }
});

// GET /api/pvp/leaderboard - Paginated leaderboard of the season
router.get('/leaderboard', async (req, res) => {
  const page = parseInt(req.query.page as string || '1', 10);
  const limit = parseInt(req.query.limit as string || '10', 10);

  try {
    const offset = (page - 1) * limit;
    const start = offset;
    const stop = offset + limit - 1;

    const lbKey = keys.lbSeason(1);
    const rawList = await redis.zRange(lbKey, start, stop, { reverse: true });

    const formattedList = await Promise.all(
      rawList.map(async (item) => {
        let name = item.member;
        
        if (name.startsWith('npc_')) {
          // fetch npc name from general store
          const gen = await getGeneral(name);
          name = gen ? gen.name : name;
        } else {
          // human player format
          name = name.startsWith('t2_') ? `u/${name.substring(3)}` : name;
        }

        return {
          userId: item.member,
          name,
          score: item.score,
        };
      })
    );

    res.json({
      leaderboard: formattedList,
      page,
      limit,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error fetching leaderboard' });
  }
});

export default router;
