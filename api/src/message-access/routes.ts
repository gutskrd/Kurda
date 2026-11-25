import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { REVIEW_CONVERSATION_KINDS, SAFETY_REVIEW_NOTE_MAX, SAFETY_REVIEW_NOTE_MIN, SAFETY_REVIEW_REASONS, type ReviewConversationKind } from '@kurda/shared';
import { requireAdmin, requireCapability } from '../admin/routes.js';
import { ADMIN_ROLES, LEGACY_ADMIN_ROLE } from '../admin/roles.js';
import type { AdminTotpService } from '../admin/totp-service.js';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { MessageAccessService } from './service.js';

const idParam = z.object({ id: z.uuid() });
const grantBody = z.object({
  reason: z.enum(SAFETY_REVIEW_REASONS),
  note: z.string().trim().min(SAFETY_REVIEW_NOTE_MIN).max(SAFETY_REVIEW_NOTE_MAX),
  reviewerId: z.uuid().optional(),
  caseId: z.uuid().optional(),
});
const conversationParams = z.object({ id: z.uuid(), kind: z.enum(REVIEW_CONVERSATION_KINDS), conversationId: z.uuid() });
const pageQuery = z.object({ before: z.uuid().optional() });
const logQuery = z.object({ before: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(200).optional() });
// an empty POST arrives with no body at all
const noBody = z.object({}).nullish();

/** Reading a review a page at a time is a person reading, not a copy being taken: this many pages an hour. */
const READ_LIMIT = { max: 120, windowMs: 60 * 60_000, per: 'user-or-ip' as const };

/**
 * Safety reviews and the Access log, behind the console's second factor. Only a superadmin opens a review, at most a
 * few an hour on top of the service's daily count; only its reader opens what it covers; and every admin can read the
 * Access log, so nobody reads private messages unseen.
 */
export function registerMessageAccessRoutes(app: FastifyInstance, access: MessageAccessService, totp: AdminTotpService): void {
  const moderators = [requireAuth, requireCapability('moderation.act')];

  app.post(
    '/admin/users/:id/safety-reviews',
    {
      schema: { params: idParam, body: grantBody },
      config: { rateLimit: { max: 5, windowMs: 60 * 60_000, per: 'user-or-ip' as const, onStoreDown: 'local' as const } },
      preHandler: [requireAuth, requireAdmin(totp, 'superadmin')],
    },
    async (req, reply) => {
      const review = await access.grant(req.user!.id, (req.params as { id: string }).id, req.body as z.infer<typeof grantBody>, String(req.id));
      return reply.code(201).send({ review });
    },
  );

  app.get('/admin/safety-reviews', { config: { skipValidation: true }, preHandler: moderators }, async (req) => ({
    reviews: await access.openReviews(req.user!.id),
  }));

  app.post('/admin/safety-reviews/:id/end', { schema: { params: idParam, body: noBody }, preHandler: moderators }, async (req) => ({
    review: await access.end((req.params as { id: string }).id, req.user!.id, req.user!.roles.includes('superadmin'), String(req.id)),
  }));

  app.get('/admin/safety-reviews/:id', { schema: { params: idParam }, config: { rateLimit: READ_LIMIT }, preHandler: moderators }, async (req) =>
    access.opened((req.params as { id: string }).id, req.user!.id, String(req.id)),
  );

  app.get(
    '/admin/safety-reviews/:id/conversations/:kind/:conversationId',
    { schema: { params: conversationParams, querystring: pageQuery }, config: { rateLimit: READ_LIMIT }, preHandler: moderators },
    async (req) => {
      const p = req.params as { id: string; kind: ReviewConversationKind; conversationId: string };
      const { before } = req.query as z.infer<typeof pageQuery>;
      return access.read(p.id, req.user!.id, p.kind, p.conversationId, before ?? null, String(req.id));
    },
  );

  app.get(
    '/admin/message-access/log',
    { schema: { querystring: logQuery }, preHandler: [requireAuth, requireRoles(...ADMIN_ROLES, LEGACY_ADMIN_ROLE)] },
    async (req) => {
      const q = req.query as z.infer<typeof logQuery>;
      return access.log(req.user!.id, q.before ?? null, q.limit);
    },
  );
}
