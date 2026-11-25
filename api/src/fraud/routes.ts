import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { requireRoles } from '../plugins/auth.js';
import type { FraudService } from './service.js';

const resolveBody = z.object({ decision: z.enum(['clear', 'confirm']) });

/** Admin payment-fraud review queue. */
export function registerFraudRoutes(app: FastifyInstance, fraud: FraudService): void {
  /** The open review queue with per-flag evidence. */
  app.get(
    '/admin/fraud/reviews',
    { preHandler: requireRoles('admin') },
    async () => ({ reviews: await fraud.pendingReviews() }),
  );

  /** Clear (release hold + grant held Zêr) or confirm (keep hold) a review. */
  app.post(
    '/admin/fraud/reviews/:id/resolve',
    {
      schema: { params: z.object({ id: lowerUuid() }), body: resolveBody },
      // clearing a review grants the Zêr it held: an economy write like any other
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireRoles('admin'),
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { decision } = req.body as z.infer<typeof resolveBody>;
      return fraud.resolve(id, decision, req.user!.id);
    },
  );
}
