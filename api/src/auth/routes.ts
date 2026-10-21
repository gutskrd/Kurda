import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../plugins/errors.js';
import { verifyCaptcha } from './captcha.js';
import { isDisposableEmail } from './disposable-domains.js';
import { emailAddress } from './email-address.js';
import { OAuthService } from './oauth.js';
import { signupRejected } from './rejections.js';
import { isBannedEmail } from '../moderation/ban-registry.js';
import { AuthService } from './service.js';
import { RiskService } from '../risk/service.js';
import { validateUsername, USERNAME_ERROR_MESSAGE } from '../users/username.js';
import { validatePassword, PASSWORD_ERROR_MESSAGE, PASSWORD_MIN, PASSWORD_MAX } from './password-policy.js';
import { requireAuth } from '../plugins/auth.js';
import { APP_LOCALE_CODES } from '@kurda/shared';
import { safeTimeZone } from '../streaks/streak-logic.js';
import { assertOldEnough, birthMonthSchema, birthYearSchema } from '../users/birth-month.js';

/** Rejects a password that fails policy with a specific, actionable reason. */
function assertPasswordPolicy(password: string): void {
  const check = validatePassword(password);
  if (!check.ok) {
    throw new AppError('WEAK_PASSWORD', 400, PASSWORD_ERROR_MESSAGE[check.reason], { reason: check.reason });
  }
}

/** Optional client device fingerprint (#110), supplied as a header. */
function deviceIdOf(headers: Record<string, unknown>): string | null {
  const raw = headers['x-device-id'];
  if (typeof raw === 'string' && raw.length > 0 && raw.length <= 200) return raw;
  return null;
}

export const registerBodySchema = z.object({
  email: emailAddress,
  username: z.string().min(3).max(30),
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX),
  displayName: z.string().min(1).max(60).optional(),
  /* every language the interface is offered in — one list, so the picker
       cannot offer something the server would refuse */
    locale: z.enum(APP_LOCALE_CODES).optional(),
  // an unknown zone is dropped (the account gets UTC) rather than stored:
  // see safeTimeZone in streaks/streak-logic.ts for what one used to break
  timezone: z
    .string()
    .max(50)
    .optional()
    .transform((tz) => (tz && safeTimeZone(tz) === tz ? tz : undefined)),
  deviceName: z.string().max(80).optional(),
  captchaToken: z.string().max(3_000).optional(),
  /** Explicit, versioned consent to ToS + privacy policy (KUR-109). */
  acceptTerms: z.literal(true),
  /**
   * Birth month and year, always. The forms ask with no default, and every
   * protection for minors rests on the answer: an account made without one
   * would be nobody's age at all, so none is made. (Google and Apple sign-up,
   * which tell us nothing about age, are asked once after signing in, and
   * until then are treated as not known to be adults — users/age.ts.)
   */
  birthYear: birthYearSchema,
  birthMonth: birthMonthSchema,
});

export const loginBodySchema = z.object({
  email: emailAddress,
  password: z.string().min(1).max(128),
  deviceName: z.string().max(80).optional(),
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

export const oauthBodySchema = z.object({
  provider: z.enum(['google', 'apple']),
  idToken: z.string().min(20).max(4_096),
  deviceName: z.string().max(80).optional(),
});

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig): void {
  const service = new AuthService(config, app.db, { jobs: app.jobs, log: app.log, redis: app.redis });
  // Risk scoring (KUR-296): assesses signup/login, enforces per-device/IP caps,
  // logs decisions for tuning + audit. IP reputation defaults to neutral until a
  // provider is configured (graceful degradation).
  const risk = new RiskService(app.db, { redis: app.redis });

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
      if (!uname.ok) throw new AppError('INVALID_USERNAME', 400, USERNAME_ERROR_MESSAGE[uname.reason], { reason: uname.reason });
      assertPasswordPolicy(body.password);
      if (isDisposableEmail(body.email)) throw signupRejected();
      if (!(await verifyCaptcha(config, body.captchaToken, req.ip))) throw signupRejected();
      // a password every attacker tries first is refused with its own reason
      await service.assertNotBreached(body.password);

      // Risk decision: a per-device/IP cap breach hard-blocks (generic rejection
      // so we never reveal which anti-abuse control fired, KUR-025). Lower bands
      // proceed — CAPTCHA above is the baseline step-up.
      const { assessment, decisionId } = await risk.assessSignup({
        email: body.email,
        ip: req.ip,
        deviceId: deviceIdOf(req.headers),
      });
      if (assessment.hardBlock) throw signupRejected();
      // a permanently banned person's address (or a +tag/dot variant of it)
      if (await isBannedEmail(app.db, body.email)) throw signupRejected();

      const result = await service.register({ ...body, deviceId: deviceIdOf(req.headers), ip: req.ip });
      await risk.attachUser(decisionId, result.user.id).catch((err) => {
        app.log.warn({ err }, 'failed to attach user to risk decision');
      });
      return reply.code(201).send(result);
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
        throw new AppError('LOGIN_VERIFICATION_REQUIRED', 403, 'additional verification required');
      }
      const result = await service.login({ ...body, ip: req.ip, deviceId: deviceIdOf(req.headers) });
      await risk.attachUser(decisionId, result.user.id).catch((err) => {
        app.log.warn({ err }, 'failed to attach user to risk decision');
      });
      return result;
    },
  );

  app.post(
    '/auth/refresh',
    {
      schema: { body: refreshBodySchema },
      config: {
        rateLimit: { max: 20, windowMs: 60_000, per: 'ip' as const },
      },
    },
    async (req) => {
      const tokens = await service.refresh(
        (req.body as z.infer<typeof refreshBodySchema>).refreshToken,
      );
      // rotation bookkeeping ids stay server-side
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        accessExpiresInSeconds: tokens.accessExpiresInSeconds,
      };
    },
  );

  /**
   * Sign out: ends the session the refresh token belongs to, on the server.
   * The apps used to forget their tokens and nothing else, which left the
   * session alive for its thirty days to whoever else held a copy. The refresh
   * token is the credential, so no access token is needed (it may already have
   * expired), and the answer is the same whatever was sent.
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
   * Change the password while signed in: the current one first, then the new
   * one under the same policy and breach check as sign-up. Every other session
   * ends; this one carries on with the access token in the answer.
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

  // Email ownership by code (KUR-014). Authenticated: a just-registered user
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
        // no input fields — accept an empty/absent body (KUR-005 opt-out)
        skipValidation: true,
        // a new code must not become a mail-spam vector, and each new code
        // comes with a fresh set of guesses — so the limit is the account's,
        // not the address it asks from: from many addresses it was unlimited
        rateLimit: { max: 4, windowMs: 3_600_000, per: 'user-or-ip' as const },
      },
    },
    async (req) => {
      await service.resendVerificationCode(req.user!.id);
      return { sent: true };
    },
  );

  const oauth = new OAuthService(config, app.db);
  app.post(
    '/auth/oauth',
    {
      schema: { body: oauthBodySchema },
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'ip' as const } },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof oauthBodySchema>;
      const result = await oauth.signIn(body.provider, body.idToken, body.deviceName);
      return reply.code(result.created ? 201 : 200).send(result);
    },
  );
}
