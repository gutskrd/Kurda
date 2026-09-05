import type pg from 'pg';
import { generateSecret, otpauthUri, verifyTotp } from './totp.js';

/** How long a session stays 2FA-verified before a code is asked for again. */
export const VERIFICATION_TTL_MS = 12 * 60 * 60 * 1000;

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

  /** Generate a new secret (unconfirmed) and return it + the provisioning URI. */
  async enroll(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const secret = generateSecret();
    const label = await this.label(userId);
    await this.pool.query(
      `INSERT INTO admin_totp (user_id, secret, confirmed_at)
       VALUES ($1, $2, NULL)
       ON CONFLICT (user_id) DO UPDATE SET secret = EXCLUDED.secret, confirmed_at = NULL, created_at = now()`,
      [userId, secret],
    );
    return { secret, otpauthUri: otpauthUri(secret, label) };
  }

  /** Confirm enrollment with a live code; marks the secret usable. */
  async confirm(userId: string, code: string): Promise<boolean> {
    const secret = await this.secretFor(userId);
    if (!secret || !verifyTotp(secret, code)) return false;
    await this.pool.query(`UPDATE admin_totp SET confirmed_at = now() WHERE user_id = $1`, [userId]);
    return true;
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
   * session verified. Returns false for a bad code or an unenrolled admin.
   */
  async verify(userId: string, code: string, familyId?: string): Promise<boolean> {
    const res = await this.pool.query<{ secret: string }>(
      `SELECT secret FROM admin_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL`,
      [userId],
    );
    const secret = res.rows[0]?.secret;
    if (!secret || !verifyTotp(secret, code)) return false;
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
    return true;
  }

  private async secretFor(userId: string): Promise<string | null> {
    const res = await this.pool.query<{ secret: string }>(
      `SELECT secret FROM admin_totp WHERE user_id = $1`,
      [userId],
    );
    return res.rows[0]?.secret ?? null;
  }

  private async label(userId: string): Promise<string> {
    const res = await this.pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [userId]);
    return res.rows[0]?.email ?? userId;
  }
}
