import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import type { EarnService } from './service.js';

const ruleBody = z.object({
  amount: z.number().int().min(1).max(100_000),
  dailyCap: z.number().int().min(1).max(1_000_000).nullable(),
  cooldownSeconds: z.number().int().min(0).max(86_400),
  active: z.boolean(),
});

/** The staff-tunable earning rules (a league promotion, a tournament win), admin only. */
export function registerEarnRoutes(app: FastifyInstance, earn: EarnService): void {
  app.get('/admin/earn-rules', { preHandler: requireRoles('admin') }, async () => ({
    rules: await earn.rules(),
  }));

  app.put(
    '/admin/earn-rules/:key',
    {
      schema: { params: z.object({ key: z.string().min(1).max(60) }), body: ruleBody },
      preHandler: requireRoles('admin'),
    },
    async (req) => {
      const { key } = req.params as { key: string };
      const body = req.body as z.infer<typeof ruleBody>;
      await earn.upsertRule({ key, ...body });
      return { ok: true };
    },
  );
}
