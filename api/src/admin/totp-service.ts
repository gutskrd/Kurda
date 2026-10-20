import type pg from 'pg';
import { lockDurationMinutes } from '../auth/lockout.js';
import { generateSecret, matchTotpStep, otpauthUri } from './totp.js';

/** How long a session stays 2FA-verified before a code is asked for again. */
export const VERIFICATION_TTL_MS = 12 * 60 * 60 * 1000;

/** Wrong codes, inside the window below, that lock the second factor. */
export const TOTP_MAX_FAILURES = 5;
/** Wrong codes older than this no longer count toward a lock. */
export const TOTP_FAILURE_WINDOW_MINUTES = 15;

/**
 * What checking a code came to. `locked` says for how long, so the client can
 * show it; a wrong code and a code already used are the same `invalid`.
 */
export type CodeCheck = { ok: true } | { ok: false; reason: 'invalid' } | { ok: false; reason: 'locked'; retryAfterSec: number };

interface CodeRow {
  secret: string;
  confirmed_at: Date | null;
  last_used_step: string | null;
  failed_attempts: number;
  last_failed_at: Date | null;
  lock_level: number;
  locked_until: Date | null;
}

const secondsUntil = (when: Date): number => Math.max(1, Math.ceil((when.getTime() - Date.now()) / 1000));

/** What the gate needs to know about one session. */
export interface TotpState {
  /** a secret exists and was confirmed with a live code */
  enrolled: boolean;
  /** THIS login session passed a code check recently */
  verified: boolean;
}

/**
 * Admin TOTP enrollment + verification (KUR-099). Enrolling (re)generates an
 * unconfirmed secret; the admin must confirm with a live code before it counts,
 * and only a confirmed secret satisfies the mandatory-2FA guard.
 *
 * Enrollment alone is not enough to reach the admin panel: a session must also
 * have passed a code check, recorded per refresh-token family so it is per login
 * rather than per account. Verifying on one device therefore does not admit a
 * session opened elsewhere with the same password.
 */
export class AdminTotpService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Generate a new secret (unconfirmed) and return it + the provisioning URI.
   * A lock from wrong codes stays: a new secret is not a way around it.
   */
  async enroll(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const secret = generateSecret();
    const label = await this.label(userId);
    await this.pool.query(
      `INSERT INTO admin_totp (user_id, secret, confirmed_at)
       VALUES ($1, $2, NULL)
       ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, confirmed_at = NULL, created_at = now(),
         last_used_step = NULL`,
      [userId, secret],
    );
    return { secret, otpauthUri: otpauthUri(secret, label) };
  }

  /**
   * Confirm enrollment with a live code; marks the secret usable. Entering it
   * proves possession now, so it also marks this session verified — the code
   * cannot be entered a second time for that.
   */
  async confirm(userId: string, code: string, familyId?: string): Promise<CodeCheck> {
    const res = await this.checkCode(userId, code, { confirming: true });
    if (res.ok) await this.markVerified(userId, familyId);
    return res;
  }

  /**
   * Enrollment and this session's verification, in one round trip.
   *
   * A session with no family id (a token minted before families, or any path
   * that omits the claim) can never be recorded as verified, so it reports
   * unverified and fails closed rather than being waved through.
   */
  async state(userId: string, familyId: string | undefined): Promise<TotpState> {
    const res = await this.pool.query<{ enrolled: boolean; verified: boolean }>(
      `SELECT
         EXISTS (SELECT 1 FROM admin_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL) AS enrolled,
         EXISTS (SELECT 1 FROM admin_totp_verifications
                  WHERE user_id = $1 AND family_id = $2::uuid AND verified_at > now() - ($3 || ' milliseconds')::interval)
           AS verified`,
      [userId, familyId ?? null, String(VERIFICATION_TTL_MS)],
    );
    const row = res.rows[0];
    return { enrolled: row?.enrolled ?? false, verified: (row?.verified ?? false) && Boolean(familyId) };
  }

  /** Forget this session's verification (used on sign-out of the admin panel). */
  async clearVerification(userId: string, familyId: string | undefined): Promise<void> {
    if (!familyId) return;
    await this.pool.query(
      `DELETE FROM admin_totp_verifications WHERE user_id = $1 AND family_id = $2::uuid`,
      [userId, familyId],
    );
  }

  async isConfirmed(userId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM admin_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL`,
      [userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Verify a login code against the confirmed secret and, on success, mark this
   * session verified. `invalid` for a wrong code, a code already used, or an
   * unenrolled admin; `locked` after too many wrong ones.
   */
  async verify(userId: string, code: string, familyId?: string): Promise<CodeCheck> {
    const res = await this.checkCode(userId, code, { confirming: false });
    if (res.ok) await this.markVerified(userId, familyId);
    return res;
  }

  /**
   * Check a code under a row lock, so racing requests share one count.
   *
   * A code is good once: its time step must be later than the last one
   * accepted, or a code read over a shoulder (or out of a log) could be
   * entered again while it is still current. Wrong codes are counted, and
   * TOTP_MAX_FAILURES of them inside the window lock the second factor —
   * fifteen minutes the first time, doubling each time after (the same ladder
   * as the sign-in lockout) — because six digits can otherwise be guessed by
   * whoever has the password. A right code clears both.
   */
  private async checkCode(userId: string, code: string, opts: { confirming: boolean }): Promise<CodeCheck> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<CodeRow>(
        `SELECT secret, confirmed_at, last_used_step, failed_attempts, last_failed_at, lock_level, locked_until
           FROM admin_totp WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const row = found.rows[0];
      // nothing to check against: there is no secret to guess either
      if (!row || (!opts.confirming && !row.confirmed_at)) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'invalid' };
      }
      if (row.locked_until && row.locked_until.getTime() > Date.now()) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'locked', retryAfterSec: secondsUntil(row.locked_until) };
      }

      const step = matchTotpStep(row.secret, code);
      const lastUsed = row.last_used_step === null ? null : Number(row.last_used_step);
      if (step === null || (lastUsed !== null && step <= lastUsed)) {
        const recent =
          row.last_failed_at !== null && Date.now() - row.last_failed_at.getTime() < TOTP_FAILURE_WINDOW_MINUTES * 60_000;
        const failures = (recent ? row.failed_attempts : 0) + 1;
        if (failures >= TOTP_MAX_FAILURES) {
          const level = row.lock_level + 1;
          const locked = await client.query<{ locked_until: Date }>(
            `UPDATE admin_totp
                SET failed_attempts = 0, last_failed_at = now(), lock_level = $2,
                    locked_until = now() + ($3 || ' minutes')::interval
              WHERE user_id = $1
              RETURNING locked_until`,
            [userId, level, String(lockDurationMinutes(level))],
          );
          await client.query('COMMIT');
          return { ok: false, reason: 'locked', retryAfterSec: secondsUntil(locked.rows[0]!.locked_until) };
        }
        await client.query(`UPDATE admin_totp SET failed_attempts = $2, last_failed_at = now() WHERE user_id = $1`, [
          userId,
          failures,
        ]);
        await client.query('COMMIT');
        return { ok: false, reason: 'invalid' };
      }

      await client.query(
        `UPDATE admin_totp
            SET last_used_step = $2, failed_attempts = 0, last_failed_at = NULL, lock_level = 0, locked_until = NULL,
                confirmed_at = CASE WHEN $3 THEN COALESCE(confirmed_at, now()) ELSE confirmed_at END
          WHERE user_id = $1`,
        [userId, step, opts.confirming],
      );
      await client.query('COMMIT');
      return { ok: true };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Record that this login session passed a code check. */
  private async markVerified(userId: string, familyId: string | undefined): Promise<void> {
    if (familyId) {
      await this.pool.query(
        `INSERT INTO admin_totp_verifications (user_id, family_id, verified_at)
         VALUES ($1, $2::uuid, now())
         ON CONFLICT (user_id, family_id) DO UPDATE SET verified_at = now()`,
        [userId, familyId],
      );
      // opportunistic sweep: expired rows are dead weight and nothing else
      // would ever remove them
      await this.pool
        .query(
          `DELETE FROM admin_totp_verifications WHERE verified_at < now() - ($1 || ' milliseconds')::interval`,
          [String(VERIFICATION_TTL_MS)],
        )
        .catch(() => undefined);
    }
  }

  private async label(userId: string): Promise<string> {
    const res = await this.pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    return res.rows[0]?.email ?? userId;
  }
}
