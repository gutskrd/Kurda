import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { safeEqual } from '../iap/webhook-auth.js';
import { emailAddress } from '../auth/email-address.js';
import type { EmailService } from './service.js';

const webhookBody = z.object({
  // provider-normalized event; adapters map SES/Postmark payloads to this
  type: z.enum(['bounce', 'complaint']),
  email: emailAddress,
});

/**
 * Email bounce and complaint webhook: a hard bounce or spam complaint suppresses the address. Guarded by a shared
 * secret compared in constant time, and fails closed (503 with no secret, 401 on mismatch) so nobody can suppress
 * arbitrary addresses.
 */
export function registerEmailWebhookRoutes(
  app: FastifyInstance,
  email: EmailService,
  secret: string | undefined,
): void {
  app.post(
    '/webhooks/email',
    { schema: { body: webhookBody }, config: { skipValidation: false } },
    async (req, reply) => {
      if (!secret) return reply.code(503).send({ error: { code: 'NOT_CONFIGURED', message: 'email webhook disabled' } });
      const provided = req.headers['x-email-secret'];
      if (typeof provided !== 'string' || !safeEqual(provided, secret)) {
        return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'bad signature' } });
      }
      const { type, email: address } = req.body as z.infer<typeof webhookBody>;
      await email.suppress(address, type);
      return { ok: true };
    },
  );
}
