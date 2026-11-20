import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type pg from 'pg';
import { checkUsername, numberedUsername, suggestUsername } from '@kurda/shared';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { issueTokenPair, type IssuedTokens } from './tokens.js';
import { toPublicUser, type PublicUser } from './service.js';
import type { UserRow } from '../users/repository.js';
import { cleanDisplayName } from '../users/display-name.js';
import { isBannedEmail } from '../moderation/ban-registry.js';
import { suspensionError } from '../moderation/suspension.js';
import { recordRefusedSignIn } from '../net/device-sightings.js';
import { signupRejected } from './rejections.js';
import type { AppleTokens } from './apple-tokens.js';
import { GdprService, cancelPendingDeletion } from '../gdpr/service.js';

export type OAuthProvider = 'google' | 'apple';

/** What the app sends besides the identity token on an Apple sign-in. */
export interface AppleSignInExtras {
  /** the one-time code Apple gave the app with the token, for a refresh token to revoke later */
  authorizationCode?: string;
  /** the name the person shared, which Apple gives the app on their first sign-in only */
  fullName?: string;
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

/**
 * A username for an account made by a provider sign-in: from the shared name or the start of the email
 * (shared/src/username.ts `suggestUsername`, lowercased), numbered when taken. Every candidate is one a person could
 * have chosen, so a number never forms a reserved name or doubled marks.
 */
async function uniqueUsername(pool: pg.Pool, base: string): Promise<string> {
  const fallback = () => `learner_${Date.now().toString(36)}`;
  const made = suggestUsername(base) ?? fallback();
  const candidates = Array.from({ length: 20 }, (_, i) => (i === 0 ? made : numberedUsername(made, i + 1))).filter((c) => checkUsername(c).ok);
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
  return free.rows[0]?.candidate ?? fallback();
}

/** What the sign-in route checks around a provider sign-in (auth/routes.ts). */
export interface OAuthChecks {
  /**
   * Before a brand-new account is made (or a guest's row becomes one): the sign-up caps and the ban registry, which
   * throw the generic sign-up refusal.
   */
  beforeNewAccount?: (identity: { provider: string; subject: string; email: string | null }) => Promise<void>;
  /** Where a banned person's refused sign-in came from, recorded under their account (net/device-sightings.ts). */
  refused?: { deviceId: string | null; ip: string | null };
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
     * The guest signed in while asking (auth/guest.ts): a new identity claims that row so guest progress is kept. An
     * identity that already has an account signs that account in, leaving the guest row behind.
     */
    guestId: string | null = null,
    checks: OAuthChecks = {},
  ): Promise<{ user: PublicUser; tokens: IssuedTokens; created: boolean }> {
    const identity = await verifyProviderToken(this.config, provider, idToken, this.jwksResolver);
    const signedIn = await this.signInAs(identity, deviceName, deviceId, extras, guestId, checks);
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
    checks: OAuthChecks,
  ): Promise<{ user: PublicUser; tokens: IssuedTokens; created: boolean }> {
    // 1) known identity → login
    const known = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM oauth_identities WHERE provider = $1 AND provider_user_id = $2`,
      [identity.provider, identity.providerUserId],
    );
    if (known.rows[0]) {
      const user = await this.activeUser(known.rows[0].user_id);
      await this.refuseIfSuspended(user, checks);
      const tokens = await this.session(user, deviceName, deviceId);
      return { user: toPublicUser(user), tokens, created: false };
    }

    // 2) Email matches an existing account: link only when ownership is proven on BOTH sides (provider-verified email
    //    and our own verification), or an attacker could pre-register the victim's email unverified and capture links.
    if (identity.email && identity.emailVerified) {
      const existing = await this.pool.query<UserRow & { email_verified_at: Date | null }>(
        `SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL`,
        [identity.email],
      );
      let account = existing.rows[0];
      if (account && !account.email_verified_at) {
        // The provider confirmed this address but the account here never did. Linking would hand the account to whoever
        // registered the address first, so an unconfirmed sign-up is ended (auth/pending-signups.ts) and this sign-in
        // makes the account. Anything more than that (staff, or already tied to a provider) is left alone and refused.
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
        await this.refuseIfSuspended(account, checks);
        await this.link(account.id, identity);
        const tokens = await this.session(account, deviceName, deviceId);
        return { user: toPublicUser(account), tokens, created: false };
      }
    }

    // 3) Brand-new account (Apple relay emails land here).
    // An address the provider has not confirmed is left out, as if none was sent, so the account gets the placeholder:
    // otherwise its real owner could later claim it by password reset while this identity still signs in.
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
    // a banned or suspended person's address does not come back through a provider either
    if (await isBannedEmail(this.pool, email)) throw signupRejected();
    // nor their provider subject, and a new account here is held to the sign-up caps
    await checks.beforeNewAccount?.({ provider: identity.provider, subject: identity.providerUserId, email: confirmedEmail });
    // Apple's identity token never carries a name: the app passes on the one
    // the person shared, which Apple gives it on their first sign-in only. It
    // names a new account; an existing one keeps the name it has.
    const name = cleanDisplayName(identity.name ?? (identity.provider === 'apple' ? extras.fullName : null));

    // 3a) A guest asked: their row becomes the account, keeping username and progress. Still `created`, since the
    //     sign-up steps that follow (the birth month question) are still to come.
    if (guestId !== null) {
      const claimed = await this.claimGuest(guestId, email, name);
      if (claimed) {
        await this.link(claimed.id, identity);
        const tokens = await this.session(claimed, deviceName, deviceId);
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
        // The provider vouches for who this is: a confirmed address counts as confirmed, and with no address there is
        // nothing to confirm (an "unconfirmed" placeholder account would be held at plugins/activation.ts forever).
        [email, username, name, new Date()],
      );
    } catch (err) {
      // An unconfirmed provider address that an account here already has: never linked (2 above) and not a second
      // account either. Answered as sign-up answers an address in use, without saying whose it is.
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
    const tokens = await this.session(user, deviceName, deviceId);
    return { user: toPublicUser(user), tokens, created: true };
  }

  /**
   * The session every provider sign-in path hands out. It cancels a deletion still in its grace period, as a password
   * sign-in does, since the app and the deletion notice promise that signing in again keeps the account.
   */
  private async session(user: UserRow, deviceName: string | undefined, deviceId: string | null | undefined): Promise<IssuedTokens> {
    await cancelPendingDeletion(this.pool, user.id);
    return issueTokenPair(this.config, this.pool, user, { deviceName, deviceId });
  }

  /**
   * The guest row takes the provider-confirmed address (or the placeholder, so nothing is left to confirm) and the
   * shared name where it had none, and stops being a guest. Null when the row is no longer a guest. An address already
   * on another account is answered as sign-up answers it.
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
   * The account behind a linked identity. A deleted one is disabled; a banned one is answered by `refuseIfSuspended`
   * with its reasons, so an ended suspension no longer blocks social sign-in.
   */
  private async activeUser(id: string): Promise<UserRow> {
    const result = await this.pool.query<UserRow>(`SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`, [id]);
    const user = result.rows[0];
    if (!user) throw new AppError('ACCOUNT_DISABLED', 403, 'this account is disabled');
    return user;
  }

  /** 403 ACCOUNT_SUSPENDED with the reasons and an appeal token, like password sign-in; where it came from is recorded. */
  private async refuseIfSuspended(user: UserRow, checks: OAuthChecks = {}): Promise<void> {
    const suspended = await suspensionError(this.config, this.pool, user);
    if (!suspended) return;
    if (checks.refused) await recordRefusedSignIn(this.pool, user.id, checks.refused);
    throw suspended;
  }
}
