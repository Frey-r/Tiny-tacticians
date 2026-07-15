import { reddit, settings } from '@devvit/web/server';
import { redis } from '../devvitProxy/index.ts';

const isProd = process.env.NODE_ENV !== 'test' && process.env.IS_DEV !== 'true';

/**
 * Checks if the given user is a moderator of the current subreddit.
 */
export async function isCurrentUserModerator(userId: string): Promise<boolean> {
  if (!isProd) {
    // Local development/test mocking:
    // We treat t2_devuser or any user starting with t2_mod as a moderator.
    return userId === 't2_devuser' || userId.startsWith('t2_mod');
  }

  try {
    const subreddit = await reddit.getCurrentSubreddit();
    const moderators = await subreddit.getModerators().all();
    return moderators.some((mod) => mod.id === userId);
  } catch (err) {
    console.error('[isCurrentUserModerator] Error checking moderator status:', err);
    return false;
  }
}

// KILLSWITCH: Si se cambia a `true`, fuerza el evento de primera run (tutorial/intro)
// para todos los moderadores sin importar el valor del panel de configuración de Devvit.
export const FORCE_FIRST_RUN_KILLSWITCH = true;

/**
 * Retrieves a boolean setting safely. Fallbacks to Redis in local dev.
 */
export async function getSettingBoolean(key: string, defaultValue = false): Promise<boolean> {
  if (key === 'enableFirstRunEvent' && FORCE_FIRST_RUN_KILLSWITCH) {
    return true;
  }

  if (!isProd) {
    // In local development, we fallback to reading from Redis to allow mock configuration.
    try {
      const val = await redis.get(`mock_setting:${key}`);
      if (val !== null) {
        return val === 'true';
      }
    } catch (err) {
      console.error(`[getSettingBoolean] Error reading mock setting ${key} from Redis:`, err);
    }
    return defaultValue;
  }

  try {
    const val = await settings.get(key);
    return val === true;
  } catch (err) {
    console.error(`[getSettingBoolean] Error reading setting ${key} from Devvit:`, err);
    return defaultValue;
  }
}
