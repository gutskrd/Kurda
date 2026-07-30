import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { ExperimentService } from './service.js';

const keyParam = z.object({ key: z.string().min(1).max(64) });
const variantSchema = z.object({ key: z.string().min(1).max(64), weight: z.number().min(0).max(1_000_000) });
const upsertBody = z.object({
  key: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9_]*$/),
  description: z.string().max(300).nullable().optional(),
  enabled: z.boolean().optional(),
  variants: z.array(variantSchema).min(1).max(20),
});

/** A/B experiment assignment (client SDK) + admin config (KUR-107). */
export function registerExperimentRoutes(app: FastifyInstance, experiments: ExperimentService): void {
  /** SDK bulk fetch: all active assignments for the caller (cache these). */
  app.get('/experiments', { preHandler: requireAuth }, async (req) => ({
    assignments: await experiments.assignmentsFor(req.user!.id),
  }));

  /** One experiment's variant for the caller. */
  app.get('/experiments/:key', { schema: { params: keyParam }, preHandler: requireAuth }, async (req) => ({
    variant: await experiments.variant(req.user!.id, (req.params as z.infer<typeof keyParam>).key),
  }));

  /** Admin: list all experiments. */
  app.get('/admin/experiments', { config: { skipValidation: true }, preHandler: requireRoles('admin') }, async () => ({
    experiments: await experiments.list(),
  }));

  /** Admin: create/replace an experiment. */
  app.post('/admin/experiments', { schema: { body: upsertBody }, preHandler: requireRoles('admin') }, async (req, reply) => {
    const experiment = await experiments.upsert(req.body as z.infer<typeof upsertBody>);
    return reply.code(201).send({ experiment });
  });

  /** Admin kill switch. */
  app.post(
    '/admin/experiments/:key/enabled',
    { schema: { params: keyParam, body: z.object({ enabled: z.boolean() }) }, preHandler: requireRoles('admin') },
    async (req, reply) => {
      const { key } = req.params as z.infer<typeof keyParam>;
      const found = await experiments.setEnabled(key, (req.body as { enabled: boolean }).enabled);
      if (!found) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such experiment' });
      return { ok: true };
    },
  );
}
