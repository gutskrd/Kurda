import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { verifyCaptcha } from './captcha.js';
import { isDisposableEmail } from './disposable-domains.js';
import { emailAddress } from './email-address.js';
import { defaultJwksResolver, OAuthService } from './oauth.js';
import { appleTokens } from './apple-tokens.js';
import { signupRejected } from './rejections.js';
import { isBannedEmail } from '../moderation/ban-registry.js';
import { isReturningIdentity, type ReturnProbe } from '../moderation/returns.js';
import { deviceHashOf } from '../moderation/identity-hash.js';
import { writeDeviceSighting } from '../net/device-sightings.js';
import { AuthService, notAGuest } from './service.js';
import { GuestService } from './guest.js';
import { RiskService } from '../risk/service.js';
import { invalidUsername, validateUsername } from '../users/username.js';
import { validatePassword, PASSWORD_ERROR_MESSAGE, PASSWORD_MIN, PASSWORD_MAX } from './password-policy.js';
import { requireAuth } from '../plugins/auth.js';
import { sessionName } from './session-name.js';
import { APP_LOCALE_CODES } from '@kurda/shared';
import { safeTimeZone } from '../streaks/streak-logic.js';
import { storableTimeZone } from '../streaks/time-zones.js';
import { assertOldEnough, birthMonthSchema, birthYearSchema } from '../users/birth-month.js';
import { createMeReader } from '../users/routes.js';
import type { AdminAccess } from '../admin/owner-access.js';

/** Rejects a password that fails policy with a specific, actionable reason. */
function assertPasswordPolicy(password: string): void {
  const check = validatePassword(password);
  if (!check.ok) {
    throw new AppError('WEAK_PASSWORD', 400, PASSWORD_ERROR_MESSAGE[check.reason], { reason: check.reason });
  }
}

/** Optional client device fingerprint, supplied as a header. */
function deviceIdOf(headers: Record<string, unknown>): string | null {
  const raw = headers['x-device-id'];
  if (typeof raw === 'string' && raw.length > 0 && raw.length <= 200) return raw;
  return null;
}

// An unknown zone is dropped (the account gets UTC) rather than stored; see safeTimeZone in streaks/streak-logic.ts.
// One the database does not know is dropped in the route (`knownTimeZone`), since that needs the database's own list.
const timezoneField = z
  .string()
  .max(50)
  .optional()
  .transform((tz) => (tz && safeTimeZone(tz) === tz ? tz : undefined));

export const registerBodySchema = z.object({
  email: emailAddress,
  /** as typed: the rule (users/username.ts) says which part of it a name breaks, which a length here could not */
  username: z.string().min(1).max(60),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  displayName: z.string().min(1).max(60).optional(),
  /* every language the interface is offered in — one list, so the picker
       cannot offer something the server would refuse */
    locale: z.enum(APP_LOCALE_CODES).optional(),
  timezone: timezoneField,
  deviceName: z.string().max(80).optional(),
  captchaToken: z.string().max(3_000).optional(),
  /** Explicit, versioned consent to ToS + privacy policy. */
  acceptTerms: z.literal(true),
  /**
   * Birth month and year, always: every protection for minors rests on it, so no account is made without one. (Google
   * and Apple sign-ups are asked once after signing in and treated as not known adults until then; users/age.ts.)
   */
  birthYear: birthYearSchema,
  birthMonth: birthMonthSchema,
});

/**
 * "Try Hevalo without an account" (auth/guest.ts): app facts only, nothing about a person. Locale and time zone are
 * optional, as at sign-up, so the first lesson's language and the streak day are right.
 */
export const guestBodySchema = z.object({
  deviceName: z.string().max(80).optional(),
  locale: z.enum(APP_LOCALE_CODES).optional(),
  timezone: timezoneField,
});

/**
 * A guest claims the account: what sign-up asks, minus the username (kept or replaced) and the device (already signed
 * in).
 */
export const claimBodySchema = z.object({
  email: emailAddress,
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  username: z.string().min(1).max(60).optional(),
  locale: z.enum(APP_LOCALE_CODES).optional(),
  captchaToken: z.string().max(3_000).optional(),
  acceptTerms: z.literal(true),
  birthYear: birthYearSchema,
  birthMonth: birthMonthSchema,
});

export const loginBodySchema = z.object({
  email: emailAddress,
  password: z.string().min(1).max(128),
  deviceName: z.string().max(80).optional(),
  /**
   * "Remember me": false keeps the session one day after last use instead of thirty (auth/tokens.ts
   * UNREMEMBERED_TTL_DAYS). Absent means remembered.
   */
  remember: z.boolean().optional(),
  /** only once a sign-in has answered CAPTCHA_REQUIRED (auth/service.ts) */
  captchaToken: z.string().max(3_000).optional(),
});

export const changePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().min(20).max(200),
});

export const resendVerificationBodySchema = z.object({
  email: emailAddress,
});

export const passwordResetRequestBodySchema = z.object({
  email: emailAddress,
  captchaToken: z.string().max(3_000).optional(),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
});

export const verifyEmailCodeBodySchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const oauthBodySchema = z
  .object({
    provider: z.enum(['google', 'apple']),
    idToken: z.string().min(20).max(4_096),
    deviceName: z.string().max(80).optional(),
    /** Apple only: the authorization code, exchanged for a refresh token to revoke at deletion */
    authorizationCode: z.string().min(1).max(1_024).optional(),
    /** Apple only: the name shared on a first sign-in, for a new account (cut to a display name's length) */
    fullName: z.string().max(200).optional(),
  })
  .refine((body) => body.provider === 'apple' || (body.authorizationCode === undefined && body.fullName === undefined), {
    message: 'authorizationCode and fullName are only sent with Apple sign-in',
  });

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig, adminAccess?: AdminAccess): void {
  const service = new AuthService(config, app.db, { jobs: app.jobs, log: app.log, redis: app.redis, security: app.securityLog });
  /** A refused sign-up, with which check refused it, for the security log; the person is told nothing more. */
  const rejected = async (why: string) => {
    await app.securityLog.record('signup.rejected', { details: { why } });
    return signupRejected();
  };
  // Risk scoring: assesses signup/login, enforces per-device/IP caps,
  // logs decisions for tuning + audit. IP reputation defaults to neutral until a
  // provider is configured (graceful degradation).
  const risk = new RiskService(app.db, { redis: app.redis });
  const guests = new GuestService(config, app.db);
  // a zone the database does not know is dropped, as one Intl does not know already was: the account gets UTC
  const knownTimeZone = async (tz: string | undefined): Promise<string | undefined> => (tz ? ((await storableTimeZone(app.db, tz)) ?? undefined) : undefined);
  const me = createMeReader(app);
  /**
   * The account against everyone banned or suspended now (moderation/returns.ts): held on a strong match, queued on a
   * medium one. Never fails the sign-up or sign-in it follows.
   */
  const checkReturn = async (probe: ReturnProbe): Promise<void> => {
    if (app.hasDecorator('returns')) await app.returns.assess(probe);
  };
  /** Whether this account used this install id before today's sign-in; a new one is checked against banned people. */
  const newDevice = async (userId: string, deviceId: string | null): Promise<boolean> => {
    if (!deviceId) return false;
    const r = await app.db.query(`SELECT 1 FROM device_sightings WHERE user_id = $1 AND device_hash = $2 LIMIT 1`, [userId, deviceHashOf(deviceId)]);
    return r.rowCount === 0;
  };

  app.post(
    '/auth/register',
    {
      schema: { body: registerBodySchema },
      config: {
        // pre-auth endpoint: strict per-IP limit against signup abuse
        rateLimit: { max: 5, windowMs: 60_000, per: 'ip' as const },
      },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof registerBodySchema>;
      // first, so nothing about a child is checked, scored or stored: under 13,
      // no account is made at all (COPPA)
      assertOldEnough({ year: body.birthYear, month: body.birthMonth });
      // full username policy (reserved names, structure, length) with a specific
      // reason; the DB citext unique index remains the case-insensitive authority.
      const uname = validateUsername(body.username);
      if (!uname.ok) throw invalidUsername(uname);
      assertPasswordPolicy(body.password);
      if (isDisposableEmail(body.email)) throw await rejected('throwaway email address');
      if (!(await verifyCaptcha(config, body.captchaToken, req.ip))) throw await rejected('challenge not passed');
      // a password every attacker tries first is refused with its own reason
      await service.assertNotBreached(body.password);

      // A per-device/IP cap breach hard-blocks with a generic rejection, so the response never reveals which control
      // fired. Lower bands proceed; the CAPTCHA above is the baseline step-up.
      const { assessment, decisionId } = await risk.assessSignup({
        email: body.email,
        ip: req.ip,
        deviceId: deviceIdOf(req.headers),
      });
      if (assessment.hardBlock) throw await rejected('too many accounts from this device or network');
      // a banned or suspended person's address (or a +tag, dots or another domain of the same mailbox)
      if (await isReturningIdentity(app.db, { email: body.email })) throw await rejected('banned email address');

      const result = await service.register({
        ...body,
        timezone: await knownTimeZone(body.timezone),
        // the name as the rule wrote it (lowercase, trimmed), not as it was typed
        username: uname.value,
        deviceName: sessionName(body.deviceName, req.headers['user-agent']),
        deviceId: deviceIdOf(req.headers),
        ip: req.ip,
      });
      await risk.attachUser(decisionId, result.user.id).catch((err) => {
        app.log.warn({ err }, 'failed to attach user to risk decision');
      });
      await checkReturn({ userId: result.user.id, event: 'signup', email: body.email, deviceId: deviceIdOf(req.headers), ip: req.ip });
      return reply.code(201).send(result);
    },
  );

  /**
   * A guest account, signed in (auth/guest.ts). Same anti-abuse caps as sign-up (the per-IP limit here, per-device and
   * per-network caps in the risk service), so this is no cheaper way to mint accounts. No CAPTCHA: nothing typed to
   * protect, and the caps stop scripts. A device asking again within a day gets its guest back (200, not 201) before
   * any of that.
   */
  app.post(
    '/auth/guest',
    {
      schema: { body: guestBodySchema },
      config: { rateLimit: { max: 5, windowMs: 60_000, per: 'ip' as const } },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof guestBodySchema>;
      const deviceId = deviceIdOf(req.headers);
      const deviceName = sessionName(body.deviceName, req.headers['user-agent']);
      const resumed = await guests.resume(deviceId, deviceName);
      if (resumed) {
        await app.securityLog.record('signin.succeeded', { userId: resumed.user.id, details: { method: 'guest', newAccount: false } });
        return reply.code(200).send(resumed);
      }
      const { assessment, decisionId } = await risk.assessSignup({ ip: req.ip, deviceId });
      if (assessment.hardBlock) throw await rejected('too many accounts from this device or network');
      const result = await guests.start({ deviceName, deviceId, locale: body.locale, timezone: await knownTimeZone(body.timezone) });
      await risk.attachUser(decisionId, result.user.id).catch((err) => {
        app.log.warn({ err }, 'failed to attach user to risk decision');
      });
      await checkReturn({ userId: result.user.id, event: 'guest', deviceId, ip: req.ip });
      await app.securityLog.record('signin.succeeded', { userId: result.user.id, details: { method: 'guest', newAccount: true } });
      return reply.code(201).send(result);
    },
  );

  /**
   * A guest claims the account (auth/service.ts `claim`): sign-up's checks in the same order with the same answers,
   * then the row is upgraded in place and the code sent. Answers with the /me shape, since the app replaces everything
   * it holds. Rate-limited per account so a stolen guest session cannot probe addresses.
   */
  app.post(
    '/auth/claim',
    {
      schema: { body: claimBodySchema },
      preHandler: requireAuth,
      config: { rateLimit: { max: 5, windowMs: 60_000, per: 'user-or-ip' as const } },
    },
    async (req) => {
      if (req.user!.guest !== true) throw notAGuest();
      const body = req.body as z.infer<typeof claimBodySchema>;
      // first, so nothing about a child is checked, scored or stored (COPPA);
      // the guest row stays as it was, with no birth month on it
      assertOldEnough({ year: body.birthYear, month: body.birthMonth });
      let username: string | undefined;
      if (body.username !== undefined) {
        const uname = validateUsername(body.username);
        if (!uname.ok) throw invalidUsername(uname);
        username = uname.value;
      }
      assertPasswordPolicy(body.password);
      if (isDisposableEmail(body.email)) throw await rejected('throwaway email address');
      if (!(await verifyCaptcha(config, body.captchaToken, req.ip))) throw await rejected('challenge not passed');
      await service.assertNotBreached(body.password);
      if (await isReturningIdentity(app.db, { email: body.email }, req.user!.id)) throw await rejected('banned email address');

      const claimed = await service.claim(req.user!.id, {
        email: body.email,
        password: body.password,
        username,
        birthYear: body.birthYear,
        birthMonth: body.birthMonth,
        locale: body.locale,
      });
      // the claimed account's device, and the account checked as a sign-up is
      const deviceId = deviceIdOf(req.headers);
      if (deviceId) await writeDeviceSighting(app.db, claimed.id, deviceId).catch(() => undefined);
      await checkReturn({ userId: claimed.id, event: 'claim', email: body.email, deviceId, ip: req.ip });
      return { user: await me(claimed.id) };
    },
  );

  app.post(
    '/auth/login',
    {
      schema: { body: loginBodySchema },
      config: {
        // brute-force resistance; keyed by IP because there is no user yet
        rateLimit: { max: 5, windowMs: 60_000, per: 'ip' as const },
      },
    },
    async (req) => {
      const body = req.body as z.infer<typeof loginBodySchema>;
      // Assess before authenticating so a high-risk attempt mints no session.
      const { assessment, decisionId } = await risk.assessLogin({
        email: body.email,
        ip: req.ip,
        deviceId: deviceIdOf(req.headers),
      });
      if (assessment.action === 'verify_or_block') {
        await app.securityLog.record('signin.risk_blocked', { details: { score: assessment.score } });
        throw new AppError('LOGIN_VERIFICATION_REQUIRED', 403, 'additional verification required');
      }
      const result = await service.login({
        ...body,
        deviceName: sessionName(body.deviceName, req.headers['user-agent']),
        ip: req.ip,
        deviceId: deviceIdOf(req.headers),
      });
      const fresh = await newDevice(result.user.id, deviceIdOf(req.headers)).catch(() => false);
      await risk.attachUser(decisionId, result.user.id).catch((err) => {
        app.log.warn({ err }, 'failed to attach user to risk decision');
      });
      // a sign-in on a device this account never used is compared with banned people's
      if (fresh) await checkReturn({ userId: result.user.id, event: 'signin', deviceId: deviceIdOf(req.headers), ip: req.ip });
      return result;
    },
  );

  /**
   * The admin console's own sign-in: the same checks (risk, lockouts, CAPTCHA, constant password-check time) but it
   * signs in only the console's owner (admin/owner-access.ts). Every other account, even with the right password, gets
   * exactly the wrong-password answer and no session. Its own, stricter budget.
   */
  if (adminAccess) {
    const access = adminAccess;
    app.post(
      '/admin/auth/login',
      {
        schema: { body: loginBodySchema },
        config: { rateLimit: { max: 5, windowMs: 5 * 60_000, per: 'ip' as const } },
      },
      async (req) => {
        const body = req.body as z.infer<typeof loginBodySchema>;
        const { assessment, decisionId } = await risk.assessLogin({ email: body.email, ip: req.ip, deviceId: deviceIdOf(req.headers) });
        if (assessment.action === 'verify_or_block') {
          await app.securityLog.record('signin.risk_blocked', { details: { score: assessment.score, console: true } });
          throw new AppError('LOGIN_VERIFICATION_REQUIRED', 403, 'additional verification required');
        }
        const result = await service.login({
          ...body,
          deviceName: sessionName(body.deviceName, req.headers['user-agent']),
          ip: req.ip,
          deviceId: deviceIdOf(req.headers),
          only: (userId) => access.allows(userId),
        });
        await risk.attachUser(decisionId, result.user.id).catch((err) => {
          app.log.warn({ err }, 'failed to attach user to risk decision');
        });
        return result;
      },
    );
  }

  app.post(
    '/auth/refresh',
    {
      schema: { body: refreshBodySchema },
      config: {
        rateLimit: { max: 20, windowMs: 60_000, per: 'ip' as const },
      },
    },
    async (req) => {
      const tokens = await service.refresh((req.body as z.infer<typeof refreshBodySchema>).refreshToken, {
        deviceId: deviceIdOf(req.headers),
        deviceName: sessionName(undefined, req.headers['user-agent']),
        ip: req.ip,
      });
      // rotation bookkeeping ids stay server-side
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresInSeconds: tokens.accessExpiresInSeconds,
      };
    },
  );

  /**
   * Sign out: end the refresh token's session on the server so no other copy stays alive. The refresh token is the
   * credential, so no access token is needed, and the answer is the same whatever was sent.
   */
  app.post(
    '/auth/logout',
    {
      schema: { body: refreshBodySchema },
      config: { rateLimit: { max: 20, windowMs: 60_000, per: 'ip' as const } },
    },
    async (req) => {
      await service.logout((req.body as z.infer<typeof refreshBodySchema>).refreshToken);
      return { ok: true };
    },
  );

  app.post(
    '/auth/verify-email',
    {
      schema: { body: verifyEmailBodySchema },
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'ip' as const } },
    },
    async (req) => {
      await service.verifyEmail((req.body as z.infer<typeof verifyEmailBodySchema>).token);
      return { verified: true };
    },
  );

  app.post(
    '/auth/resend-verification',
    {
      schema: { body: resendVerificationBodySchema },
      // 3/hour: verification mail must not become a spam vector
      config: { rateLimit: { max: 3, windowMs: 3_600_000, per: 'ip' as const } },
    },
    async (req) => {
      await service.resendVerification(
        (req.body as z.infer<typeof resendVerificationBodySchema>).email,
      );
      // always 200 — never confirms whether the email has an account
      return { sent: true };
    },
  );

  app.post(
    '/auth/request-password-reset',
    {
      schema: { body: passwordResetRequestBodySchema },
      config: { rateLimit: { max: 3, windowMs: 3_600_000, per: 'ip' as const } },
    },
    async (req) => {
      const body = req.body as z.infer<typeof passwordResetRequestBodySchema>;
      if (!(await verifyCaptcha(config, body.captchaToken, req.ip))) {
        // same body as success — a bot learns nothing here either
        return { sent: true };
      }
      // always 200 — no account enumeration — and as quickly for an address
      // with an account as without: the lookup and the mail happen after the
      // answer, so its timing has nothing to tell
      void service.requestPasswordReset(body.email).catch((err) => {
        app.log.warn({ err }, 'password reset request failed');
      });
      return { sent: true };
    },
  );

  app.post(
    '/auth/reset-password',
    {
      schema: { body: resetPasswordBodySchema },
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'ip' as const } },
    },
    async (req) => {
      const body = req.body as z.infer<typeof resetPasswordBodySchema>;
      assertPasswordPolicy(body.password);
      // before the link is spent, so a refused password can be replaced with it
      await service.assertNotBreached(body.password);
      await service.resetPassword(body.token, body.password);
      return { reset: true };
    },
  );

  /**
   * Change the password while signed in: the current one first, then the new one under sign-up's policy and breach
   * check. Every other session ends; this one continues with the returned access token.
   */
  app.post(
    '/me/password',
    {
      schema: { body: changePasswordBodySchema },
      preHandler: requireAuth,
      // a stolen session must not become a way to guess the current password
      config: { rateLimit: { max: 5, windowMs: 15 * 60_000, per: 'user-or-ip' as const } },
    },
    async (req) => {
      const body = req.body as z.infer<typeof changePasswordBodySchema>;
      assertPasswordPolicy(body.newPassword);
      await service.assertNotBreached(body.newPassword);
      return service.changePassword(req.user!.id, req.user!.familyId, body.currentPassword, body.newPassword);
    },
  );

  // Email ownership by code. Authenticated: a just-registered user
  // has a session but an unverified email; the code is bound to that user id.
  app.post(
    '/auth/verify-email-code',
    {
      schema: { body: verifyEmailCodeBodySchema },
      preHandler: requireAuth,
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'ip' as const } },
    },
    async (req) => {
      const { code } = req.body as z.infer<typeof verifyEmailCodeBodySchema>;
      const result = await service.verifyEmailCode(req.user!.id, code);
      switch (result) {
        case 'ok':
          return { verified: true };
        case 'invalid':
          throw new AppError('INVALID_CODE', 400, 'that code is not correct', { reason: result });
        case 'expired':
        case 'no-code':
          throw new AppError('CODE_EXPIRED', 400, 'that code has expired — request a new one', { reason: result });
        case 'too-many-attempts':
          throw new AppError('TOO_MANY_ATTEMPTS', 429, 'too many attempts — request a new code', { reason: result });
      }
    },
  );

  app.post(
    '/auth/resend-verification-code',
    {
      preHandler: requireAuth,
      config: {
        // no input fields — accept an empty/absent body (opt-out)
        skipValidation: true,
        // a new code must not become a mail-spam vector, and each new code
        // comes with a fresh set of guesses — so the limit is the account's,
        // not the address it asks from: from many addresses it was unlimited
        rateLimit: { max: 4, windowMs: 3_600_000, per: 'user-or-ip' as const },
      },
    },
    async (req, reply) => {
      const sent = await service.resendVerificationCode(req.user!.id);
      // the day's ceiling of confirmation emails (auth/pending-signups.ts): said, not hidden behind "sent"
      if (!sent) {
        return reply.code(429).send({
          code: 'VERIFICATION_EMAIL_LIMIT',
          message: 'too many confirmation emails today — the last code still works until it runs out; try again tomorrow',
        });
      }
      return { sent: true };
    },
  );

  /**
   * An unconfirmed sign-up corrects its address (a typo is the commonest reason a code never arrives) and is sent the
   * code there. Checked like a sign-up address and counted against the same confirmation-email ceiling.
   */
  app.post(
    '/auth/change-pending-email',
    {
      schema: { body: z.object({ email: emailAddress }) },
      preHandler: requireAuth,
      config: { rateLimit: { max: 4, windowMs: 3_600_000, per: 'user-or-ip' as const } },
    },
    async (req) => {
      const { email } = req.body as { email: string };
      if (req.user!.guest === true) throw new AppError('GUEST_ACCOUNT', 403, 'a guest has no address to change');
      if (isDisposableEmail(email)) throw await rejected('throwaway email address');
      if (await isBannedEmail(app.db, email, req.user!.id)) throw await rejected('banned email address');
      const changed = await service.changePendingEmail(req.user!.id, email);
      return { user: changed.user, sent: changed.sent };
    },
  );

  const oauth = new OAuthService(config, app.db, defaultJwksResolver, appleTokens(config, app.db, { log: app.log }));
  app.post(
    '/auth/oauth',
    {
      schema: { body: oauthBodySchema },
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'ip' as const } },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof oauthBodySchema>;
      // signed in as a guest: a new identity claims the guest's row (auth/oauth.ts)
      const guestId = req.user?.guest === true ? req.user.id : null;
      const deviceId = deviceIdOf(req.headers);
      let decisionId: string | null = null;
      const result = await oauth.signIn(
        body.provider,
        body.idToken,
        sessionName(body.deviceName, req.headers['user-agent']),
        deviceId,
        { authorizationCode: body.authorizationCode, fullName: body.fullName },
        guestId,
        {
          // a new account through a provider is a sign-up: the same caps and the same registry, answered alike
          beforeNewAccount: async (identity) => {
            const scored = await risk.assessSignup({ email: identity.email ?? undefined, ip: req.ip, deviceId });
            decisionId = scored.decisionId;
            if (scored.assessment.hardBlock) throw await rejected('too many accounts from this device or network');
            if (await isReturningIdentity(app.db, { email: identity.email, oauth: { provider: identity.provider, subject: identity.subject } })) {
              throw await rejected('banned sign-in');
            }
          },
          refused: { deviceId, ip: req.ip },
        },
      );
      if (decisionId) {
        await risk.attachUser(decisionId, result.user.id).catch((err) => app.log.warn({ err }, 'failed to attach user to risk decision'));
      }
      const fresh = !decisionId && (await newDevice(result.user.id, deviceId).catch(() => false));
      if (!decisionId && deviceId) await writeDeviceSighting(app.db, result.user.id, deviceId).catch(() => undefined);
      if (result.created || fresh) {
        await checkReturn({
          userId: result.user.id,
          event: result.created ? 'oauth' : 'signin',
          email: result.created ? result.user.email : null,
          deviceId,
          ip: req.ip,
        });
      }
      await app.securityLog.record('signin.succeeded', { userId: result.user.id, details: { method: body.provider, newAccount: result.created } });
      return reply.code(result.created ? 201 : 200).send(result);
    },
  );
}
