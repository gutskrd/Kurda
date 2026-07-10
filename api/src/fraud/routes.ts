import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import type { FraudService } from './service.js';

const resolveBody = z.object({ decision: z.enum(['clear', 'confirm']) });

/** Admin payment-fraud review queue (KUR-073). */
export function registerFraudRoutes(app: FastifyInstance, fraud: FraudService): void {
  /** The open review queue with per-flag evidence. */
  app.get(
    '/admin/fraud/reviews',
    { preHandler: requireRoles('admin') },
    async () => ({ reviews: await fraud.pendingReviews() }),
  );

  /** Clear (release hold + grant held Gems) or confirm (keep hold) a review. */
  app.post(
    '/admin/fraud/reviews/:id/resolve',
    {
      schema: { params: z.object({ id: z.uuid() }), body: resolveBody },
      preHandler: requireRoles('admin'),
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { decision } = req.body as z.infer<typeof resolveBody>;
      return fraud.resolve(id, decision, req.user!.id);
    },
  );
}
