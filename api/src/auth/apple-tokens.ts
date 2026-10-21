import { createPrivateKey, createSign } from 'node:crypto';
import type pg from 'pg';
import type { AppConfig } from '../config/env.js';
import { seal, unseal } from '../security/at-rest.js';

/**
 * What Sign in with Apple gives the app beyond the sign-in itself, and taking
 * it back when the account goes.
 *
 * App Store guideline 5.1.1(v): an app that offers Sign in with Apple must,
 * when someone deletes their account, revoke what Apple issued it for them,
 * through Apple's REST API. Revoking needs a token: the identity token the
 * app signs in with will not do, so the app also sends the one-time
 * authorization code Apple gives it alongside, and the server exchanges that
 * here for a refresh token, keeps it encrypted (security/at-rest.ts) on the
 * Apple identity, and hands it back to Apple to revoke when the deletion
 * becomes final (gdpr/service.ts).
 *
 * Both calls authenticate with a client secret: a short JWT signed with the
 * deployment's Sign in with Apple key. Without that key configured (APPLE_TEAM_ID,
 * APPLE_KEY_ID, APPLE_PRIVATE_KEY) `appleTokens` is null and nothing here runs.
 *
 * Neither call is ever allowed to stand in anyone's way: a sign-in does not
 * wait for the exchange, and a deletion goes ahead when Apple refuses or does
 * not answer. A failure is logged as a warning, and that is all it does.
 */

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
/** The audience of a client secret: Apple itself. */
const APPLE_AUDIENCE = 'https://appleid.apple.com';
/** The app's bundle id, which is the client a native Sign in with Apple authorizes. */
export const DEFAULT_APPLE_CLIENT_ID = 'app.hevalo.mobile';
/** A client secret is minted for each call, so it need not outlive one; Apple allows up to six months. */
const CLIENT_SECRET_TTL_S = 3_600;
/** Nobody waits on either call; this only stops one from hanging on. */
const APPLE_TIMEOUT_MS = 10_000;
/** What a kept refresh token is sealed for. */
const SEAL_PURPOSE = 'apple-refresh-token';

type FetchLike = typeof fetch;

export interface AppleSigningKey {
  teamId: string;
  keyId: string;
  /** the .p8 key, as PEM */
  privateKey: string;
  /** the client the tokens belong to */
  clientId: string;
}

/** The deployment's Sign in with Apple key, or null while any part of it is unset. */
export function appleSigningKey(config: AppConfig): AppleSigningKey | null {
  const teamId = config.APPLE_TEAM_ID?.trim();
  const keyId = config.APPLE_KEY_ID?.trim();
  const pem = config.APPLE_PRIVATE_KEY?.trim();
  if (!teamId || !keyId || !pem) return null;
  // the authorization code belongs to the client that asked Apple for it: the
  // app, whose bundle id is already the audience its identity tokens are checked against
  const audience = (config.APPLE_CLIENT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .find(Boolean);
  const clientId = config.APPLE_CLIENT_ID?.trim() || audience || DEFAULT_APPLE_CLIENT_ID;
  // a dashboard that takes one line keeps the key's line breaks as a literal "\n"
  return { teamId, keyId, privateKey: pem.replace(/\\n/g, '\n'), clientId };
}

function base64url(json: unknown): string {
  return Buffer.from(JSON.stringify(json), 'utf8').toString('base64url');
}

/**
 * The client secret Apple's token and revoke endpoints ask for: a JWT signed
 * ES256 with the Sign in with Apple key, naming the team as its issuer, the
 * client as its subject and Apple as its audience, the key by its id. ES256
 * wants the raw r‖s signature (IEEE P1363), not the DER node signs by default.
 */
export function appleClientSecret(key: AppleSigningKey, now: number = Date.now()): string {
  const iat = Math.floor(now / 1000);
  const header = { alg: 'ES256', kid: key.keyId };
  const payload = { iss: key.teamId, iat, exp: iat + CLIENT_SECRET_TTL_S, aud: APPLE_AUDIENCE, sub: key.clientId };
  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const signature = createSign('SHA256')
    .update(signingInput)
    .sign({ key: createPrivateKey(key.privateKey), dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${signature.toString('base64url')}`;
}

export interface AppleTokenDeps {
  /** Test seam: the requests to Apple. */
  fetch?: FetchLike;
  log?: { warn: (obj: unknown, msg: string) => void };
  timeoutMs?: number;
}

export class AppleTokens {
  private readonly fetch: FetchLike;
  private readonly timeoutMs: number;

  constructor(
    private readonly key: AppleSigningKey,
    private readonly pool: pg.Pool,
    /** the server secret the kept tokens are sealed under */
    private readonly sealSecret: string,
    private readonly deps: AppleTokenDeps = {},
  ) {
    this.fetch = deps.fetch ?? ((input, init) => fetch(input, init));
    this.timeoutMs = deps.timeoutMs ?? APPLE_TIMEOUT_MS;
  }

  /**
   * On an Apple sign-in: exchanges the authorization code the app sent for a
   * refresh token and keeps it, sealed, on that Apple identity. A later
   * sign-in replaces it with its own (each is as good for revoking). Never
   * throws; the sign-in does not wait for it.
   */
  async keep(providerUserId: string, authorizationCode: string): Promise<void> {
    try {
      const res = await this.post(APPLE_TOKEN_URL, { grant_type: 'authorization_code', code: authorizationCode });
      const body = (await res.json().catch(() => null)) as { refresh_token?: unknown; error?: unknown } | null;
      if (!res.ok || typeof body?.refresh_token !== 'string' || body.refresh_token === '') {
        // Apple's error is a code such as invalid_grant, never anything secret
        const error = typeof body?.error === 'string' ? body.error : null;
        this.deps.log?.warn({ status: res.status, error }, 'Apple did not exchange a sign-in code for a refresh token');
        return;
      }
      await this.pool.query(
        `UPDATE oauth_identities SET refresh_token_sealed = $2
          WHERE provider = 'apple' AND provider_user_id = $1`,
        [providerUserId, seal(this.sealSecret, SEAL_PURPOSE, body.refresh_token)],
      );
    } catch (err) {
      this.deps.log?.warn({ err }, 'could not exchange an Apple sign-in code for a refresh token');
    }
  }

  /**
   * As an account is deleted for good: asks Apple to revoke the refresh token
   * kept for each of its Apple identities, which ends Sign in with Apple for
   * this app as well. To be called while the identities still exist, before
   * the account is anonymized. An identity with no token kept (signed in
   * before tokens were kept, or the exchange failed) has nothing to revoke.
   * Never throws: the deletion goes ahead whatever Apple answers.
   */
  async revokeFor(userId: string): Promise<void> {
    let kept: Array<{ refresh_token_sealed: string }>;
    try {
      const result = await this.pool.query<{ refresh_token_sealed: string }>(
        `SELECT refresh_token_sealed FROM oauth_identities
          WHERE user_id = $1 AND provider = 'apple' AND refresh_token_sealed IS NOT NULL`,
        [userId],
      );
      kept = result.rows;
    } catch (err) {
      this.deps.log?.warn({ err, userId }, 'could not read the Apple tokens of a closing account');
      return;
    }
    for (const row of kept) {
      const token = unseal(this.sealSecret, SEAL_PURPOSE, row.refresh_token_sealed);
      if (token === null) {
        // sealed under a JWT secret that has since been rotated
        this.deps.log?.warn({ userId }, 'a kept Apple refresh token could not be decrypted; it was not revoked');
        continue;
      }
      try {
        const res = await this.post(APPLE_REVOKE_URL, { token, token_type_hint: 'refresh_token' });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
          const error = typeof body?.error === 'string' ? body.error : null;
          this.deps.log?.warn({ userId, status: res.status, error }, 'Apple refused to revoke a closing account’s token');
        }
      } catch (err) {
        this.deps.log?.warn({ err, userId }, 'could not ask Apple to revoke a closing account’s token');
      }
    }
  }

  private post(url: string, params: Record<string, string>): Promise<Response> {
    const form = new URLSearchParams({
      ...params,
      client_id: this.key.clientId,
      client_secret: appleClientSecret(this.key),
    });
    return this.fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}

/**
 * The deployment's Apple tokens, or null without a Sign in with Apple key:
 * then nothing is exchanged, kept or revoked, and no request goes to Apple.
 */
export function appleTokens(config: AppConfig, pool: pg.Pool, deps: AppleTokenDeps = {}): AppleTokens | null {
  const key = appleSigningKey(config);
  return key ? new AppleTokens(key, pool, config.JWT_SECRET, deps) : null;
}
