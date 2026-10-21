import argon2 from 'argon2';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { grantBootstrapAdmins } from '../admin/bootstrap-admins.js';
import {
  EmailTakenError,
  InvalidUsernameError,
  UsernameTakenError,
  UsersRepository,
  type UserRow,
} from '../users/repository.js';
import { sendEmailJob } from '../jobs/email.js';
import { emailLocaleFor } from '../email/templates.js';
import type { JobQueue } from '../jobs/queue.js';
import { CURRENT_POLICY_VERSION } from '../gdpr/consent.js';
import { isMinorRow } from '../users/age.js';
import { consumeEmailToken, createEmailToken } from './email-tokens.js';
import { createVerificationCode, verifyCode, type VerifyResult } from './verification-codes.js';
import { CAPTCHA_AFTER_FAILURES, LockoutService, type LockoutScope } from './lockout.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  SESSION_MAX_DAYS,
  hashRefreshToken,
  issueAccessToken,
  issueTokenPair,
  type IssuedTokens,
} from './tokens.js';
import { verifyCaptcha } from './captcha.js';
import { KnownDevices, type KnownKind } from './known-devices.js';
import { networkHashOf } from '../net/network-key.js';
import { LoginSurge } from './login-surge.js';
import { breachCheckEnabled, isBreachedPassword } from './breached-password.js';
import { emailRegistryHash, userHash } from '../moderation/pseudonym.js';
import { currentBan } from '../moderation/sanctions-service.js';
import { suspendedError, suspensionError } from '../moderation/suspension.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Verified against when the user doesn't exist, so login latency doesn't
 *  reveal account existence. */
const DUMMY_HASH_PROMISE = argon2.hash('kurda-timing-equalizer', {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
});

/** Argon2id with OWASP-recommended parameters. */
const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password).catch(() => false);
}

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  locale?: string;
  timezone?: string;
  deviceName?: string;
  /**
   * Birth month and year. The route has already refused an impossible month
   * and anyone under 13.
   */
  birthYear: number;
  birthMonth: number;
  /** the app's `x-device-id`, remembered as the account's first known device */
  deviceId?: string | null;
  /** where the sign-up came from, remembered as the account's first known network */
  ip?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  locale: string;
  timezone: string;
  emailVerified: boolean;
  /**
   * No birth month on record yet: every client asks once, before anything
   * else, and nothing is offered until it is answered (POST /me/birth-date).
   */
  birthDateRequired: boolean;
  createdAt: string;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    locale: row.locale,
    timezone: row.timezone,
    emailVerified: row.email_verified_at !== null,
    birthDateRequired: row.birth_year == null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export interface AuthServiceDeps {
  jobs?: JobQueue;
  log?: { warn: (obj: unknown, msg: string) => void; info?: (obj: unknown, msg: string) => void };
  /** the credential-stuffing breaker counts in Redis; without it, it never trips */
  redis?: Redis;
}

/** Most reset emails one account is sent in an hour; more are quietly not sent. */
export const RESET_EMAILS_PER_HOUR = 3;

/** Why a sign-in asks for the CAPTCHA: the account's failures, the network's, or a surge everywhere. */
export type CaptchaReason = 'attempts' | 'network' | 'surge';

/**
 * Sign-in needs the challenge first. 403 like LOGIN_VERIFICATION_REQUIRED, the
 * other "do one more thing" answer; `details.captchaRequired` is what clients
 * look for. Said the same way whether or not the address has an account.
 */
export function captchaRequired(reason: CaptchaReason): AppError {
  return new AppError('CAPTCHA_REQUIRED', 403, 'complete the challenge to sign in', { captchaRequired: true, reason });
}

export class AuthService {
  private readonly users: UsersRepository;
  private readonly lockouts: LockoutService;
  private readonly devices: KnownDevices;
  private readonly surge: LoginSurge;

  constructor(
    private readonly config: AppConfig,
    private readonly pool: pg.Pool,
    private readonly deps: AuthServiceDeps = {},
  ) {
    this.users = new UsersRepository(pool);
    this.lockouts = new LockoutService(pool);
    this.devices = new KnownDevices(pool, config.JWT_SECRET);
    this.surge = new LoginSurge(deps.redis, deps.log);
  }

  /** Whether sign-in can ask for a CAPTCHA at all (not in dev and tests, without a secret). */
  private get captchaConfigured(): boolean {
    return Boolean(this.config.TURNSTILE_SECRET);
  }

  /**
   * Refuses a password that appears in the public corpus of breached passwords
   * (auth/breached-password.ts). Off under test unless configured; fails open.
   */
  async assertNotBreached(password: string): Promise<void> {
    if (!breachCheckEnabled(this.config)) return;
    if (await isBreachedPassword(password)) {
      throw new AppError(
        'PASSWORD_BREACHED',
        400,
        'this password has appeared in a data breach — choose a different one',
        { reason: 'breached' },
      );
    }
  }

  /**
   * A security email, at most once a day per account and kind when `daily`.
   * Best-effort: signing in never fails because a notice could not be queued.
   */
  private async securityNotice(
    user: { id: string; email: string; username: string; locale?: string },
    template: 'new-sign-in' | 'sign-in-attempts' | 'password-changed',
    daily: boolean,
  ): Promise<void> {
    try {
      if (daily) {
        const claimed = await this.pool.query(
          `INSERT INTO security_notices (user_id, kind) VALUES ($1, $2)
           ON CONFLICT (user_id, kind) DO UPDATE SET sent_at = now()
             WHERE security_notices.sent_at < now() - interval '24 hours'
           RETURNING 1`,
          [user.id, template],
        );
        if ((claimed.rowCount ?? 0) === 0) return;
      }
      if (!this.deps.jobs) return;
      await this.deps.jobs.enqueue(sendEmailJob, {
        to: user.email,
        template,
        vars: { username: user.username, time: `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC` },
        locale: emailLocaleFor(user.locale),
      });
    } catch (err) {
      this.deps.log?.warn({ err, userId: user.id, template }, 'failed to queue a security notice');
    }
  }

  /**
   * Absolute link into the web app for an emailed token. Built from
   * APP_BASE_URL because the API and the web app are different origins, and the
   * token is what the linked page posts back.
   */
  private emailLink(path: string, token: string): string {
    const base = this.config.APP_BASE_URL.endsWith('/')
      ? this.config.APP_BASE_URL.slice(0, -1)
      : this.config.APP_BASE_URL;
    return `${base}${path}?token=${encodeURIComponent(token)}`;
  }

  /** Legacy link-based verification, still served by /auth/resend-verification. */
  private async sendVerificationEmail(user: {
    id: string;
    email: string;
    username: string;
    locale?: string;
  }) {
    try {
      const token = await createEmailToken(this.pool, user.id, 'verify_email');
      if (this.deps.jobs) {
        await this.deps.jobs.enqueue(sendEmailJob, {
          to: user.email,
          template: 'verify-email',
          vars: { link: this.emailLink('/verify-email', token), username: user.username },
          locale: emailLocaleFor(user.locale),
        });
      }
    } catch (err) {
      this.deps.log?.warn({ err, userId: user.id }, 'failed to enqueue verification email');
    }
  }

  /**
   * Emails a 6-digit ownership-verification code (KUR-014). Best-effort: signup
   * must never fail because email couldn't enqueue. Returns the raw code for
   * tests; production callers ignore it (only the mailbox owner sees it).
   */
  private async sendVerificationCode(user: {
    id: string;
    email: string;
    username: string;
    locale?: string;
  }): Promise<string | null> {
    try {
      const code = await createVerificationCode(this.pool, user.id);
      if (this.deps.jobs) {
        await this.deps.jobs.enqueue(sendEmailJob, {
          to: user.email,
          template: 'verify-email-code',
          vars: { code, username: user.username },
          locale: emailLocaleFor(user.locale),
        });
      } else {
        // no queue configured → the mail is silently dropped, which looks to the
        // user like verification code simply never arriving
        this.deps.log?.warn(
          { userId: user.id },
          'background jobs unavailable (no REDIS_URL): verification code email NOT sent',
        );
      }
      return code;
    } catch (err) {
      this.deps.log?.warn({ err, userId: user.id }, 'failed to enqueue verification code');
      return null;
    }
  }

  /**
   * Re-issues a verification code for a signed-in, still-unverified user.
   * No-ops silently if the account is already verified.
   */
  async resendVerificationCode(userId: string): Promise<void> {
    const res = await this.pool.query<{
      email: string;
      username: string;
      locale: string;
      email_verified_at: Date | null;
    }>(
      `SELECT email, username, locale, email_verified_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const user = res.rows[0];
    if (!user || user.email_verified_at) return;
    await this.sendVerificationCode({
      id: userId,
      email: user.email,
      username: user.username,
      locale: user.locale,
    });
  }

  /**
   * Verifies a submitted code for a signed-in user and, on success, marks the
   * email verified. Returns the low-level result so the route can map it to a
   * specific status/error.
   */
  /**
   * Confirming an address is exactly when a bootstrap-admin allowlist entry can
   * first be honoured, so reconcile right here instead of waiting for the next
   * restart. Idempotent and best-effort: a failure must never fail the
   * verification the user just completed.
   */
  private async reconcileBootstrapAdmins(): Promise<void> {
    if (!this.config.BOOTSTRAP_ADMIN_EMAILS) return;
    try {
      await grantBootstrapAdmins(this.pool, this.config.BOOTSTRAP_ADMIN_EMAILS, {
        info: (obj, msg) => this.deps.log?.info?.(obj, msg),
        warn: (obj, msg) => this.deps.log?.warn(obj, msg),
      });
    } catch (err) {
      this.deps.log?.warn({ err }, 'bootstrap admin reconciliation after verification failed');
    }
  }

  async verifyEmailCode(userId: string, code: string): Promise<VerifyResult> {
    const result = await verifyCode(this.pool, userId, code);
    if (result === 'ok') {
      await this.pool.query(
        `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`,
        [userId],
      );
      await this.reconcileBootstrapAdmins();
    }
    return result;
  }

  /** Always succeeds from the caller's perspective (no enumeration). */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    // a mailbox is not a target: past RESET_EMAILS_PER_HOUR, nothing more is
    // sent, and the answer is the same as ever
    const recent = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM email_tokens
        WHERE user_id = $1 AND purpose = 'password_reset' AND created_at > now() - interval '1 hour'`,
      [user.id],
    );
    if ((recent.rows[0]?.n ?? 0) >= RESET_EMAILS_PER_HOUR) return;
    try {
      if (!user.password_hash) {
        // OAuth-only account (KUR-019): there is no password to reset, but the
        // mail invites them to SET one — so send a real reset link (resetPassword
        // sets the hash whether or not one existed) rather than a dead message.
        if (this.deps.jobs) {
          const setToken = await createEmailToken(this.pool, user.id, 'password_reset');
          await this.deps.jobs.enqueue(sendEmailJob, {
            to: user.email,
            template: 'oauth-no-password',
            vars: { link: this.emailLink('/reset-password', setToken), username: user.username },
            locale: emailLocaleFor(user.locale),
          });
        }
        return;
      }
      const token = await createEmailToken(this.pool, user.id, 'password_reset');
      if (this.deps.jobs) {
        await this.deps.jobs.enqueue(sendEmailJob, {
          to: user.email,
          template: 'password-reset',
          vars: { link: this.emailLink('/reset-password', token), username: user.username },
          locale: emailLocaleFor(user.locale),
        });
      } else {
        // no queue configured → the mail is silently dropped, which looks to the
        // user like password reset simply never arriving
        this.deps.log?.warn(
          { userId: user.id },
          'background jobs unavailable (no REDIS_URL): password reset email NOT sent',
        );
      }
    } catch (err) {
      this.deps.log?.warn({ err, userId: user.id }, 'failed to enqueue password reset email');
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const userId = await consumeEmailToken(this.pool, rawToken, 'password_reset');
    if (!userId) {
      throw new AppError('INVALID_TOKEN', 400, 'reset link is invalid or expired');
    }
    // every other reset link sent to this account dies with this one: a second
    // link left in the mailbox would otherwise reset the new password again
    await this.pool.query(
      `UPDATE email_tokens SET used_at = now()
        WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL`,
      [userId],
    );
    const passwordHash = await hashPassword(newPassword);
    // token_version bump invalidates every outstanding access token;
    // revoking refresh tokens kills all sessions (KUR-016 semantics)
    const updated = await this.pool.query<{ email: string; username: string; locale: string }>(
      `UPDATE users SET password_hash = $2, token_version = token_version + 1
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING email, username, locale`,
      [userId, passwordHash],
    );
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    // the mailbox proved who this is: a lock on the account does not outlast it
    await this.lockouts.release('account', userId);
    const user = updated.rows[0];
    if (user && this.deps.jobs) {
      await this.deps.jobs
        .enqueue(sendEmailJob, {
          to: user.email,
          template: 'password-changed',
          vars: { username: user.username },
          locale: emailLocaleFor(user.locale),
        })
        .catch(() => undefined);
    }
  }

  /**
   * A signed-in change of password, the current one first. Every other session
   * ends (its refresh tokens are revoked, and the version bump ends its access
   * tokens at once); this one carries on with the fresh access token returned,
   * so changing a password does not sign you out where you changed it. Reset
   * links still waiting in the mailbox die too, and the owner is told.
   */
  async changePassword(
    userId: string,
    familyId: string | undefined,
    current: string,
    next: string,
  ): Promise<{ changed: true; accessToken: string | null; accessExpiresInSeconds: number }> {
    const found = await this.pool.query<{ password_hash: string | null; email: string; username: string; locale: string }>(
      `SELECT password_hash, email, username, locale FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const row = found.rows[0];
    if (!row) throw new AppError('UNAUTHORIZED', 401, 'authentication required');
    if (!row.password_hash) {
      throw new AppError('NO_PASSWORD', 400, 'this account has no password yet — use “forgot password” to set one');
    }
    if (!(await verifyPassword(row.password_hash, current))) {
      throw new AppError('WRONG_PASSWORD', 400, 'the current password is not correct');
    }
    const passwordHash = await hashPassword(next);
    const updated = await this.pool.query<{ token_version: number }>(
      `UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING token_version`,
      [userId, passwordHash],
    );
    const keep = familyId && UUID_RE.test(familyId) ? familyId : null;
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now()
        WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR family_id <> $2::uuid)`,
      [userId, keep],
    );
    await this.pool.query(
      `UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'password_reset' AND used_at IS NULL`,
      [userId],
    );
    await this.securityNotice({ id: userId, ...row }, 'password-changed', false);
    const accessToken = keep
      ? await issueAccessToken(this.config, { sub: userId, ver: updated.rows[0]!.token_version, fam: keep })
      : null;
    return { changed: true, accessToken, accessExpiresInSeconds: ACCESS_TOKEN_TTL_SECONDS };
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const userId = await consumeEmailToken(this.pool, rawToken, 'verify_email');
    if (!userId) {
      throw new AppError('INVALID_TOKEN', 400, 'verification link is invalid or expired');
    }
    await this.pool.query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`,
      [userId],
    );
    await this.reconcileBootstrapAdmins();
  }

  /** Always succeeds from the caller's perspective (no enumeration). */
  async resendVerification(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    const verified = await this.pool.query<{ email_verified_at: Date | null }>(
      `SELECT email_verified_at FROM users WHERE id = $1`,
      [user.id],
    );
    if (verified.rows[0]?.email_verified_at) return;
    await this.sendVerificationEmail(user);
  }

  async register(input: RegisterInput): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const passwordHash = await hashPassword(input.password);
    let user: UserRow;
    try {
      user = await this.users.create({
        email: input.email,
        username: input.username,
        passwordHash,
        displayName: input.displayName,
        locale: input.locale,
        timezone: input.timezone,
      });
    } catch (err) {
      // usernames are public (profiles, search) — a specific error is fine.
      if (err instanceof UsernameTakenError) {
        throw new AppError('USERNAME_TAKEN', 409, 'username already in use');
      }
      if (err instanceof InvalidUsernameError) {
        throw new AppError('INVALID_USERNAME', 400, err.message);
      }
      // emails are private — never confirm one exists (enumeration).
      if (err instanceof EmailTakenError) {
        throw new AppError(
          'REGISTRATION_FAILED',
          409,
          'unable to register with these details — if you already have an account, log in or reset your password',
        );
      }
      throw err;
    }

    // versioned consent (KUR-109); the route schema guarantees acceptTerms was
    // true. The birth month is kept, never a verdict drawn from it: minor
    // status is worked out from it whenever it is needed (users/age.ts).
    const birth = { birth_year: input.birthYear, birth_month: input.birthMonth };
    const updated = await this.pool.query<UserRow>(
      `UPDATE users SET consent_version = $2, consented_at = now(),
              birth_year = $3, birth_month = $4,
              -- a minor's profile starts private: friends only, chosen or not
              profile_visibility = CASE WHEN $5 THEN 'friends' ELSE profile_visibility END
       WHERE id = $1
       RETURNING *`,
      [user.id, CURRENT_POLICY_VERSION, birth.birth_year, birth.birth_month, isMinorRow(birth)],
    );
    user = updated.rows[0] ?? user;

    const tokens = await issueTokenPair(this.config, this.pool, user, {
      deviceName: input.deviceName,
    });
    // the device it was made on is the account's first known one
    if (input.deviceId) await this.devices.remember(user.id, 'device', input.deviceId).catch(() => undefined);
    const network = networkHashOf(input.ip);
    if (network !== null) await this.devices.remember(user.id, 'network', network).catch(() => undefined);
    // Email ownership is proven by a 6-digit code the client enters (KUR-014).
    await this.sendVerificationCode(user);
    return { user: toPublicUser(user), tokens };
  }

  /**
   * Password sign-in, guarded against guessing without locking the owner out.
   *
   * - Every attempt draws on one budget: a device that has signed in to this
   *   account before keeps its own (known-devices.ts), as does a network that
   *   has, for apps that send no device id; every other client shares the
   *   account's, which an address with no account has too, keyed by its hash,
   *   so the answers never say whether an account exists.
   * - After CAPTCHA_AFTER_FAILURES failures on that budget or from the network,
   *   or while failures surge everywhere (login-surge.ts), a client the account
   *   does not know must pass the CAPTCHA (CAPTCHA_REQUIRED). With it, even a
   *   locked budget lets the right password in, so the owner is never stuck
   *   for a day; without a CAPTCHA configured, a lock is a wall, as before.
   * - A network is hard-locked only when it sprays: many failures across
   *   several accounts (lockout.ts), never for one person mistyping on a
   *   carrier's shared address.
   * - Every path spends one argon2 verification, the refusals included, so how
   *   long an answer takes says nothing about the account either.
   */
  async login(input: {
    email: string;
    password: string;
    deviceName?: string;
    ip?: string;
    /** the app's `x-device-id` */
    deviceId?: string | null;
    captchaToken?: string;
  }): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const invalid = () => new AppError('INVALID_CREDENTIALS', 401, 'invalid email or password');
    const locked = (seconds: number) =>
      new AppError('LOCKED', 429, 'too many failed attempts — try again later', {
        retryAfterSec: seconds,
      });
    const burn = async () => {
      await verifyPassword(await DUMMY_HASH_PROMISE, input.password);
    };

    const user = await this.users.findByEmail(input.email);
    const deviceId = input.deviceId ?? null;
    const network = networkHashOf(input.ip);
    // known: this device has signed in to the account before, or (for an app
    // that sends no device id) this network has
    let known: { kind: KnownKind; value: string } | null = null;
    if (user && deviceId !== null && (await this.devices.isKnown(user.id, 'device', deviceId))) {
      known = { kind: 'device', value: deviceId };
    } else if (user && network !== null && (await this.devices.isKnown(user.id, 'network', network))) {
      known = { kind: 'network', value: network };
    }
    // the budget this attempt spends, and who it is aimed at for the network's count
    const target = user ? userHash(user.id) : `email:${emailRegistryHash(input.email)}`;
    const scope: LockoutScope = known ? 'device' : 'account';
    const key = known && user ? this.devices.hash(user.id, known.kind, known.value) : user ? user.id : target;

    // progressive lockout checks come before any password work (KUR-023)
    const [keyLock, keyFailures] = await Promise.all([this.lockouts.lockedFor(scope, key), this.lockouts.failures(scope, key)]);
    const watchNetwork = !known && input.ip !== undefined;
    const [netLock, netFailures] = watchNetwork
      ? await Promise.all([this.lockouts.lockedFor('ip', input.ip!), this.lockouts.failures('ip', input.ip!)])
      : [null, 0];
    const surging = !known && (await this.surge.active());

    const lockSec = keyLock ?? netLock;
    if (this.captchaConfigured) {
      let reason: CaptchaReason | null = null;
      if (keyLock !== null || keyFailures >= CAPTCHA_AFTER_FAILURES) reason = 'attempts';
      else if (netLock !== null || netFailures >= CAPTCHA_AFTER_FAILURES) reason = 'network';
      else if (surging) reason = 'surge';
      if (reason !== null) {
        const passed = input.captchaToken ? await this.verifyCaptchaToken(input.captchaToken, input.ip) : false;
        if (!passed) {
          await burn();
          throw captchaRequired(reason);
        }
      }
    } else if (lockSec !== null) {
      // nothing to offer instead: the lock is a wall until it lapses
      await burn();
      throw locked(lockSec);
    }

    const passwordOk = user?.password_hash ? await verifyPassword(user.password_hash, input.password) : (await burn(), false);
    if (!user || !passwordOk) {
      const keyLockSec = await this.lockouts.recordFailure(scope, key);
      const netLockSec = watchNetwork ? await this.lockouts.recordFailure('ip', input.ip!, target) : null;
      if (!known) await this.surge.recordFailure();
      if (user) {
        // the network as its keyed hash, never the address
        this.deps.log?.warn({ userId: user.id, network, scope, keyLockSec, netLockSec }, 'failed login attempt');
        // the owner hears about a lock on their account, once a day at most
        if (keyLockSec !== null && scope === 'account') await this.securityNotice(user, 'sign-in-attempts', true);
      }
      const lockedNow = keyLockSec ?? netLockSec;
      if (lockedNow !== null && !this.captchaConfigured) throw locked(lockedNow);
      throw invalid();
    }

    await this.lockouts.clear(scope, key);

    // A banned account is told so — with why, until when, and a token that can
    // only ask for a review — instead of being handed a session the next request
    // refuses. After the password, so the answer reveals nothing to a guesser.
    const suspended = await suspensionError(this.config, this.pool, user);
    if (suspended) throw suspended;

    // a returning user keeps their account: logging in during the
    // deletion grace period cancels the deletion (KUR-024)
    const cancelled = await this.pool.query(
      `UPDATE users SET deletion_requested_at = NULL
       WHERE id = $1 AND deletion_requested_at IS NOT NULL`,
      [user.id],
    );
    if ((cancelled.rowCount ?? 0) > 0) {
      this.deps.log?.warn({ userId: user.id }, 'account deletion cancelled by login');
    }

    const tokens = await issueTokenPair(this.config, this.pool, user, {
      deviceName: input.deviceName,
    });
    // the device is known from now on; a sign-in from one this account has
    // never used is worth an email to its owner (not the very first, though)
    if (deviceId !== null) {
      const seen = await this.devices.remember(user.id, 'device', deviceId).catch(() => null);
      if (seen?.isNew && !seen.firstForAccount) await this.securityNotice(user, 'new-sign-in', false);
    }
    if (network !== null) await this.devices.remember(user.id, 'network', network).catch(() => undefined);
    return { user: toPublicUser(user), tokens };
  }

  /** Turnstile, as at sign-up; its own method so the rule lives in one place. */
  private verifyCaptchaToken(token: string, ip: string | undefined): Promise<boolean> {
    return verifyCaptcha(this.config, token, ip);
  }

  /**
   * Signs out one session: the family of the presented refresh token is
   * revoked, so neither it nor the access tokens issued with it work again
   * (plugins/auth.ts). Says nothing about whether the token was known — there
   * is nothing to learn from signing out.
   */
  async logout(rawToken: string): Promise<void> {
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = now()
        WHERE family_id = (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)
          AND revoked_at IS NULL`,
      [hashRefreshToken(rawToken)],
    );
  }

  /**
   * Rotates a refresh token (KUR-015): the presented token is retired and
   * a new one issued in the same family. Presenting an already-rotated or
   * revoked token is treated as theft — the entire family is revoked.
   */
  async refresh(rawToken: string): Promise<IssuedTokens> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{
        id: string;
        user_id: string;
        family_id: string;
        device_name: string | null;
        expires_at: Date;
        revoked_at: Date | null;
        replaced_by: string | null;
        session_started_at: Date;
      }>(`SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`, [
        hashRefreshToken(rawToken),
      ]);

      const row = found.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        throw new AppError('INVALID_REFRESH', 401, 'invalid refresh token');
      }

      // A ban ends refreshing: the account is told why (403 ACCOUNT_SUSPENDED,
      // with the appeal token) rather than "your session was stolen". Checked
      // before the reuse rule because a ban revokes every refresh token — the
      // phone's next refresh presents one of those, and it must land on the
      // suspension screen, not the sign-in form. Every token the account still
      // holds is revoked (a ban written straight to the account left them live).
      //
      // But only for a token the account could still have used: unexpired, and
      // either live or ended by the ban itself (revoked when the ban began, not
      // rotated). Any other — rotated long ago, revoked as stolen, expired —
      // gets the answer it always got: the appeal token reads the person's
      // standing and files their one appeal per decision, which is not for
      // whoever kept an old token.
      const owner = await this.users.findById(row.user_id);
      const ban = owner ? await currentBan(client, owner.id) : null;
      if (owner && ban) {
        const unexpired = new Date(row.expires_at).getTime() >= Date.now();
        const endedByBan = row.revoked_at !== null && row.replaced_by === null && new Date(row.revoked_at).getTime() >= ban.since.getTime();
        if (unexpired && (row.revoked_at === null || endedByBan)) {
          await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [row.user_id]);
          await client.query('COMMIT');
          throw await suspendedError(this.config, owner, ban);
        }
      }

      if (row.revoked_at || row.replaced_by) {
        // reuse of a rotated token — assume the family is compromised
        await client.query(
          `UPDATE refresh_tokens SET revoked_at = now()
           WHERE family_id = $1 AND revoked_at IS NULL`,
          [row.family_id],
        );
        await client.query('COMMIT');
        throw new AppError('REFRESH_REUSED', 401, 'refresh token reuse detected; session revoked');
      }

      // past its own expiry, or past the session's whole lifetime (a token
      // issued before that lifetime was capped carries a later expiry)
      const sessionEnds = new Date(row.session_started_at).getTime() + SESSION_MAX_DAYS * 24 * 3_600_000;
      if (new Date(row.expires_at).getTime() < Date.now() || sessionEnds < Date.now()) {
        await client.query('ROLLBACK');
        throw new AppError('REFRESH_EXPIRED', 401, 'refresh token expired');
      }

      const user = owner;
      if (!user) {
        await client.query('ROLLBACK');
        throw new AppError('INVALID_REFRESH', 401, 'invalid refresh token');
      }

      const tokens = await issueTokenPair(this.config, client, user, {
        familyId: row.family_id,
        deviceName: row.device_name ?? undefined,
        // the session keeps its start, so SESSION_MAX_DAYS ends it however often it refreshes
        sessionStartedAt: new Date(row.session_started_at),
      });
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
        [row.id, tokens.refreshTokenId],
      );
      await client.query('COMMIT');
      return tokens;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
