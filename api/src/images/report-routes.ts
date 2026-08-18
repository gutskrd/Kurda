import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { ImageReportService, type ImageTargetType } from './report-service.js';

const idParam = z.object({ id: z.uuid() });
const reportBody = z.object({ reason: z.string().max(500).optional() });

/**
 * Image/meme reporting (KUR-292). Signed-in users report a post or a comment with
 * a reason; the report feeds the unified moderation queue (#102). Rate-limited
 * (#010); one report per user per item.
 */
export function registerImageReportRoutes(app: FastifyInstance, mod = new ImageReportService(app.db)): void {
  const report = (type: ImageTargetType) => async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as z.infer<typeof reportBody>;
    const res = await mod.report(type, id, req.user!.id, reason);
    if (!res.ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such item to report' });
    return { reported: true, deduped: res.deduped };
  };

  app.post(
    '/images/:id/report',
    { schema: { params: idParam, body: reportBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireAuth },
    report('image_post'),
  );

  app.post(
    '/images/comments/:id/report',
    { schema: { params: idParam, body: reportBody }, config: { rateLimit: { max: 20, windowMs: 60_000 } }, preHandler: requireAuth },
    report('image_comment'),
  );
}
