import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import type { EarnService } from './service.js';
import type { ConfigService } from '../admin/config-service.js';

const ruleBody = z.object({
  amount: z.number().int().min(1).max(100_000),
  dailyCap: z.number().int().min(1).max(1_000_000).nullable(),
  cooldownSeconds: z.number().int().min(0).max(86_400),
  active: z.boolean(),
});

/**
 * The staff-tunable earning rules (a league promotion, a tournament win), admin only. A change that pays more waits in
 * Approvals for a second admin (`ConfigService.proposeEarnRule`); one that pays the same or less applies at once. Both
 * are on the audit trail.
 */
export function registerEarnRoutes(app: FastifyInstance, earn: EarnService, approvals: Pick<ConfigService, 'proposeEarnRule'>): void {
  app.get('/admin/earn-rules', { preHandler: requireRoles('admin') }, async () => ({
    rules: await earn.rules(),
  }));

  app.put(
    '/admin/earn-rules/:key',
    {
      schema: { params: z.object({ key: z.string().min(1).max(60) }), body: ruleBody },
      preHandler: requireRoles('admin'),
    },
    async (req, reply) => {
      const { key } = req.params as { key: string };
      const body = req.body as z.infer<typeof ruleBody>;
      const change = await approvals.proposeEarnRule(req.user!.id, { key, ...body });
      if (change.status === 'pending') return reply.code(202).send({ status: 'pending', id: change.id });
      return { ok: true };
    },
  );
}
