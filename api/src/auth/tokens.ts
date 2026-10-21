import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type pg from 'pg';
import type { AppConfig } from '../config/env.js';
import { knownHash } from './known-devices.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
/**
 * How long a session lasts after it was last used when its sign-in asked not
 * to be remembered ("Remember me" left off): the browser forgets it when the
 * window closes, so the server need not keep it for a month after.
 */
export const UNREMEMBERED_TTL_DAYS = 1;
/**
 * The longest a session lasts, however often it is refreshed: each refresh
 * token lives REFRESH_TOKEN_TTL_DAYS, but never past this many days after the
 * sign-in that began its family. A stolen refresh token cannot be kept alive
 * for ever by refreshing it, and everyone signs in again now and then.
 */
export const SESSION_MAX_DAYS = 90;
/** Tolerated clock skew when validating access tokens. */
export const CLOCK_SKEW_SECONDS = 60;

export interface AccessTokenClaims {
  sub: string;
  /** users.token_version — bumping it force-logs-out issued tokens (KUR-016). */
  ver: number;
  /** refresh_tokens.family_id this access token belongs to (KUR-022). */
  fam?: string;
}

function secretKey(config: AppConfig): Uint8Array {
  return new TextEncoder().encode(config.JWT_SECRET);
}

export async function issueAccessToken(
  config: AppConfig,
  claims: AccessTokenClaims,
): Promise<string> {
  return new SignJWT({ ver: claims.ver, ...(claims.fam ? { fam: claims.fam } : {}) })
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
      // Name the algorithm rather than letting the token's own header choose it.
      // jose will not verify an HMAC token against anything but an HMAC key, so
      // this is not closing an open door — but "the attacker picks the algorithm"
      // is how algorithm confusion starts, and the cost of saying which one is
      // one line.
      algorithms: ['HS256'],
    });
    if (!payload.sub || typeof payload.ver !== 'number') return null;
    return {
      sub: payload.sub,
      ver: payload.ver,
      ...(typeof payload.fam === 'string' ? { fam: payload.fam } : {}),
    };
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

/** Where a session was opened, and how: what a sign-in says, and a rotation carries along. */
export interface SessionOptions {
  /** continue this rotation chain rather than start a new session */
  familyId?: string;
  /** what the devices list calls it ("Chrome on Windows") */
  deviceName?: string;
  /** the app's `X-Device-Id`, stored as the account's keyed hash of it */
  deviceId?: string | null;
  /** the hash itself, as a rotation carries it (wins over `deviceId`) */
  deviceHash?: string | null;
  /** the sign-in asked not to be remembered: UNREMEMBERED_TTL_DAYS, not REFRESH_TOKEN_TTL_DAYS */
  shortLived?: boolean;
  sessionStartedAt?: Date;
}

/** The device a session is listed under for one account (`knownHash`, as known_devices keeps it). */
export function sessionDeviceHash(config: AppConfig, userId: string, deviceId: string): string {
  return knownHash(config.JWT_SECRET, userId, 'device', deviceId);
}

/**
 * Creates a refresh token (returned raw once, stored hashed) and an
 * access token. familyId starts a new rotation chain unless continuing
 * an existing one (KUR-015 rotation).
 */
export async function issueTokenPair(
  config: AppConfig,
  executor: Pick<pg.Pool, 'query'>,
  user: { id: string; token_version?: number },
  opts: SessionOptions = {},
): Promise<IssuedTokens> {
  const raw = randomBytes(32).toString('base64url');
  const familyId = opts.familyId ?? randomUUID();
  // a rotation carries its session's start along; a sign-in starts one
  const startedAt = opts.sessionStartedAt ?? new Date();
  const day = 24 * 3_600_000;
  const shortLived = opts.shortLived === true;
  const lifetimeDays = shortLived ? UNREMEMBERED_TTL_DAYS : REFRESH_TOKEN_TTL_DAYS;
  const expiresAt = new Date(
    Math.min(Date.now() + lifetimeDays * day, startedAt.getTime() + SESSION_MAX_DAYS * day),
  );
  const deviceHash = opts.deviceHash ?? (opts.deviceId ? sessionDeviceHash(config, user.id, opts.deviceId) : null);
  const inserted = await executor.query<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, device_name, expires_at, session_started_at, device_hash, short_lived)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [user.id, hashRefreshToken(raw), familyId, opts.deviceName ?? null, expiresAt, startedAt, deviceHash, shortLived],
  );
  const accessToken = await issueAccessToken(config, {
    sub: user.id,
    // MUST mirror users.token_version or the auth guard rejects the
    // fresh token right after any forced-logout bump (password reset)
    ver: user.token_version ?? 0,
    fam: familyId,
  });
  return {
    accessToken,
    refreshToken: raw,
    accessExpiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenId: (inserted.rows[0] as { id: string }).id,
    familyId,
  };
}
