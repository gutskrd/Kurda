import type { FastifyInstance } from 'fastify';
import { totpCode } from './totp.js';

/**
 * Put a test's admin through 2FA, the way a real one goes through it.
 *
 * Staff routes require a confirmed TOTP enrollment and a session that has used
 * it. Several integration tests predate that and were reaching admin surface
 * with a role and nothing else — which worked only because those particular
 * routes were outside /admin and so escaped the gate. Closing that hole made
 * them fail, correctly.
 *
 * The fix is for the tests to do what an admin does, not for the gate to make an
 * exception: granting the role and skipping the second factor would leave the
 * suite proving that a password alone is enough, which is the thing that must
 * not be true.
 *
 * Call it after granting the roles and before the first staff request.
 */
export async function passAdmin2fa(app: FastifyInstance, accessToken: string): Promise<string> {
  const headers = { authorization: `Bearer ${accessToken}` };
  const enrolled = await app.inject({ method: 'POST', url: '/admin/2fa/enroll', headers });
  if (enrolled.statusCode !== 200) {
    throw new Error(`2FA enrollment failed (${enrolled.statusCode}): ${enrolled.body}`);
  }
  const secret = enrolled.json().secret as string;
  const confirmed = await app.inject({
    method: 'POST',
    url: '/admin/2fa/confirm',
    headers,
    payload: { code: totpCode(secret) },
  });
  if (confirmed.statusCode !== 200) {
    throw new Error(`2FA confirmation failed (${confirmed.statusCode}): ${confirmed.body}`);
  }
  return secret;
}
