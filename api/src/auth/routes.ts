import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import { OAuthService } from './oauth.js';
import { AuthService } from './service.js';

export const registerBodySchema = z.object({
  email: z.email().max(254),
  username: z.string().min(3).max(30),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(60).optional(),
  locale: z.enum(['en', 'ku', 'de', 'tr', 'ar']).optional(),
  timezone: z.string().max(50).optional(),
  deviceName: z.string().max(80).optional(),
});

export const loginBodySchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
  deviceName: z.string().max(80).optional(),
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

export const verifyEmailBodySchema = z.object({
  token: z.string().min(20).max(200),
});

export const resendVerificationBodySchema = z.object({
  email: z.email().max(254),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(128),
});

export const oauthBodySchema = z.object({
  provider: z.enum(['google', 'apple']),
  idToken: z.string().min(20).max(4_096),
  deviceName: z.string().max(80).optional(),
});

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig): void {
  const service = new AuthService(config, app.db, { jobs: app.jobs, log: app.log });

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
      const result = await service.register(req.body as z.infer<typeof registerBodySchema>);
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
    async (req) => service.login(req.body as z.infer<typeof loginBodySchema>),
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
      schema: { body: resendVerificationBodySchema },
      config: { rateLimit: { max: 3, windowMs: 3_600_000, per: 'ip' as const } },
    },
    async (req) => {
      await service.requestPasswordReset(
        (req.body as z.infer<typeof resendVerificationBodySchema>).email,
      );
      // always 200 — no account enumeration
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
      await service.resetPassword(body.token, body.password);
      return { reset: true };
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
