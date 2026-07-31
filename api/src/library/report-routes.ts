import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { LibraryModerationService, type LibraryTargetType } from './moderation-service.js';

const idParam = z.object({ id: z.uuid() });
const reportBody = z.object({ reason: z.string().max(500).optional() });

/**
 * Community library reporting (KUR-285). Signed-in users report a post or
 * comment (text or audio) with a reason; the report feeds the unified
 * moderation queue (#102). Rate-limited (#010); one report per user per item.
 */
export function registerLibraryReportRoutes(app: FastifyInstance, mod = new LibraryModerationService(app.db)): void {
  const report = (type: LibraryTargetType) =>
    async (req: import('fastify').FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const { reason } = req.body as z.infer<typeof reportBody>;
      const res = await mod.report(type, id, req.user!.id, reason);
      if (!res.ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such item to report' });
      return { reported: true, deduped: res.deduped };
    };

  app.post(
    '/library/posts/:id/report',
    { schema: { params: idParam, body: reportBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireAuth },
    report('library_post'),
  );

  app.post(
    '/library/comments/:id/report',
    { schema: { params: idParam, body: reportBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireAuth },
    report('library_comment'),
  );
}
