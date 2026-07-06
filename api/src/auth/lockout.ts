import type pg from 'pg';

export type LockoutScope = 'account' | 'ip';

/** Failures inside this window count toward a lockout. */
export const FAILURE_WINDOW_MINUTES = 15;
/** Failures that trigger a lockout. */
export const LOCKOUT_THRESHOLD = 5;
/** First lockout duration; doubles per level. */
export const BASE_LOCK_MINUTES = 15;
export const MAX_LOCK_MINUTES = 24 * 60;

export function lockDurationMinutes(level: number): number {
  return Math.min(BASE_LOCK_MINUTES * 2 ** Math.max(0, level - 1), MAX_LOCK_MINUTES);
}

/**
 * Progressive lockout bookkeeping (KUR-023). Account and IP scopes are
 * tracked independently: an attacker rotating IPs still trips the
 * account lock; an attacker spraying many accounts trips the IP lock.
 *
 * Unlock-by-CAPTCHA for locked-out legitimate owners is the KUR-025/#110
 * follow-up; until then locks simply expire.
 */
export class LockoutService {
  constructor(private readonly pool: Pick<pg.Pool, 'query'>) {}

  /** Seconds remaining if locked, else null. */
  async lockedFor(scope: LockoutScope, key: string): Promise<number | null> {
    const result = await this.pool.query<{ locked_until: Date }>(
      `SELECT locked_until FROM auth_lockouts
       WHERE scope = $1 AND key = $2 AND locked_until > now()`,
      [scope, key],
    );
    const row = result.rows[0];
    if (!row) return null;
    return Math.max(1, Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1_000));
  }

  /**
   * Registers a failed attempt. Counts decay after the failure window;
   * hitting the threshold locks the key for an escalating duration and
   * resets the counter. Returns lock seconds if this failure locked.
   */
  async recordFailure(scope: LockoutScope, key: string): Promise<number | null> {
    const result = await this.pool.query<{
      failure_count: number;
      lockout_level: number;
    }>(
      `INSERT INTO auth_lockouts (scope, key, failure_count, last_failure_at, updated_at)
       VALUES ($1, $2, 1, now(), now())
       ON CONFLICT (scope, key) DO UPDATE SET
         failure_count = CASE
           WHEN auth_lockouts.last_failure_at < now() - interval '${FAILURE_WINDOW_MINUTES} minutes'
           THEN 1
           ELSE auth_lockouts.failure_count + 1
         END,
         last_failure_at = now(),
         updated_at = now()
       RETURNING failure_count, lockout_level`,
      [scope, key],
    );
    const row = result.rows[0] as { failure_count: number; lockout_level: number };
    if (row.failure_count < LOCKOUT_THRESHOLD) return null;

    const level = row.lockout_level + 1;
    const minutes = lockDurationMinutes(level);
    await this.pool.query(
      `UPDATE auth_lockouts
       SET lockout_level = $3, locked_until = now() + ($4 || ' minutes')::interval,
           failure_count = 0, updated_at = now()
       WHERE scope = $1 AND key = $2`,
      [scope, key, level, String(minutes)],
    );
    return minutes * 60;
  }

  /** Successful login clears the account counter (IP decays naturally —
   *  clearing it would let one valid account reset a spray attack). */
  async clear(scope: LockoutScope, key: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_lockouts SET failure_count = 0, updated_at = now()
       WHERE scope = $1 AND key = $2 AND (locked_until IS NULL OR locked_until < now())`,
      [scope, key],
    );
  }
}
