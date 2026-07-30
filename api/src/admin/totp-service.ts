import type pg from 'pg';
import { generateSecret, otpauthUri, verifyTotp } from './totp.js';

/**
 * Admin TOTP enrollment + verification (KUR-099). Enrolling (re)generates an
 * unconfirmed secret; the admin must confirm with a live code before it counts,
 * and only a confirmed secret satisfies the mandatory-2FA guard. Re-enrolling
 * resets confirmation, so a lost device can be re-provisioned.
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

  async isConfirmed(userId: string): Promise<boolean> {
    const res = await this.pool.query(
      `SELECT 1 FROM admin_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL`,
      [userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Verify a login code — only against a confirmed secret. */
  async verify(userId: string, code: string): Promise<boolean> {
    const res = await this.pool.query<{ secret: string }>(
      `SELECT secret FROM admin_totp WHERE user_id = $1 AND confirmed_at IS NOT NULL`,
      [userId],
    );
    const secret = res.rows[0]?.secret;
    return secret ? verifyTotp(secret, code) : false;
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
