import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
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

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig): void {
  const service = new AuthService(config, app.db);

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
}
