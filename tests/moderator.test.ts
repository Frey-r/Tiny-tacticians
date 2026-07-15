import { describe, it, expect, beforeEach } from 'vitest';
import { isCurrentUserModerator, getSettingBoolean } from '../src/server/core/moderator.ts';
import { redis } from '../src/server/devvitProxy/index.ts';

describe('Moderator and Settings checks (development/mock mode)', () => {
  beforeEach(async () => {
    // Clean up mock settings before each test
    await redis.del('mock_setting:enableFirstRunEvent');
  });

  it('should identify developers and mod-prefixed users as moderators in dev mode', async () => {
    expect(await isCurrentUserModerator('t2_devuser')).toBe(true);
    expect(await isCurrentUserModerator('t2_mod_someguy')).toBe(true);
    expect(await isCurrentUserModerator('t2_normal_player')).toBe(false);
  });

  it('should fall back to default value when mock setting is missing in Redis', async () => {
    expect(await getSettingBoolean('enableFirstRunEvent', false)).toBe(false);
    expect(await getSettingBoolean('enableFirstRunEvent', true)).toBe(true);
  });

  it('should read boolean settings from Redis mock in dev mode', async () => {
    await redis.set('mock_setting:enableFirstRunEvent', 'true');
    expect(await getSettingBoolean('enableFirstRunEvent', false)).toBe(true);

    await redis.set('mock_setting:enableFirstRunEvent', 'false');
    expect(await getSettingBoolean('enableFirstRunEvent', true)).toBe(false);
  });

  it('should simulate profile endpoint override for moderators when setting is active', async () => {
    const userId = 't2_mod_user';
    
    // Set mock setting to true
    await redis.set('mock_setting:enableFirstRunEvent', 'true');
    
    // Check if event is enabled and user is mod
    const isEventEnabled = await getSettingBoolean('enableFirstRunEvent', false);
    const isMod = await isCurrentUserModerator(userId);
    
    expect(isEventEnabled).toBe(true);
    expect(isMod).toBe(true);
    
    // Profile with onboardedAt
    const profile = {
      userId,
      gold: 1000,
      settlementLevel: 1,
      schemaVersion: 1,
      onboardedAt: 123456789,
    };
    
    if (isEventEnabled && isMod) {
      delete (profile as any).onboardedAt;
    }
    
    expect(profile.onboardedAt).toBeUndefined();
  });
});
