import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { createVerificationCode } from '../auth/verification-codes.js';

/** What `POST /auth/register` answers with, as much of it as we need. */
interface Registered {
  json: () => { user: { id: string }; tokens: { accessToken: string } };
}

/**
 * Take a freshly registered test account through email confirmation.
 *
 * An unconfirmed account cannot write anything any more (see
 * `plugins/activation.ts`), which is true of a real signup too: the app holds
 * you on the verify screen until you type the code. Suites that register a user
 * and immediately post, like, buy or play were relying on a hole, so they have
 * to do what a person does.
 *
 * This walks the real endpoint rather than setting `email_verified_at` by hand,
 * for the same reason `pass2fa` walks the real enrollment: if confirmation ever
 * breaks, the suites that depend on it should break too, instead of quietly
 * testing a state the product can no longer reach. The only shortcut is reading
 * the code out of the database instead of out of an inbox — `createVerificationCode`
 * is the very function the mailer calls, so the code is minted the usual way.
 *
 * Every call gets its own address because the endpoint is rate limited per IP
 * (10/min) and a suite that makes a dozen players would otherwise throttle
 * itself on a limit that has nothing to do with what it is testing.
 */
export async function activate(app: FastifyInstance, pool: pg.Pool, registered: Registered): Promise<void> {
  const { user, tokens } = registered.json();
  const code = await createVerificationCode(pool, user.id);
  const res = await app.inject({
    method: 'POST',
    url: '/auth/verify-email-code',
    headers: { authorization: `Bearer ${tokens.accessToken}` },
    payload: { code },
    remoteAddress: nextAddress(),
  });
  if (res.statusCode !== 200) {
    throw new Error(`activating ${user.id} failed (${res.statusCode}): ${res.body}`);
  }
}

let seq = 0;

/** A fresh 10.99.x.y for each confirmation, so none of them share a bucket. */
function nextAddress(): string {
  const n = seq++;
  return `10.99.${Math.floor(n / 250) % 250}.${(n % 250) + 1}`;
}
