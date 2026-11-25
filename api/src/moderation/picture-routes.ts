import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { PICTURE_CASE_VIEWS, PICTURE_REVIEW_NOTE_MAX, REPORT_CATEGORY_KEYS, type PictureCaseView, type PictureDecision } from '@kurda/shared';
import { requireCapability } from '../admin/routes.js';
import { AuditService } from '../admin/audit-service.js';
import { requireAccount, requireAuth } from '../plugins/auth.js';
import type { CasesService } from './cases-service.js';
import type { StoredPicture } from './picture-release.js';
import type { PictureReviewService } from './pictures-service.js';

const idParam = z.object({ id: lowerUuid() });
const note = z.string().trim().max(1000).optional();
const decideBody = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), note }),
  z.object({ decision: z.literal('remove'), policy: z.enum(REPORT_CATEGORY_KEYS), note }),
]);
const listQuery = z.object({
  view: z.enum(PICTURE_CASE_VIEWS).optional(),
  cursor: z.string().max(500).optional(),
});

/** A picture's bytes for a moderator's console: never cached, never sniffed into something else. */
export function sendStoredPicture(reply: FastifyReply, file: StoredPicture): FastifyReply {
  return reply
    .header('content-type', file.contentType)
    .header('cache-control', 'no-store')
    .header('x-content-type-options', 'nosniff')
    .header('content-disposition', 'inline')
    .send(file.bytes);
}

/**
 * The Picture checks page and asking for a person. Admin routes need the `moderation.act` capability and, under
 * /admin, a verified second factor; decisions are audited by the admin audit hook, and every fetch of a picture's bytes
 * writes its own audit entry, since a GET is not otherwise audited. The case-evidence bytes route serves the case view
 * the same way, so evidence shows under the console's image policy.
 */
export function registerPictureRoutes(app: FastifyInstance, deps: { pictures: PictureReviewService; cases: CasesService }): void {
  const { pictures, cases } = deps;
  const guard = [requireAuth, requireCapability('moderation.act')];
  const audit = new AuditService(app.db);
  const audited = (adminId: string, action: string, caseId: string, requestId: string, after?: unknown) =>
    audit
      .record(app.db, { adminId, action, targetType: 'moderation_case', targetId: caseId, requestId, after })
      .catch((err) => app.log.error({ err, caseId }, 'admin audit write failed'));

  app.get('/admin/pictures', { schema: { querystring: listQuery }, preHandler: guard }, async (req) => {
    const q = req.query as z.infer<typeof listQuery>;
    return pictures.list((q.view ?? 'waiting') as PictureCaseView, q.cursor, req.user!.id);
  });

  app.get('/admin/pictures/:id/image', { schema: { params: idParam }, preHandler: guard }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const file = await pictures.image(id, req.user!.id);
    await audited(req.user!.id, 'GET /admin/pictures/:id/image', id, String(req.id));
    return sendStoredPicture(reply, file);
  });

  app.post('/admin/pictures/:id/decide', { schema: { params: idParam, body: decideBody }, preHandler: guard }, async (req) => {
    await pictures.decide((req.params as { id: string }).id, req.user!.id, req.body as PictureDecision);
    return { ok: true };
  });

  app.get(
    '/admin/moderation/cases/:id/media',
    { schema: { params: idParam, querystring: z.object({ key: z.string().min(1).max(512) }) }, preHandler: guard },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { key } = req.query as { key: string };
      const file = await cases.evidenceFile(id, key, req.user!.id);
      await audited(req.user!.id, 'GET /admin/moderation/cases/:id/media', id, String(req.id), { key });
      return sendStoredPicture(reply, file);
    },
  );

  app.post(
    '/me/picture-reviews/:id',
    {
      // any id that is not one of yours is "not found", so it is not checked for shape here
      schema: { params: z.object({ id: z.string().min(1).max(64) }), body: z.object({ note: z.string().max(PICTURE_REVIEW_NOTE_MAX).optional() }).nullish() },
      // a person asks about their own refusals, a few an hour at most
      config: { rateLimit: { max: 5, windowMs: 60 * 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAccount,
    },
    async (req, reply) => {
      const body = req.body as { note?: string } | null | undefined;
      await pictures.ask(req.user!.id, (req.params as { id: string }).id, body?.note);
      return reply.code(202).send({ ok: true });
    },
  );
}
