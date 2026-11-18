import type { FastifyInstance } from 'fastify';
import { totpCode } from '../admin/totp.js';

/**
 * Takes an admin's token through the real 2FA flow so a suite can reach /admin, which requires confirmed and
 * session-verified 2FA. It walks the actual endpoints, so suites break if enrollment does. Returns the secret for
 * further codes, such as a re-verify after expiry.
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
