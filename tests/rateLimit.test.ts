import { describe, it, expect } from 'vitest';
import { checkRateLimit } from '../src/server/core/rateLimit.ts';

describe('checkRateLimit (abuse caps)', () => {
  it('allows up to max calls within a window and rejects the next', async () => {
    const user = 't2_rl_user';
    await checkRateLimit('test-action', user, 2, 3600_000);
    await checkRateLimit('test-action', user, 2, 3600_000);

    await expect(checkRateLimit('test-action', user, 2, 3600_000)).rejects.toThrow(
      'RATE_LIMIT_EXCEEDED'
    );
  });

  it('tracks limits independently per action', async () => {
    const user = 't2_rl_user2';
    await checkRateLimit('action-a', user, 1, 3600_000);
    // A different action for the same user still has its own budget.
    await expect(checkRateLimit('action-b', user, 1, 3600_000)).resolves.toBeUndefined();
    // But repeating action-a is now blocked.
    await expect(checkRateLimit('action-a', user, 1, 3600_000)).rejects.toThrow('RATE_LIMIT_EXCEEDED');
  });
});
