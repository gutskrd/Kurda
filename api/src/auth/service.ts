import argon2 from 'argon2';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import { normalizeKurdish } from '@kurda/shared';
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
import { cleanDisplayName } from '../users/display-name.js';
import { consumeEmailToken, createEmailToken } from './email-tokens.js';
import { createVerificationCode, verifyCode, type VerifyResult } from './verification-codes.js';
import { allowVerificationEmail } from './pending-signups.js';
import { GdprService, cancelPendingDeletion } from '../gdpr/service.js';
import { CAPTCHA_AFTER_FAILURES, LockoutService, type LockoutScope } from './lockout.js';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  SESSION_MAX_DAYS,
  hashRefreshToken,
  issueAccessToken,
  issueTokenPair,
  sessionDeviceHash,
  type IssuedTokens,
} from './tokens.js';
import { verifyCaptcha } from './captcha.js';
import { KnownDevices, type KnownKind } from './known-devices.js';
import { networkHashOf } from '../net/network-key.js';
import { LoginSurge, SURGE_HOLD_SECONDS } from './login-surge.js';
import { isPrivileged } from '../admin/roles.js';
import type { SecurityRecorder } from '../security/log.js';
import type { SecurityEventKind } from '@kurda/shared';
import { breachCheckEnabled, isBreachedPassword } from './breached-password.js';
import { emailRegistryHash, userHash } from '../moderation/pseudonym.js';
import { currentBan } from '../moderation/sanctions-service.js';
import { suspendedError, suspensionError } from '../moderation/suspension.js';
import { recordRefusedSignIn, writeDeviceSighting } from '../net/device-sightings.js';

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
  /** Birth month and year. The route has already refused an impossible month and anyone under 13. */
  birthYear: number;
  birthMonth: number;
  /** the app's `x-device-id`, remembered as the account's first known device */
  deviceId?: string | null;
  /** where the sign-up came from, remembered as the account's first known network */
  ip?: string;
}

export interface PublicUser {
  id: string;
  /** null for a guest, who has none until the account is claimed */
  email: string | null;
  username: string;
  displayName: string | null;
  locale: string;
  timezone: string;
  emailVerified: boolean;
  /**
   * No birth month on record yet: every client asks once, first, and nothing is offered until it is answered (POST
   * /me/birth-date). Never for a guest; the claim form asks.
   */
  birthDateRequired: boolean;
  /** a guest account (auth/guest.ts): learning only, until claimed */
  guest: boolean;
  /** a child's profile (family/), which the phone opens in child mode; absent for everyone else */
  kind?: 'child';
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
    birthDateRequired: row.birth_year == null && !row.guest,
    guest: row.guest,
    ...(row.kind === 'child' ? { kind: 'child' as const } : {}),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export interface AuthServiceDeps {
  jobs?: JobQueue;
  log?: { warn: (obj: unknown, msg: string) => void; info?: (obj: unknown, msg: string) => void };
  /** the credential-stuffing breaker counts in Redis; without it, it never trips */
  redis?: Redis;
  /** the security log (security/log.ts): sign-ins, failures, locks, changed passwords, reused sessions */
  security?: SecurityRecorder;
}

/** Most reset emails one account is sent in an hour, and in a day; more are quietly not sent. */
export const RESET_EMAILS_PER_HOUR = 3;
export const RESET_EMAILS_PER_DAY = 5;

/** Why a sign-in asks for the CAPTCHA: the account's failures, the network's, or a surge everywhere. */
export type CaptchaReason = 'attempts' | 'network' | 'surge';

/**
 * Sign-in needs the challenge first. 403 like LOGIN_VERIFICATION_REQUIRED; clients look for `details.captchaRequired`.
 * Identical whether or not the address has an account.
 */
export function captchaRequired(reason: CaptchaReason): AppError {
  return new AppError('CAPTCHA_REQUIRED', 403, 'complete the challenge to sign in', { captchaRequired: true, reason });
}

/** Claiming is for guests: an account that already has an address has nothing to claim. */
export function notAGuest(): AppError {
  return new AppError('NOT_A_GUEST', 403, 'this account is not a guest account');
}

export class AuthService {
  private readonly users: UsersRepository;
  private readonly lockouts: LockoutService;
  private readonly devices: KnownDevices;
  private readonly surge: LoginSurge;
  /** ends an unconfirmed sign-up that holds an address somebody else is signing up with (auth/pending-signups.ts) */
  private readonly accounts: GdprService;

  constructor(
    private readonly config: AppConfig,
    private readonly pool: pg.Pool,
    private readonly deps: AuthServiceDeps = {},
  ) {
    this.users = new UsersRepository(pool);
    this.lockouts = new LockoutService(pool);
    this.devices = new KnownDevices(pool, config.JWT_SECRET);
    this.surge = new LoginSurge(deps.redis, deps.log);
    const log = deps.log;
    this.accounts = new GdprService(pool, {
      log: log ? { info: (obj, msg) => log.info?.(obj, msg), warn: (obj, msg) => log.warn(obj, msg) } : undefined,
    });
  }

  /** Whether sign-in can ask for a CAPTCHA at all (not in dev and tests, without a secret). */
  private get captchaConfigured(): boolean {
    return Boolean(this.config.TURNSTILE_SECRET);
  }

  /**
   * Refuse a password found in the public breached-password corpus (auth/breached-password.ts). Off under test unless
   * configured; fails open.
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
   * A security email, at most once a day per account and kind when `daily`, and within the few a day one address is sent
   * of them all (email/send-limits.ts). Best-effort: sign-in never fails because a notice could not be queued.
   */
  private async securityNotice(
    user: { id: string; email: string | null; username: string; locale?: string },
    template: 'new-sign-in' | 'sign-in-attempts' | 'password-changed',
    daily: boolean,
  ): Promise<void> {
    // a guest has no address to send it to (and nothing of these can happen to one)
    if (user.email === null) return;
    try {
      // nor to an address nobody has shown to be theirs: it would be mail to a stranger about an account that can do nothing yet
      const confirmed = await this.pool.query(`SELECT 1 FROM users WHERE id = $1 AND email_verified_at IS NOT NULL`, [user.id]);
      if ((confirmed.rowCount ?? 0) === 0) return;
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
   * Absolute web-app link for an emailed token, built from APP_BASE_URL because the API and web app are different
   * origins.
   */
  private emailLink(path: string, token: string): string {
    const base = this.config.APP_BASE_URL.endsWith('/')
      ? this.config.APP_BASE_URL.slice(0, -1)
      : this.config.APP_BASE_URL;
    return `${base}${path}?token=${encodeURIComponent(token)}`;
  }

  /**
   * Email a 6-digit ownership code. Best-effort: sign-up never fails because email could not enqueue. Returns the raw
   * code for tests; production callers ignore it.
   */
  private async sendVerificationCode(user: {
    id: string;
    email: string | null;
    username: string;
    locale?: string;
  }): Promise<string | null> {
    // no address, no code: a guest's row has none until the account is claimed
    if (user.email === null) return null;
    try {
      // a day's ceiling, for the account and for the address (auth/pending-signups.ts): past it nothing is sent,
      // and the code already in the mailbox, if it has not run out, still works
      if (!(await allowVerificationEmail(this.pool, user.id, user.email))) {
        this.deps.log?.warn({ userId: user.id }, 'confirmation email not sent: the day’s ceiling for this account or address is reached');
        return null;
      }
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
   * Re-issue a code for a signed-in, unverified user; silent no-op if already verified. False when the day's
   * confirmation-email ceiling stopped it, so the app can say so.
   */
  async resendVerificationCode(userId: string): Promise<boolean> {
    const res = await this.pool.query<{
      email: string | null;
      username: string;
      locale: string;
      email_verified_at: Date | null;
    }>(
      `SELECT email, username, locale, email_verified_at FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const user = res.rows[0];
    if (!user || user.email_verified_at) return true;
    const code = await this.sendVerificationCode({
      id: userId,
      email: user.email,
      username: user.username,
      locale: user.locale,
    });
    return code !== null;
  }

  /**
   * Correct the address of an unconfirmed sign-up and send the code there. The account keeps its name and password; the
   * code sent to the old address stops working.
   *
   * Only for unconfirmed accounts (a confirmed address changes in Settings with its own proof). An address a confirmed
   * account has is answered as at sign-up; one an unconfirmed sign-up holds is taken from it. Returns whether a code
   * went out (false when the daily ceiling stopped it).
   */
  async changePendingEmail(userId: string, email: string): Promise<{ user: PublicUser; sent: boolean }> {
    const address = normalizeKurdish(email);
    await this.accounts.releaseAddress(address, userId);
    let updated: pg.QueryResult<UserRow>;
    try {
      updated = await this.pool.query<UserRow>(
        `UPDATE users SET email = $2
          WHERE id = $1 AND email_verified_at IS NULL AND NOT guest AND deleted_at IS NULL AND email IS NOT NULL
          RETURNING *`,
        [userId, address],
      );
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
    const user = updated.rows[0];
    if (!user) throw new AppError('ALREADY_VERIFIED', 409, 'this account has already confirmed its address');
    // the code sent to the old address must not confirm the new one
    await this.pool.query(`DELETE FROM email_verification_codes WHERE user_id = $1`, [userId]);
    await this.pool.query(`UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'verify_email' AND used_at IS NULL`, [userId]);
    const code = await this.sendVerificationCode(user);
    return { user: toPublicUser(user), sent: code !== null };
  }

  /**
   * Verify a submitted code for a signed-in user and on success mark the email verified. Returns the low-level result
   * for the route to map to a status.
   */
  /**
   * Confirming an address is when a bootstrap-admin allowlist entry can first be honoured, so reconcile here instead of
   * waiting for a restart. Idempotent and best-effort: it never fails the verification.
   */
  private async reconcileBootstrapAdmins(): Promise<void> {
    if (!this.config.BOOTSTRAP_ADMIN_EMAILS) return;
    try {
      await grantBootstrapAdmins(
        this.pool,
        this.config.BOOTSTRAP_ADMIN_EMAILS,
        {
          info: (obj, msg) => this.deps.log?.info?.(obj, msg),
          warn: (obj, msg) => this.deps.log?.warn(obj, msg),
        },
        this.deps.security,
      );
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
    // found by its address, so it has one; the check keeps the type honest
    if (!user || user.email === null) return;
    // a mailbox is not a target: past RESET_EMAILS_PER_HOUR or RESET_EMAILS_PER_DAY, nothing more is sent, and the
    // answer is the same as ever
    const recent = await this.pool.query<{ hour: number; day: number }>(
      `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour, count(*)::int AS day
         FROM email_tokens
        WHERE user_id = $1 AND purpose = 'password_reset' AND created_at > now() - interval '24 hours'`,
      [user.id],
    );
    const sent = recent.rows[0] ?? { hour: 0, day: 0 };
    if (sent.hour >= RESET_EMAILS_PER_HOUR || sent.day >= RESET_EMAILS_PER_DAY) return;
    await this.deps.security?.record('password.reset_requested', { userId: user.id, staff: isPrivileged(user.roles) });
    try {
      if (!user.password_hash) {
        // OAuth-only account: there is no password to reset, but the
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
    // revoking refresh tokens ends every session
    const updated = await this.pool.query<{ email: string | null; username: string; locale: string }>(
      // the link came out of the mailbox, which is what confirming an address is: it is not asked for a code as well
      `UPDATE users SET password_hash = $2, token_version = token_version + 1,
              email_verified_at = COALESCE(email_verified_at, now())
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
    await this.deps.security?.record('password.reset', { userId });
    const user = updated.rows[0];
    if (user && user.email !== null && this.deps.jobs) {
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
   * A signed-in password change, current password first. Every other session ends (refresh tokens revoked, version bump
   * ends their access tokens); this one continues with the returned access token. Pending reset links die too, and the
   * owner is told.
   */
  async changePassword(
    userId: string,
    familyId: string | undefined,
    current: string,
    next: string,
  ): Promise<{ changed: true; accessToken: string | null; accessExpiresInSeconds: number }> {
    const found = await this.pool.query<{ password_hash: string | null; email: string | null; username: string; locale: string }>(
      `SELECT password_hash, email, username, locale FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const row = found.rows[0];
    if (!row) throw new AppError('UNAUTHORIZED', 401, 'authentication required');
    if (!row.password_hash) {
      throw new AppError('NO_PASSWORD', 400, 'this account has no password yet — use “forgot password” to set one');
    }
    if (!(await verifyPassword(row.password_hash, current))) {
      await this.deps.security?.record('password.change_failed', { userId });
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
    await this.deps.security?.record('password.changed', { userId, details: { otherSessionsEnded: true } });
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

  async register(input: RegisterInput): Promise<{ user: PublicUser; tokens: IssuedTokens }> {
    const passwordHash = await hashPassword(input.password);
    // a sign-up that never confirmed this address does not keep it from whoever can (auth/pending-signups.ts)
    await this.accounts.releaseAddress(normalizeKurdish(input.email));
    let user: UserRow;
    try {
      user = await this.users.create({
        email: input.email,
        username: input.username,
        passwordHash,
        displayName: cleanDisplayName(input.displayName) ?? undefined,
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

    // versioned consent; the route schema guarantees acceptTerms was
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
      deviceId: input.deviceId,
    });
    // the device it was made on is the account's first known one
    if (input.deviceId) await this.devices.remember(user.id, 'device', input.deviceId).catch(() => undefined);
    const network = networkHashOf(input.ip);
    if (network !== null) await this.devices.remember(user.id, 'network', network).catch(() => undefined);
    // Email ownership is proven by a 6-digit code the client enters.
    await this.sendVerificationCode(user);
    return { user: toPublicUser(user), tokens };
  }

  /**
   * A guest claims their account (auth/guest.ts): the same row gets address, password, username (chosen or kept), birth
   * month and consent, and stops being a guest. Progress is already on the row, so nothing moves.
   *
   * From here it is a fresh sign-up: the address is unconfirmed, so the activation gate (plugins/activation.ts) holds
   * its writes until the code is entered. The guest's sessions stay signed in and hit the same gate at once.
   *
   * The route has already checked address, password, username and age as sign-up does; this is the write plus the
   * database's refusals (address or name in use, or the row no longer a guest).
   */
  async claim(
    userId: string,
    input: {
      email: string;
      password: string;
      username?: string;
      birthYear: number;
      birthMonth: number;
      locale?: string;
    },
  ): Promise<UserRow> {
    const passwordHash = await hashPassword(input.password);
    const birth = { birth_year: input.birthYear, birth_month: input.birthMonth };
    // as at sign-up: an address only ever held unconfirmed is free to whoever can confirm it
    await this.accounts.releaseAddress(normalizeKurdish(input.email), userId);
    let claimed: pg.QueryResult<UserRow>;
    try {
      claimed = await this.pool.query<UserRow>(
        `UPDATE users SET email = $2, password_hash = $3,
                username = COALESCE($4, username),
                birth_year = $5, birth_month = $6,
                locale = COALESCE($7, locale),
                consent_version = $8, consented_at = now(),
                -- a minor's profile starts private, as at sign-up
                profile_visibility = CASE WHEN $9 THEN 'friends' ELSE profile_visibility END,
                guest = false, guest_device_hash = NULL, email_verified_at = NULL,
                -- so that, never confirmed, the claim lapses and the learning is kept (gdpr endUnconfirmedSignup)
                claimed_from_guest_at = now()
          WHERE id = $1 AND guest AND deleted_at IS NULL
          RETURNING *`,
        [
          userId,
          normalizeKurdish(input.email),
          passwordHash,
          input.username ?? null,
          birth.birth_year,
          birth.birth_month,
          input.locale ?? null,
          CURRENT_POLICY_VERSION,
          isMinorRow(birth),
        ],
      );
    } catch (err) {
      const constraint = (err as { constraint?: string }).constraint;
      // usernames are public, so a specific answer; addresses are not (as at sign-up)
      if (constraint === 'users_username_active_uniq' || constraint === 'users_username_held') throw new AppError('USERNAME_TAKEN', 409, 'username already in use');
      if (constraint === 'users_email_active_uniq') {
        throw new AppError(
          'REGISTRATION_FAILED',
          409,
          'unable to register with these details — if you already have an account, log in or reset your password',
        );
      }
      throw err;
    }
    const user = claimed.rows[0];
    if (!user) throw notAGuest();
    await this.sendVerificationCode(user);
    return user;
  }

  /**
   * Password sign-in, guarded against guessing without locking the owner out.
   * - Every attempt draws on one budget: a device (known-devices.ts) or network that signed in before keeps its own;
   *   everyone else shares the account's, which unknown addresses also have, keyed by hash, so answers never reveal
   *   whether an account exists.
   * - After CAPTCHA_AFTER_FAILURES failures on that budget or network, or during a global surge (login-surge.ts), an
   *   unknown client must pass the CAPTCHA (CAPTCHA_REQUIRED). With it, even a locked budget admits the right password;
   *   without a CAPTCHA configured, a lock is a wall.
   * - A network is hard-locked only when it sprays across several accounts (lockout.ts), never for one person on a
   *   shared carrier address.
   * - Every path spends one argon2 verification, refusals included, so timing reveals nothing.
   */
  async login(input: {
    email: string;
    password: string;
    deviceName?: string;
    ip?: string;
    /** the app's `x-device-id` */
    deviceId?: string | null;
    captchaToken?: string;
    /** false: "Remember me" was left off, and the session is kept a day, not a month */
    remember?: boolean;
    /**
     * Who this sign-in is for at all (the admin console's owner-access.ts). Asked once the password is right; a refused
     * account gets the wrong-password answer, counts as a failure, and gets nothing.
     */
    only?: (userId: string) => Promise<boolean>;
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
    // the security log hears of every outcome; the console's own sign-in under its own kinds
    const forConsole = input.only !== undefined;
    const staff = user ? isPrivileged(user.roles) : false;
    const record = (kind: SecurityEventKind, details: Record<string, unknown> = {}) =>
      this.deps.security?.record(kind, { userId: user?.id ?? null, staff, details: forConsole ? { ...details, console: true } : details });
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

    // progressive lockout checks come before any password work
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
          await record('signin.challenged', { reason, answered: input.captchaToken !== undefined });
          throw captchaRequired(reason);
        }
      }
    } else if (lockSec !== null) {
      // nothing to offer instead: the lock is a wall until it lapses
      await burn();
      await record(forConsole ? 'console.signin_failed' : 'signin.failed', { reason: 'locked', retryAfterSec: lockSec });
      throw locked(lockSec);
    }

    const passwordOk = user?.password_hash ? await verifyPassword(user.password_hash, input.password) : (await burn(), false);
    // an account this sign-in is not for: the same answer, the same count, nothing to tell it apart
    const refused = !!user && passwordOk && input.only !== undefined && !(await input.only(user.id));
    if (!user || !passwordOk || refused) {
      const keyLockSec = await this.lockouts.recordFailure(scope, key);
      const netLockSec = watchNetwork ? await this.lockouts.recordFailure('ip', input.ip!, target) : null;
      const surgeBegan = !known && (await this.surge.recordFailure());
      await record(refused ? 'console.signin_refused' : forConsole ? 'console.signin_failed' : 'signin.failed', {
        reason: !user ? 'no-account' : !passwordOk ? 'wrong-password' : 'no-console-access',
      });
      if (keyLockSec !== null) await record('signin.locked', { scope, seconds: keyLockSec });
      if (netLockSec !== null) await this.deps.security?.record('network.locked', { details: { seconds: netLockSec } });
      if (surgeBegan) await this.deps.security?.record('signin.surge', { details: { holdSeconds: SURGE_HOLD_SECONDS } });
      if (user) {
        // the network as its keyed hash, never the address
        this.deps.log?.warn({ userId: user.id, network, scope, keyLockSec, netLockSec, refused }, 'failed login attempt');
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
    if (suspended) {
      // where a banned person tried from, under their own account, so a new account there is recognised
      await recordRefusedSignIn(this.pool, user.id, { deviceId, ip: input.ip });
      throw suspended;
    }

    // a returning user keeps their account: logging in during the
    // deletion grace period cancels the deletion
    if (await cancelPendingDeletion(this.pool, user.id)) {
      this.deps.log?.warn({ userId: user.id }, 'account deletion cancelled by login');
    }

    const tokens = await issueTokenPair(this.config, this.pool, user, {
      deviceName: input.deviceName,
      deviceId,
      shortLived: input.remember === false,
    });
    // the device is known from now on; a sign-in from one this account has
    // never used is worth an email to its owner — though not the very first,
    // and not the console's, whose own new-device alert below already says it
    let newDevice = false;
    if (deviceId !== null) {
      const seen = await this.devices.remember(user.id, 'device', deviceId).catch(() => null);
      newDevice = seen?.isNew === true && !seen.firstForAccount;
      if (newDevice && !forConsole) await this.securityNotice(user, 'new-sign-in', false);
    }
    if (network !== null) await this.devices.remember(user.id, 'network', network).catch(() => undefined);
    const remember = input.remember !== false;
    // the console: anywhere it has not been signed in from before is worth an alert to its owner
    if (forConsole) await record(known ? 'console.signin' : 'console.signin_new_device', { remember });
    else await record(newDevice ? 'signin.new_device' : 'signin.succeeded', { method: 'password', remember });
    return { user: toPublicUser(user), tokens };
  }

  /** Turnstile, as at sign-up; its own method so the rule lives in one place. */
  private verifyCaptchaToken(token: string, ip: string | undefined): Promise<boolean> {
    return verifyCaptcha(this.config, token, ip);
  }

  /**
   * Sign out one session by revoking the presented refresh token's family, so neither it nor its access tokens work
   * again (plugins/auth.ts). Silent about whether the token was known.
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
   * Rotate a refresh token: retire the presented one and issue a new one in the same family. Presenting a rotated or
   * revoked token is treated as theft and revokes the whole family.
   *
   * The session keeps its device, name and lifetime. A session whose app sent neither takes them from this request
   * (`x-device-id`, and a name from the User-Agent).
   */
  async refresh(rawToken: string, from: { deviceId?: string | null; deviceName?: string; ip?: string } = {}): Promise<IssuedTokens> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{
        id: string;
        user_id: string;
        family_id: string;
        device_name: string | null;
        device_hash: string | null;
        short_lived: boolean;
        expires_at: Date;
        revoked_at: Date | null;
        replaced_by: string | null;
        session_started_at: Date;
        return_to: string | null;
      }>(`SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`, [
        hashRefreshToken(rawToken),
      ]);

      const row = found.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        throw new AppError('INVALID_REFRESH', 401, 'invalid refresh token');
      }

      // A ban ends refreshing with 403 ACCOUNT_SUSPENDED and the appeal token, not "session stolen". Checked before the
      // reuse rule because a ban revokes every refresh token and the phone's next refresh must reach the suspension
      // screen; any token still live is revoked too. Only for a token the account could still have used (unexpired,
      // live or revoked by the ban itself); rotated, stolen or expired tokens get the usual answer, since the appeal
      // token files the person's one appeal per decision.
      const owner = await this.users.findById(row.user_id);
      const ban = owner ? await currentBan(client, owner.id) : null;
      if (owner && ban) {
        const unexpired = new Date(row.expires_at).getTime() >= Date.now();
        const endedByBan = row.revoked_at !== null && row.replaced_by === null && new Date(row.revoked_at).getTime() >= ban.since.getTime();
        if (unexpired && (row.revoked_at === null || endedByBan)) {
          await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [row.user_id]);
          await client.query('COMMIT');
          await recordRefusedSignIn(this.pool, owner.id, { deviceId: from.deviceId, ip: from.ip });
          throw await suspendedError(this.config, owner, ban, this.pool);
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
        await this.deps.security?.record('session.reused', { userId: row.user_id, details: { sessionEnded: true } });
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
      // A child's session is bound to the phone it was opened on (family/sessions.ts): from anywhere else it ends.
      const child = user.kind === 'child';
      if (child && (!from.deviceId || !row.device_hash || sessionDeviceHash(this.config, user.id, from.deviceId) !== row.device_hash)) {
        await client.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [row.family_id]);
        await client.query('COMMIT');
        throw new AppError('INVALID_REFRESH', 401, 'invalid refresh token');
      }

      const tokens = await issueTokenPair(this.config, client, user, {
        familyId: row.family_id,
        // a child's phone is kept without its name
        deviceName: child ? undefined : (row.device_name ?? from.deviceName),
        deviceHash: row.device_hash,
        deviceId: from.deviceId,
        shortLived: row.short_lived,
        // the session keeps its start, so SESSION_MAX_DAYS ends it however often it refreshes
        sessionStartedAt: new Date(row.session_started_at),
        // and a child's session on the parent's phone keeps the parent its PIN gives the phone back to
        returnTo: row.return_to,
      });
      await client.query(
        `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = $2 WHERE id = $1`,
        [row.id, tokens.refreshTokenId],
      );
      await client.query('COMMIT');
      // the install id refreshing this session, as evidence for 180 days (net/device-sightings.ts), never a child's; never fails the refresh
      if (from.deviceId && !child) await writeDeviceSighting(this.pool, user.id, from.deviceId).catch(() => undefined);
      return tokens;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
