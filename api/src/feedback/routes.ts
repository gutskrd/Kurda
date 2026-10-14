import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  APP_FEEDBACK_CATEGORIES,
  APP_FEEDBACK_COMMENT_MAX,
  APP_FEEDBACK_DAILY_LIMIT,
  APP_FEEDBACK_NOTE_MAX,
  APP_FEEDBACK_SOURCES,
  APP_FEEDBACK_STATUSES,
  APP_LOCALE_CODES,
  APP_PLATFORMS,
  type AppFeedbackRequest,
} from '@kurda/shared';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { cleanFeedbackText, type FeedbackService } from './service.js';

/**
 * The rating box and "Send feedback" (contract §F), the native store prompt's
 * bookkeeping, and the admin's feedback inbox. Shapes: @kurda/shared
 * `feedback`.
 */

/** What an app calls its version: "1.4.0", "1.4.0 (52)", "web-2026.10.12" — not free text. */
const appVersion = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\w.+() -]+$/);

/**
 * Free text up to `max` characters as it will be kept (`cleanFeedbackText`),
 * not as it was sent: the table holds the kept text to the limit, and NFC can
 * make one character three, so a text that passed as sent could fail there.
 */
const keptText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((s) => [...(cleanFeedbackText(s) ?? '')].length <= max, { message: `at most ${max} characters` });

const stateQuery = z.object({
  platform: z.enum(APP_PLATFORMS).optional(),
  appVersion: appVersion.optional(),
});

const feedbackBody = z
  .object({
    stars: z.number().int().min(1).max(5).optional(),
    categories: z.array(z.enum(APP_FEEDBACK_CATEGORIES)).max(APP_FEEDBACK_CATEGORIES.length).optional(),
    comment: keptText(APP_FEEDBACK_COMMENT_MAX).optional(),
    source: z.enum(APP_FEEDBACK_SOURCES),
    platform: z.enum(APP_PLATFORMS),
    appVersion,
    locale: z.enum(APP_LOCALE_CODES).optional(),
  })
  // "not now" is /dismiss; an answer has to say something, and a comment of
  // nothing but control characters is kept as nothing
  .refine(
    (b) => b.stars !== undefined || (b.categories?.length ?? 0) > 0 || cleanFeedbackText(b.comment) !== null,
    { message: 'stars, a category or a comment' },
  );

const promptedBody = z.object({ appVersion });

/** `stars=2` or `stars=1,2`. */
const starsList = z
  .string()
  .regex(/^[1-5](,[1-5])*$/)
  .transform((s) => [...new Set(s.split(',').map(Number))]);

/**
 * A filter the inbox sends empty — the search box cleared, "All" picked — is
 * no filter, not a malformed one.
 */
const filter = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema.optional());

const listQuery = z.object({
  status: filter(z.enum(APP_FEEDBACK_STATUSES)),
  stars: filter(starsList),
  category: filter(z.enum(APP_FEEDBACK_CATEGORIES)),
  platform: filter(z.enum(APP_PLATFORMS)),
  source: filter(z.enum(APP_FEEDBACK_SOURCES)),
  q: filter(z.string().trim().max(80)),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  // the last answer already shown: the next page starts after it, wherever marking has moved the rest
  beforeId: filter(z.uuid()),
});

const patchBody = z
  .object({
    status: z.enum(APP_FEEDBACK_STATUSES).optional(),
    adminNote: keptText(APP_FEEDBACK_NOTE_MAX).nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.adminNote !== undefined, { message: 'nothing to change' });

/**
 * Who reads the feedback: the moderators, the superadmins, support, and the
 * legacy catch-all admin role. (In /admin/session terms that is everyone with
 * `users.view`, plus the legacy role, which has no capabilities of its own.)
 */
export const FEEDBACK_READERS = ['moderator', 'superadmin', 'admin', 'support'] as const;

export function registerFeedbackRoutes(app: FastifyInstance, feedback: FeedbackService): void {
  const readers = [requireAuth, requireRoles(...FEEDBACK_READERS)];

  /** Is the box due, and may this phone ask for a store review now. */
  app.get(
    '/me/app-feedback/state',
    { schema: { querystring: stateQuery }, preHandler: requireAuth },
    async (req) => feedback.state(req.user!.id, req.query as z.infer<typeof stateQuery>),
  );

  /** An answer, from the box or from Settings → Send feedback. */
  app.post(
    '/me/app-feedback',
    {
      schema: { body: feedbackBody },
      config: { rateLimit: { max: APP_FEEDBACK_DAILY_LIMIT, windowMs: 24 * 3_600_000 } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const saved = await feedback.submit(req.user!.id, req.body as AppFeedbackRequest);
      if (!saved) throw new AppError('NOT_FOUND', 404, 'no such account');
      return reply.code(201).send(saved);
    },
  );

  /** "Not now": the box counts as shown and does not come back. */
  app.post(
    '/me/app-feedback/dismiss',
    { config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => {
      await feedback.dismiss(req.user!.id);
      return { ok: true };
    },
  );

  /** The phone has just called the native store prompt for this app version. */
  app.post(
    '/me/store-review/prompted',
    { schema: { body: promptedBody }, preHandler: requireAuth },
    async (req) => {
      await feedback.storeReviewPrompted(req.user!.id, (req.body as z.infer<typeof promptedBody>).appVersion);
      return { ok: true };
    },
  );

  // ---- admin: the inbox ----------------------------------------------------

  app.get('/admin/feedback', { schema: { querystring: listQuery }, preHandler: readers }, async (req) =>
    feedback.list(req.query as z.infer<typeof listQuery>),
  );

  app.get('/admin/feedback/summary', { preHandler: readers }, async () => feedback.summary());

  app.patch(
    '/admin/feedback/:id',
    { schema: { params: z.object({ id: z.uuid() }), body: patchBody }, preHandler: readers },
    async (req) => {
      const { id } = req.params as { id: string };
      const updated = await feedback.update(id, req.body as z.infer<typeof patchBody>);
      if (!updated) throw new AppError('NOT_FOUND', 404, 'no such feedback');
      return updated;
    },
  );
}
