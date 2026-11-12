import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type pg from 'pg';
import { normalizeKurdish, stripControlChars } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { canonicalUsername } from '../users/username.js';
import { issueTokenPair, type IssuedTokens } from './tokens.js';
import { toPublicUser, type PublicUser } from './service.js';
import type { UserRow } from '../users/repository.js';
import { isBannedEmail } from '../moderation/ban-registry.js';
import { suspensionError } from '../moderation/suspension.js';
import { signupRejected } from './rejections.js';
import type { AppleTokens } from './apple-tokens.js';
import { GdprService } from '../gdpr/service.js';

export type OAuthProvider = 'google' | 'apple';

/** What the app sends besides the identity token on an Apple sign-in. */
export interface AppleSignInExtras {
  /** the one-time code Apple gave the app with the token, for a refresh token to revoke later */
  authorizationCode?: string;
  /** the name the person shared, which Apple gives the app on their first sign-in only */
  fullName?: string;
}

/** The longest display name an account can have (as PATCH /me allows). */
const DISPLAY_NAME_MAX = 60;

/** A name the app passed on, as a display name: plain text, or null when nothing is left of it. */
function displayNameFrom(raw: string | undefined): string | null {
  if (!raw) return null;
  const clean = stripControlChars(normalizeKurdish(raw)).replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX).trim();
  return clean || null;
}

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
  const candidates = Array.from({ length: 20 }, (_, i) => (i === 0 ? cleaned : `${cleaned.slice(0, 25)}_${i}`));
  // the first of them nobody has, asked in one query rather than one per try
  const free = await pool.query<{ candidate: string }>(
    `SELECT c.candidate FROM unnest($1::text[]) WITH ORDINALITY AS c(candidate, n)
      WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = c.candidate::citext AND deleted_at IS NULL)
        -- nor one held for the account that gave it up (migration username-history)
        AND NOT EXISTS (
          SELECT 1 FROM username_history h JOIN users u ON u.id = h.user_id
           WHERE h.username = c.candidate::citext AND h.held_until > now() AND u.deleted_at IS NULL)
      ORDER BY c.n LIMIT 1`,
    [candidates],
  );
  return free.rows[0]?.candidate ?? `learner_${Date.now().toString(36)}`;
}

export class OAuthService {
  constructor(
    private readonly config: AppConfig,
    private readonly pool: pg.Pool,
    private readonly jwksResolver: JwksResolver = defaultJwksResolver,
    /** keeps Apple's refresh token for revoking at deletion; null without Apple's key */
    private readonly apple: Pick<AppleTokens, 'keep'> | null = null,
  ) {}

  async signIn(
    provider: OAuthProvider,
    idToken: string,
    deviceName?: string,
    /** the app's `x-device-id`: the devices list lists the session under it */
    deviceId?: string | null,
    extras: AppleSignInExtras = {},
    /**
     * The guest signed in while asking (auth/guest.ts): an identity nobody has
     * claims that row rather than making a new one, so what was learned as a
     * guest is kept. An identity that already has an account signs that
     * account in as ever, and the guest row is simply left behind.
     */
    guestId: string | null = null,
  ): Promise<{ user: PublicUser; tokens: IssuedTokens; created: boolean }> {
    const identity = await verifyProviderToken(this.config, provider, idToken, this.jwksResolver);
    const signedIn = await this.signInAs(identity, deviceName, deviceId, extras, guestId);
    if (provider === 'apple' && extras.authorizationCode && this.apple) {
      // After the sign-in has succeeded, and not awaited: Apple being slow or
      // down must not hold it up. `keep` logs its own failures as warnings.
      void this.apple.keep(identity.providerUserId, extras.authorizationCode).catch(() => undefined);
    }
    return signedIn;
  }

  private async signInAs(
    identity: ProviderIdentity,
    deviceName: string | undefined,
    deviceId: string | null | undefined,
    extras: AppleSignInExtras,
    guestId: string | null,
  ): Promise<{ user: PublicUser; tokens: IssuedTokens; created: boolean }> {
    // 1) known identity → login
    const known = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2`,
      [identity.provider, identity.providerUserId],
    );
    if (known.rows[0]) {
      const user = await this.activeUser(known.rows[0].user_id);
      await this.refuseIfSuspended(user);
      const tokens = await issueTokenPair(this.config, this.pool, user, { deviceName, deviceId });
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
      let account = existing.rows[0];
      if (account && !account.email_verified_at) {
        // The provider has confirmed this address is the signer's; the
        // account here never confirmed it. It is not linked (that would hand
        // the account to whoever registered the address first), and it does
        // not stand in the way either: a sign-up that never confirmed is
        // ended (auth/pending-signups.ts) and this sign-in makes the account.
        // One that is more than that — staff, or already tied to a provider —
        // is left as it was, and answered as before.
        const ended = await new GdprService(this.pool).endUnconfirmedSignup(account.id);
        if (ended === 'kept') {
          throw new AppError(
            'LINK_REQUIRES_VERIFIED_EMAIL',
            409,
            'an account with this email exists but is not verified — log in with your password and verify your email first',
          );
        }
        account = undefined;
      }
      if (account) {
        await this.refuseIfSuspended(account);
        await this.link(account.id, identity);
        const tokens = await issueTokenPair(this.config, this.pool, account, { deviceName, deviceId });
        return { user: toPublicUser(account), tokens, created: false };
      }
    }

    // 3) brand-new account (Apple relay emails land here naturally)
    //
    // An address the provider has not confirmed is not this person's to
    // take: an account made under it would sit on somebody else's address,
    // and when that person later claimed it by a password reset, the
    // identity that made it would still sign in. So it is left out, as if
    // the provider had sent none, and the account gets the placeholder.
    const confirmedEmail = identity.emailVerified ? identity.email : null;
    // ...unless an account here already has that address: then this is most
    // likely its owner, and a second, empty account would only hide the first
    // from them. They are answered as sign-up answers an address in use.
    if (identity.email && !identity.emailVerified) {
      const taken = await this.pool.query(`SELECT 1 FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1`, [identity.email]);
      if ((taken.rowCount ?? 0) > 0) {
        throw new AppError(
          'REGISTRATION_FAILED',
          409,
          'unable to register with these details — if you already have an account, log in or reset your password',
        );
      }
    }
    const email = confirmedEmail ?? `${identity.provider}_${identity.providerUserId}@noemail.kurda.app`;
    // a permanently banned address does not come back through a provider either
    if (await isBannedEmail(this.pool, email)) throw signupRejected();
    // Apple's identity token never carries a name: the app passes on the one
    // the person shared, which Apple gives it on their first sign-in only. It
    // names a new account; an existing one keeps the name it has.
    const name = identity.name ?? (identity.provider === 'apple' ? displayNameFrom(extras.fullName) : null);

    // 3a) a guest asked: their row becomes the account, keeping its username
    //     and everything learned; `created` all the same, since to the app
    //     this identity has just become an account and the sign-up steps that
    //     follow one (the birth month question) are still to come
    if (guestId !== null) {
      const claimed = await this.claimGuest(guestId, email, name);
      if (claimed) {
        await this.link(claimed.id, identity);
        const tokens = await issueTokenPair(this.config, this.pool, claimed, { deviceName, deviceId });
        return { user: toPublicUser(claimed), tokens, created: true };
      }
      // not a guest any more (claimed elsewhere a moment ago): a new account, as for anyone
    }

    const username = await uniqueUsername(this.pool, name ?? confirmedEmail?.split('@')[0] ?? 'learner');
    let created: pg.QueryResult<UserRow>;
    try {
      created = await this.pool.query<UserRow>(
        `INSERT INTO users (email, username, display_name, email_verified_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        // The provider vouches for who this is. With an address it confirmed,
        // that is the address confirmed; with none, there is nothing to
        // confirm, and an account left "unconfirmed" under the placeholder
        // would be held at the gate (plugins/activation.ts) with no code it
        // could ever be sent.
        [email, username, name, new Date()],
      );
    } catch (err) {
      // An address the provider has not confirmed, which an account here
      // already has: never linked (2 above), and not a second account either.
      // It used to reach the client as a 500; it is answered as sign-up
      // answers an address in use, without saying whose it is.
      if ((err as { constraint?: string }).constraint === 'users_email_active_uniq') {
        throw new AppError(
          'REGISTRATION_FAILED',
          409,
          'unable to register with these details — if you already have an account, log in or reset your password',
        );
      }
      throw err;
    }
    const user = created.rows[0] as UserRow;
    await this.link(user.id, identity);
    const tokens = await issueTokenPair(this.config, this.pool, user, { deviceName, deviceId });
    return { user: toPublicUser(user), tokens, created: true };
  }

  /**
   * The guest row takes the address the provider confirmed (or the
   * placeholder when it confirmed none; either way there is nothing left for
   * the account to confirm) and the shared name where it had none, and stops
   * being a guest.
   * Null when the row is no longer a guest. An address already on another
   * account is answered as sign-up answers it, without saying whose it is.
   */
  private async claimGuest(guestId: string, email: string, name: string | null): Promise<UserRow | null> {
    try {
      const claimed = await this.pool.query<UserRow>(
        `UPDATE users SET email = $2, email_verified_at = now(),
                display_name = COALESCE(display_name, $3),
                guest = false, guest_device_hash = NULL
          WHERE id = $1 AND guest AND deleted_at IS NULL
          RETURNING *`,
        [guestId, email, name],
      );
      return claimed.rows[0] ?? null;
    } catch (err) {
      if ((err as { constraint?: string }).constraint === 'users_email_active_uniq') {
        throw new AppError(
          'REGISTRATION_FAILED',
          409,
          'unable to register with these details — if you already have an account, log in or reset your password',
        );
      }
      throw err;
    }
  }

  private async link(userId: string, identity: ProviderIdentity): Promise<void> {
    await this.pool.query(
      `INSERT INTO oauth_identities (user_id, provider, provider_user_id, email_at_link)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider, provider_user_id) DO NOTHING`,
      [userId, identity.provider, identity.providerUserId, identity.email],
    );
  }

  /**
   * The account behind a linked identity. A deleted one is disabled; a banned
   * one is answered by `refuseIfSuspended` with its reasons. (This used to
   * refuse any account with `banned_at` set, so a suspension that had already
   * ended still locked the person out of social sign-in.)
   */
  private async activeUser(id: string): Promise<UserRow> {
    const result = await this.pool.query<UserRow>(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
    const user = result.rows[0];
    if (!user) throw new AppError('ACCOUNT_DISABLED', 403, 'this account is disabled');
    return user;
  }

  /** 403 ACCOUNT_SUSPENDED with the reasons and an appeal token, like password sign-in. */
  private async refuseIfSuspended(user: UserRow): Promise<void> {
    const suspended = await suspensionError(this.config, this.pool, user);
    if (suspended) throw suspended;
  }
}
