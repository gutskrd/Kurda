import type pg from 'pg';
import { networkHashOf } from '../net/network-key.js';
import { networkKeyHash } from '../moderation/pseudonym.js';

/**
 * 'account' — an address someone is trying to sign in to, known or not (a user
 *             id, or `email:` and a keyed hash of an address with no account,
 *             so the two answer alike);
 * 'device'  — a device that has signed in to the account before, which keeps a
 *             budget of its own (known-devices.ts);
 * 'ip'      — the network the attempts come from.
 */
export type LockoutScope = 'account' | 'ip' | 'device';

/** Failures inside this window count toward a lockout. */
export const FAILURE_WINDOW_MINUTES = 15;
/** Failures that trigger a lockout. */
export const LOCKOUT_THRESHOLD = 5;
/** First lockout duration; doubles per level. */
export const BASE_LOCK_MINUTES = 15;
export const MAX_LOCK_MINUTES = 24 * 60;

/** Failures on an account or a network after which a sign-in needs the CAPTCHA. */
export const CAPTCHA_AFTER_FAILURES = 3;
/**
 * A network is locked outright only when it looks like spraying: this many
 * failures inside the window, across at least NETWORK_LOCK_ACCOUNTS different
 * accounts. One address can be a whole mobile carrier, so fewer failures, or
 * many against one account, only bring the CAPTCHA.
 */
export const NETWORK_LOCK_FAILURES = 20;
export const NETWORK_LOCK_ACCOUNTS = 5;

export function lockDurationMinutes(level: number): number {
  return Math.min(BASE_LOCK_MINUTES * 2 ** Math.max(0, level - 1), MAX_LOCK_MINUTES);
}

/**
 * Progressive lockout bookkeeping (KUR-023). Account, device and IP scopes are
 * tracked independently: an attacker rotating IPs still trips the account
 * lock; an attacker spraying many accounts trips the IP lock; and neither
 * touches a device the owner has signed in from before.
 *
 * Where a CAPTCHA is configured, a lock is not a wall: the sign-in asks for the
 * challenge, and the right password with it still gets in (auth/service.ts).
 */
export class LockoutService {
  constructor(private readonly pool: Pick<pg.Pool, 'query'>) {}

  /**
   * What a key is stored as. An address is kept as the keyed hash of its
   * network (net/network-key.ts): never the raw address, and an IPv6 caller
   * cannot shed a lock by moving to another address in the same /64. Text that
   * is not an address is hashed as it is, so it still locks and stays apart.
   */
  private storedKey(scope: LockoutScope, key: string): string {
    if (scope !== 'ip') return key;
    return networkHashOf(key) ?? networkKeyHash(`unparsed:${key}`);
  }

  /** Seconds remaining if locked, else null. */
  async lockedFor(scope: LockoutScope, key: string): Promise<number | null> {
    const result = await this.pool.query<{ locked_until: Date }>(
      `SELECT locked_until FROM auth_lockouts
       WHERE scope = $1 AND key = $2 AND locked_until > now()`,
      [scope, this.storedKey(scope, key)],
    );
    const row = result.rows[0];
    if (!row) return null;
    return Math.max(1, Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 1_000));
  }

  /**
   * Registers a failed attempt. Counts decay after the failure window;
   * hitting the threshold locks the key for an escalating duration and
   * resets the counter. Returns lock seconds if this failure locked.
   *
   * A network failure names its `target`, the account it was aimed at (an
   * opaque hash), so the network lock can tell spraying from one person
   * mistyping (see NETWORK_LOCK_FAILURES).
   */
  async recordFailure(scope: LockoutScope, key: string, target = ''): Promise<number | null> {
    if (scope === 'ip') return this.recordNetworkFailure(key, target);
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
      [scope, this.storedKey(scope, key)],
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
      [scope, this.storedKey(scope, key), level, String(minutes)],
    );
    return minutes * 60;
  }

  /** Failed attempts on a key inside the failure window (what the CAPTCHA step-up counts). */
  async failures(scope: LockoutScope, key: string): Promise<number> {
    const stored = this.storedKey(scope, key);
    if (scope === 'ip') {
      const res = await this.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM auth_network_failures
          WHERE network_key = $1 AND failed_at > now() - interval '${FAILURE_WINDOW_MINUTES} minutes'`,
        [stored],
      );
      return res.rows[0]?.n ?? 0;
    }
    const res = await this.pool.query<{ failure_count: number }>(
      `SELECT failure_count FROM auth_lockouts
        WHERE scope = $1 AND key = $2 AND last_failure_at > now() - interval '${FAILURE_WINDOW_MINUTES} minutes'`,
      [scope, stored],
    );
    return res.rows[0]?.failure_count ?? 0;
  }

  /**
   * A failure from a network, aimed at `target`. The network is locked only
   * once it has failed NETWORK_LOCK_FAILURES times inside the window across at
   * least NETWORK_LOCK_ACCOUNTS accounts; the count starts again after a lock.
   * Rows outside the window are worthless, so each failure sweeps them away.
   */
  private async recordNetworkFailure(key: string, target: string): Promise<number | null> {
    const network = this.storedKey('ip', key);
    await this.pool.query(
      `DELETE FROM auth_network_failures WHERE failed_at < now() - interval '${FAILURE_WINDOW_MINUTES} minutes'`,
    );
    await this.pool.query(`INSERT INTO auth_network_failures (network_key, target_hash) VALUES ($1, $2)`, [network, target]);
    const counted = await this.pool.query<{ failures: number; targets: number }>(
      `SELECT count(*)::int AS failures, count(DISTINCT target_hash)::int AS targets
         FROM auth_network_failures WHERE network_key = $1`,
      [network],
    );
    const { failures, targets } = counted.rows[0] ?? { failures: 0, targets: 0 };
    if (failures < NETWORK_LOCK_FAILURES || targets < NETWORK_LOCK_ACCOUNTS) return null;

    const locked = await this.pool.query<{ lockout_level: number }>(
      `INSERT INTO auth_lockouts (scope, key, failure_count, lockout_level, last_failure_at, updated_at)
       VALUES ('ip', $1, 0, 1, now(), now())
       ON CONFLICT (scope, key) DO UPDATE SET
         lockout_level = auth_lockouts.lockout_level + 1, failure_count = 0, last_failure_at = now(), updated_at = now()
       RETURNING lockout_level`,
      [network],
    );
    const minutes = lockDurationMinutes(locked.rows[0]!.lockout_level);
    await this.pool.query(
      `UPDATE auth_lockouts SET locked_until = now() + ($2 || ' minutes')::interval WHERE scope = 'ip' AND key = $1`,
      [network, String(minutes)],
    );
    await this.pool.query(`DELETE FROM auth_network_failures WHERE network_key = $1`, [network]);
    return minutes * 60;
  }

  /**
   * Ends a lock and its history: the owner has proved who they are another
   * way (a password reset from their mailbox), so nothing should hold them.
   */
  async release(scope: LockoutScope, key: string): Promise<void> {
    await this.pool.query(`DELETE FROM auth_lockouts WHERE scope = $1 AND key = $2`, [scope, this.storedKey(scope, key)]);
  }

  /** Successful login clears the account counter (IP decays naturally —
   *  clearing it would let one valid account reset a spray attack). */
  async clear(scope: LockoutScope, key: string): Promise<void> {
    await this.pool.query(
      `UPDATE auth_lockouts SET failure_count = 0, updated_at = now()
       WHERE scope = $1 AND key = $2 AND (locked_until IS NULL OR locked_until < now())`,
      [scope, this.storedKey(scope, key)],
    );
  }
}
