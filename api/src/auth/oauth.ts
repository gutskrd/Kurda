import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type pg from 'pg';
import { normalizeKurdish } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { canonicalUsername } from '../users/username.js';
import { issueTokenPair, type IssuedTokens } from './tokens.js';
import { toPublicUser, type PublicUser } from './service.js';
import type { UserRow } from '../users/repository.js';

export type OAuthProvider = 'google' | 'apple';

interface ProviderSpec {
  issuers: string[];
  jwksUrl: string;
}

const PROVIDERS: Record<OAuthProvider, ProviderSpec> = {
  google: {
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
  },
  apple: {
    issuers: ['https://appleid.apple.com'],
    jwksUrl: 'https://appleid.apple.com/auth/keys',
  },
};

export interface ProviderIdentity {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

/** Test seam: production resolves keys from the provider's JWKS URL. */
export type JwksResolver = (provider: OAuthProvider) => JWTVerifyGetKey;

const remoteJwks = new Map<OAuthProvider, JWTVerifyGetKey>();
export const defaultJwksResolver: JwksResolver = (provider) => {
  let jwks = remoteJwks.get(provider);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(PROVIDERS[provider].jwksUrl));
    remoteJwks.set(provider, jwks);
  }
  return jwks;
};

function allowedAudiences(config: AppConfig, provider: OAuthProvider): string[] {
  const raw = provider === 'google' ? config.GOOGLE_CLIENT_IDS : config.APPLE_CLIENT_IDS;
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function verifyProviderToken(
  config: AppConfig,
  provider: OAuthProvider,
  idToken: string,
  jwksResolver: JwksResolver = defaultJwksResolver,
): Promise<ProviderIdentity> {
  const audiences = allowedAudiences(config, provider);
  if (audiences.length === 0) {
    throw new AppError('OAUTH_NOT_CONFIGURED', 503, `${provider} sign-in is not configured`);
  }
  try {
    const { payload } = await jwtVerify(idToken, jwksResolver(provider), {
      issuer: PROVIDERS[provider].issuers,
      audience: audiences,
    });
    if (!payload.sub) throw new Error('missing sub');
    return {
      provider,
      providerUserId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      // apple sends email_verified as string "true"; google as boolean
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name: typeof payload.name === 'string' ? payload.name : null,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('INVALID_OAUTH_TOKEN', 401, `invalid ${provider} token`);
  }
}

async function uniqueUsername(pool: pg.Pool, base: string): Promise<string> {
  const cleaned =
    canonicalUsername(normalizeKurdish(base).replace(/[^A-Za-z0-9_êîûçşÊÎÛÇŞ]/g, '_')) ??
    `learner_${Date.now().toString(36)}`;
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? cleaned : `${cleaned.slice(0, 25)}_${i}`;
    const taken = await pool.query(
      `SELECT 1 FROM users WHERE username = $1 AND deleted_at IS NULL`,
      [candidate],
    );
    if (taken.rowCount === 0) return candidate;
  }
  return `learner_${Date.now().toString(36)}`;
}

export class OAuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly pool: pg.Pool,
    private readonly jwksResolver: JwksResolver = defaultJwksResolver,
  ) {}

  async signIn(
    provider: OAuthProvider,
    idToken: string,
    deviceName?: string,
  ): Promise<{ user: PublicUser; tokens: IssuedTokens; created: boolean }> {
    const identity = await verifyProviderToken(this.config, provider, idToken, this.jwksResolver);

    // 1) known identity → login
    const known = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2`,
      [identity.provider, identity.providerUserId],
    );
    if (known.rows[0]) {
      const user = await this.activeUser(known.rows[0].user_id);
      const tokens = await issueTokenPair(this.config, this.pool, user, { deviceName });
      return { user: toPublicUser(user), tokens, created: false };
    }

    // 2) email matches an existing account → link, but only when
    //    ownership is proven on BOTH sides (provider-verified email and
    //    our own verification) — otherwise an attacker could pre-register
    //    an unverified account with the victim's email and capture links
    if (identity.email && identity.emailVerified) {
      const existing = await this.pool.query<UserRow & { email_verified_at: Date | null }>(
        `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [identity.email],
      );
      const account = existing.rows[0];
      if (account) {
        if (!account.email_verified_at) {
          throw new AppError(
            'LINK_REQUIRES_VERIFIED_EMAIL',
            409,
            'an account with this email exists but is not verified — log in with your password and verify your email first',
          );
        }
        await this.link(account.id, identity);
        const tokens = await issueTokenPair(this.config, this.pool, account, { deviceName });
        return { user: toPublicUser(account), tokens, created: false };
      }
    }

    // 3) brand-new account (Apple relay emails land here naturally)
    const email =
      identity.email ?? `${identity.provider}_${identity.providerUserId}@noemail.kurda.app`;
    const username = await uniqueUsername(
      this.pool,
      identity.name ?? identity.email?.split('@')[0] ?? 'learner',
    );
    const created = await this.pool.query<UserRow>(
      `INSERT INTO users (email, username, display_name, email_verified_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [email, username, identity.name, identity.emailVerified ? new Date() : null],
    );
    const user = created.rows[0] as UserRow;
    await this.link(user.id, identity);
    const tokens = await issueTokenPair(this.config, this.pool, user, { deviceName });
    return { user: toPublicUser(user), tokens, created: true };
  }

  private async link(userId: string, identity: ProviderIdentity): Promise<void> {
    await this.pool.query(
      `INSERT INTO oauth_identities (user_id, provider, provider_user_id, email_at_link)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider, provider_user_id) DO NOTHING`,
      [userId, identity.provider, identity.providerUserId, identity.email],
    );
  }

  private async activeUser(id: string): Promise<UserRow> {
    const result = await this.pool.query<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL AND banned_at IS NULL`,
      [id],
    );
    const user = result.rows[0];
    if (!user) throw new AppError('ACCOUNT_DISABLED', 403, 'this account is disabled');
    return user;
  }
}
