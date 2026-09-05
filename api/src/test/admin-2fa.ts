import type { FastifyInstance } from 'fastify';
import { totpCode } from '../admin/totp.js';

/**
 * Take an admin's token through the real 2FA flow so a suite can reach /admin.
 *
 * Every admin route is now gated on confirmed AND session-verified 2FA, so a
 * suite that only grants a role gets 403s. This walks the actual endpoints
 * rather than writing the rows directly: if enrollment ever breaks, the suites
 * that depend on it should break too, instead of quietly testing a state the
 * product can no longer reach.
 *
 * Returns the secret, so a test can generate further codes (a re-verify after
 * expiry, for instance).
 */
export async function pass2fa(app: FastifyInstance, token: string, remoteAddress = '10.99.9.1'): Promise<string> {
  const post = (url: string, payload?: unknown) =>
    app.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
      remoteAddress,
    });

  const enrolled = await post('/admin/2fa/enroll');
  if (enrolled.statusCode !== 200) {
    throw new Error(`2FA enroll failed (${enrolled.statusCode}): ${enrolled.body}`);
  }
  const { secret } = enrolled.json() as { secret: string };

  const confirmed = await post('/admin/2fa/confirm', { code: totpCode(secret) });
  if (confirmed.statusCode !== 200) {
    throw new Error(`2FA confirm failed (${confirmed.statusCode}): ${confirmed.body}`);
  }
  return secret;
}
