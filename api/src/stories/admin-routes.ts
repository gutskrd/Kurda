/**
 * Writing stories in the admin panel (the same people who edit lessons and
 * record their audio; the admin 2FA gate covers every /admin route).
 *
 *   GET    /admin/stories?status=&dialect=   every story, with what stands between each and publishing
 *   GET    /admin/stories/:id                one story with its questions
 *   POST   /admin/stories                    a new draft (slug from the title when not given)
 *   PUT    /admin/stories/:id                replace a draft or a story in review: { …story, lockVersion }
 *   POST   /admin/stories/:id/submit         draft → in review           (the whole story is checked)
 *   POST   /admin/stories/:id/publish        draft / in review → published (checked; audited)
 *   POST   /admin/stories/:id/unpublish      published → draft            (audited)
 *   POST   /admin/stories/:id/archive        → archived                   (audited)
 *   DELETE /admin/stories/:id                only a story no game has used (audited; else 409 IN_USE)
 *
 * Every change carries the `lockVersion` the editor loaded — in the body, or
 * as `?lockVersion=` on DELETE — and a stale one is refused with 409 STALE. It
 * is required, not optional: publishing is the review gate, and a publish
 * that named no version would publish whatever is stored at that moment,
 * including a draft the importer replaced after the reviewer read it.
 *
 * A story that fails `validateStory` is refused with 422 INVALID and
 * `details: { errors, warnings }`, each with a path to the field. Every story
 * returned carries `problems`: what would stop it being published and what
 * is worth a second look.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { STORY_DIALECTS } from '@kurda/shared';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { storyContentSchema, storyInputFrom, storySlugSchema } from './schema.js';
import { STORY_EDITOR_ROLES, type StoryAdminService } from './admin-service.js';

export { STORY_EDITOR_ROLES };

const STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;

const idParam = z.object({ id: z.uuid() });
const listQuery = z.object({ status: z.enum(STATUSES).optional(), dialect: z.enum(STORY_DIALECTS).optional() });
const createBody = storyContentSchema.extend({ slug: storySlugSchema.nullish() });
// the whole draft, every field: a client that leaves the questions out must not have deleted them
const updateBody = storyContentSchema.extend({
  slug: storySlugSchema,
  summary: storyContentSchema.shape.summary.unwrap(),
  body: storyContentSchema.shape.body.unwrap(),
  glossary: storyContentSchema.shape.glossary.unwrap(),
  questions: storyContentSchema.shape.questions.unwrap(),
  lockVersion: z.number().int().min(0),
});
const lockBody = z.object({ lockVersion: z.number().int().min(0) });
const deleteQuery = z.object({ lockVersion: z.coerce.number().int().min(0) });

function context(req: FastifyRequest): { adminId: string; requestId: string } {
  return { adminId: req.user!.id, requestId: req.id };
}

export function registerStoryAdminRoutes(app: FastifyInstance, stories: StoryAdminService): void {
  const preHandler = [requireAuth, requireRoles(...STORY_EDITOR_ROLES)];

  app.get('/admin/stories', { schema: { querystring: listQuery }, preHandler }, async (req) => ({
    stories: await stories.list(req.query as z.infer<typeof listQuery>),
  }));

  app.get('/admin/stories/:id', { schema: { params: idParam }, preHandler }, async (req) => {
    const story = await stories.get((req.params as z.infer<typeof idParam>).id);
    if (!story) throw new AppError('NOT_FOUND', 404, 'no such story');
    return story;
  });

  app.post('/admin/stories', { schema: { body: createBody }, preHandler }, async (req, reply) => {
    const b = req.body as z.infer<typeof createBody>;
    const story = await stories.create({ ...storyInputFrom(b), slug: b.slug ?? null }, context(req));
    return reply.code(201).send(story);
  });

  app.put('/admin/stories/:id', { schema: { params: idParam, body: updateBody }, preHandler }, async (req) => {
    const b = req.body as z.infer<typeof updateBody>;
    const { id } = req.params as z.infer<typeof idParam>;
    return stories.update(id, { ...storyInputFrom(b), slug: b.slug }, b.lockVersion, context(req));
  });

  for (const action of ['submit', 'publish', 'unpublish', 'archive'] as const) {
    app.post(`/admin/stories/:id/${action}`, { schema: { params: idParam, body: lockBody }, preHandler }, async (req) => {
      const { id } = req.params as z.infer<typeof idParam>;
      const { lockVersion } = req.body as z.infer<typeof lockBody>;
      return stories.transition(id, action, { ...context(req), lockVersion });
    });
  }

  app.delete('/admin/stories/:id', { schema: { params: idParam, querystring: deleteQuery }, preHandler }, async (req) => {
    const { id } = req.params as z.infer<typeof idParam>;
    const { lockVersion } = req.query as z.infer<typeof deleteQuery>;
    await stories.delete(id, { ...context(req), lockVersion });
    return { id, deleted: true };
  });
}
