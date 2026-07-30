import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { PhoneVerificationService } from './phone-verification-service.js';

const sendBody = z.object({ phone: z.string().min(4).max(32) });
const verifyBody = z.object({ phone: z.string().min(4).max(32), code: z.string().min(4).max(10) });

/**
 * Optional phone (SMS) verification routes (KUR-297). All authenticated and
 * rate-limited (#010) — code sends are the abuse-sensitive step. Never required
 * for normal use; a user without a phone is unaffected.
 */
export function registerPhoneVerificationRoutes(
  app: FastifyInstance,
  phone: PhoneVerificationService,
): void {
  /** Current verification status (verified? + masked number). */
  app.get('/auth/phone', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) =>
    phone.status(req.user!.id),
  );

  /** Send (or resend) a code to a number. */
  app.post(
    '/auth/phone/send',
    {
      schema: { body: sendBody },
      config: { rateLimit: { max: 5, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { phone: raw } = req.body as z.infer<typeof sendBody>;
      const res = await phone.send(req.user!.id, raw);
      if (res.ok) return { sent: true, masked: res.masked, resent: res.resent };
      switch (res.reason) {
        case 'invalid-number':
          return reply.code(422).send({ code: 'INVALID_NUMBER', message: 'enter a valid phone number' });
        case 'cooldown':
          return reply
            .code(429)
            .send({ code: 'RESEND_COOLDOWN', message: 'please wait before requesting another code', retryAfterMs: res.retryAfterMs });
        case 'max-sends':
          return reply.code(429).send({ code: 'MAX_SENDS', message: 'too many codes sent — try again later' });
      }
    },
  );

  /** Verify a submitted code. */
  app.post(
    '/auth/phone/verify',
    {
      schema: { body: verifyBody },
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { phone: raw, code } = req.body as z.infer<typeof verifyBody>;
      const res = await phone.verify(req.user!.id, raw, code);
      if (res.ok) return { verified: true, masked: res.masked };
      const status = res.reason === 'too-many-attempts' ? 429 : res.reason === 'no-session' ? 404 : 422;
      return reply.code(status).send({ code: res.reason.toUpperCase().replace(/-/g, '_'), message: 'verification failed', remaining: res.remaining });
    },
  );

  /** Remove the verified phone from the account. */
  app.delete('/auth/phone', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => {
    await phone.remove(req.user!.id);
    return { removed: true };
  });
}
