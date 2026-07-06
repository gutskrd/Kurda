import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type pg from 'pg';
import type { AppConfig } from '../config/env.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
/** Tolerated clock skew when validating access tokens. */
export const CLOCK_SKEW_SECONDS = 60;

export interface AccessTokenClaims {
  sub: string;
  /** users.token_version — bumping it force-logs-out issued tokens (KUR-016). */
  ver: number;
}

function secretKey(config: AppConfig): Uint8Array {
  return new TextEncoder().encode(config.JWT_SECRET);
}

export async function issueAccessToken(
  config: AppConfig,
  claims: AccessTokenClaims,
): Promise<string> {
  return new SignJWT({ ver: claims.ver })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('kurda-api')
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey(config));
}

export async function verifyAccessToken(
  config: AppConfig,
  token: string,
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(config), {
      issuer: 'kurda-api',
      clockTolerance: CLOCK_SKEW_SECONDS,
    });
    if (!payload.sub || typeof payload.ver !== 'number') return null;
    return { sub: payload.sub, ver: payload.ver };
  } catch {
    return null;
  }
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  /** refresh_tokens.id of the newly issued token (rotation bookkeeping). */
  refreshTokenId: string;
  familyId: string;
}

/**
 * Creates a refresh token (returned raw once, stored hashed) and an
 * access token. familyId starts a new rotation chain unless continuing
 * an existing one (KUR-015 rotation).
 */
export async function issueTokenPair(
  config: AppConfig,
  executor: Pick<pg.Pool, 'query'>,
  user: { id: string; tokenVersion?: number },
  opts: { familyId?: string; deviceName?: string } = {},
): Promise<IssuedTokens> {
  const raw = randomBytes(32).toString('base64url');
  const familyId = opts.familyId ?? randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 3_600_000);
  const inserted = await executor.query<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, device_name, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [user.id, hashRefreshToken(raw), familyId, opts.deviceName ?? null, expiresAt],
  );
  const accessToken = await issueAccessToken(config, {
    sub: user.id,
    ver: user.tokenVersion ?? 0,
  });
  return {
    accessToken,
    refreshToken: raw,
    accessExpiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenId: (inserted.rows[0] as { id: string }).id,
    familyId,
  };
}
