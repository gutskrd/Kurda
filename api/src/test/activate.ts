import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { createVerificationCode } from '../auth/verification-codes.js';

/** What `POST /auth/register` answers with, as much of it as we need. */
interface Registered {
  json: () => { user: { id: string }; tokens: { accessToken: string } };
}

/**
 * Takes a newly registered test account through email confirmation, since unconfirmed accounts can do nothing
 * (plugins/activation.ts), as for a real sign-up. It walks the real endpoint rather than setting `email_verified_at`, so
 * suites break if confirmation does; the only shortcut is reading the code from the database, minted by the mailer's
 * own `createVerificationCode`. Each call uses its own address, since the endpoint is limited per address.
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
