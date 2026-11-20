import type { FastifyRequest } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { APPEAL_TOKEN_TTL_SECONDS } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';

/**
 * The token a suspended account gets instead of a session. A suspended or banned person must still be able to read why
 * and appeal (notices and appeal access stay available during a suspension), but signing them in would open the whole
 * app. So login answers 403 ACCOUNT_SUSPENDED with this token, which reaches only `GET /me/standing`, `POST
 * /me/appeals`, a copy of their data (`GET` and `POST /me/export`) and deleting the account (`DELETE /me`).
 *
 * Signed with the access-token secret but a different issuer, so each check refuses the other's token. It carries the
 * account's `token_version`, so anything that ends sessions (password reset, new ban) ends it too.
 */
const ISSUER = 'kurda-appeal';

export interface AppealClaims {
  userId: string;
  tokenVersion: number;
}

function key(config: AppConfig): Uint8Array {
  return new TextEncoder().encode(config.JWT_SECRET);
}

export async function signAppealToken(config: AppConfig, user: { id: string; token_version: number }): Promise<string> {
  return new SignJWT({ ver: user.token_version, scope: 'appeal' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setExpirationTime(`${APPEAL_TOKEN_TTL_SECONDS}s`)
    .sign(key(config));
}

/** The account an appeal token speaks for, or null for anything else. */
export async function verifyAppealToken(config: AppConfig, token: string): Promise<AppealClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(config), { issuer: ISSUER, algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.ver !== 'number' || payload.scope !== 'appeal') return null;
    return { userId: payload.sub, tokenVersion: payload.ver };
  } catch {
    return null;
  }
}

/** Who a request speaks for on a route open to a suspended person too. */
export interface AccountCaller {
  id: string;
  guest: boolean;
  emailVerified: boolean;
  /** signed in through the appeal token rather than a session */
  appealToken: boolean;
}

/**
 * The caller of a route a suspended or banned person may still reach with their appeal token (standing and appeals, a
 * copy of their data, deleting the account: rights that do not end with a ban, shared/src/account-hold.ts
 * `APPEAL_TOKEN_EXTRA_PATHS`): the signed-in user, or the account a live appeal token names. Null otherwise.
 */
export async function accountCaller(config: AppConfig, req: FastifyRequest): Promise<AccountCaller | null> {
  if (req.user) return { id: req.user.id, guest: req.user.guest === true, emailVerified: req.user.emailVerified, appealToken: false };
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const claims = await verifyAppealToken(config, header.slice('Bearer '.length));
  if (!claims) return null;
  const u = await req.server.db.query<{ token_version: number; guest: boolean; email_verified_at: Date | null }>(
    `SELECT token_version, guest, email_verified_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [claims.userId],
  );
  const row = u.rows[0];
  if (!row || row.token_version !== claims.tokenVersion) return null;
  return { id: claims.userId, guest: row.guest, emailVerified: row.email_verified_at !== null, appealToken: true };
}

/** `accountCaller`, or the refusal a route without a caller answers: 403 for a disabled account's session, else 401. */
export async function requireAccountCaller(config: AppConfig, req: FastifyRequest): Promise<AccountCaller> {
  const caller = await accountCaller(config, req);
  if (caller) return caller;
  if (req.authFailure === 'account_disabled') {
    throw new AppError('ACCOUNT_DISABLED', 403, 'this account is disabled — sign in again to see why');
  }
  throw new AppError('UNAUTHORIZED', 401, 'authentication required');
}
