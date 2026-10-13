import { SignJWT, jwtVerify } from 'jose';
import { APPEAL_TOKEN_TTL_SECONDS } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';

/**
 * The token a suspended account gets instead of a session.
 *
 * A suspended or banned person still has to be able to read why, and to ask for
 * a review (Santa Clara: notices and appeal access stay available during a
 * suspension). Signing them in would hand them the whole app, so login answers
 * 403 ACCOUNT_SUSPENDED with this instead: it can read `GET /me/standing` and
 * file `POST /me/appeals`, and nothing else.
 *
 * It is signed with the same secret as access tokens but a different issuer, so
 * the access-token check (which insists on issuer `kurda-api`) refuses it on
 * every other route, and this check refuses an access token. It carries the
 * account's `token_version`, so anything that ends sessions (a password reset, a
 * new ban) ends it too.
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
