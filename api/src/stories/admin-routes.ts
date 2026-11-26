/**
 * Story writing routes for the admin panel (lesson editors; the admin 2FA gate covers every /admin route).
 *
 *   GET    /admin/stories?q&status&dialect&level&category&review&featured&limit&offset
 *                                            a page of stories, with what stands between each and publishing
 *   GET    /admin/stories/:id                one story with its questions, dictionary links, recordings and versions
 *   POST   /admin/stories                    a new draft (slug from the title when not given): { …story, sameStoryAs? }
 *   PUT    /admin/stories/:id                replace a draft or a story in review: { …story, lockVersion, sameStoryAs? }
 *   POST   /admin/stories/:id/submit         draft → in review           (the whole story is checked)
 *   POST   /admin/stories/:id/publish        draft / in review → published (checked; approved; audited)
 *   POST   /admin/stories/:id/unpublish      published → draft            (audited)
 *   POST   /admin/stories/:id/archive        → archived                   (audited)
 *   POST   /admin/stories/:id/review         { approved, note?, lockVersion }: approve, or withdraw approval (audited)
 *   POST   /admin/stories/:id/feature        { featured, lockVersion }: the library's Featured row (audited)
 *   PUT    /admin/stories/:id/translations/:locale
 *                                            { lockVersion, body?, title?, summary?, questions?, reflections?, notes? }: correct one
 *                                            language, in any status but archived, published included; the approval stays and the
 *                                            language is marked unreviewed (audited)
 *   POST   /admin/stories/:id/translations/:locale/review
 *                                            { status: 'reviewed' | 'unreviewed', note?, lockVersion }: a native speaker's verdict on
 *                                            that language's translation (audited)
 *   DELETE /admin/stories/:id                only a story no game has used (audited; else 409 IN_USE)
 *
 *   GET    /admin/story-categories           every category
 *   POST   /admin/story-categories           { slug, name, position? }
 *   PUT    /admin/story-categories/:slug     { name, position? }
 *   DELETE /admin/story-categories/:slug     409 IN_USE with the count, unless ?force=1 (the stories are left unfiled)
 *
 * Every story change must carry the `lockVersion` the editor loaded (in the body, or `?lockVersion=` on DELETE); a stale
 * one is 409 STALE. It is required because publishing is the review gate: a publish without a version could publish a
 * draft the importer replaced after the reviewer read it. Publishing an unapproved story is 409 NOT_REVIEWED.
 *
 * A story failing `validateStory` is 422 INVALID with `details: { errors, warnings }`, each with a field path. Every
 * story returned carries `problems`: what blocks publishing and what deserves a second look.
 *
 * The whole-story PUT takes translations too, and a changed translation there counts as changed content (the approval
 * goes). The per-language PUT corrects one translation, on a published story too, without losing the Kurdish approval.
 * Neither takes `translationReview` from the editor: it follows from what changed and from the review route.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { APP_LOCALE_CODES, STORY_DIALECTS, STORY_LEVELS, STORY_REVIEW_NOTE_MAX, STORY_TRANSLATION_REVIEW_STATUSES, type AppLocale } from '@kurda/shared';
import { pageQuery } from '../http/query.js';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import {
  categoryNameSchema,
  categorySlugSchema,
  noteTranslationSchema,
  questionTranslationSchema,
  storyContentSchema,
  storyInputFrom,
  storySlugSchema,
} from './schema.js';
import { STORY_EDITOR_ROLES, type StoryAdminService } from './admin-service.js';

export { STORY_EDITOR_ROLES };

const STATUSES = ['draft', 'in_review', 'published', 'archived'] as const;
const absentIfEmpty = (v: unknown): unknown => (v === '' ? undefined : v);

const idParam = z.object({ id: lowerUuid() });
const localeParams = z.object({ id: lowerUuid(), locale: z.enum(APP_LOCALE_CODES) });
const slugParam = z.object({ slug: categorySlugSchema });
const listQuery = z.object({
  q: z.preprocess(absentIfEmpty, z.string().max(80).optional()),
  status: z.preprocess(absentIfEmpty, z.enum(STATUSES).optional()),
  dialect: z.preprocess(absentIfEmpty, z.enum(STORY_DIALECTS).optional()),
  level: z.preprocess(absentIfEmpty, z.coerce.number().int().min(STORY_LEVELS[0]).max(STORY_LEVELS[STORY_LEVELS.length - 1]!).optional()),
  category: z.preprocess(absentIfEmpty, categorySlugSchema.optional()),
  review: z.preprocess(absentIfEmpty, z.enum(['unreviewed', 'approved']).optional()),
  featured: z.preprocess(absentIfEmpty, z.enum(['1', '0', 'true', 'false']).optional()),
  ...pageQuery,
});
const sameStoryAs = lowerUuid().nullish();
// who reviewed which translation is recorded by the server, never sent with a save
const editorContent = storyContentSchema.omit({ translationReview: true });
const createBody = editorContent.extend({ slug: storySlugSchema.nullish(), sameStoryAs });
// the whole draft, every field: a client that leaves the questions out must not have deleted them. What a legend
// carries besides its text arrived later: an editor that does not send it (one opened before it existed) keeps it as stored
const updateBody = editorContent.extend({
  slug: storySlugSchema,
  summary: storyContentSchema.shape.summary.unwrap(),
  body: storyContentSchema.shape.body.unwrap(),
  glossary: storyContentSchema.shape.glossary.unwrap(),
  questions: storyContentSchema.shape.questions.unwrap(),
  metaTranslations: storyContentSchema.shape.metaTranslations.unwrap().optional(),
  reflections: storyContentSchema.shape.reflections.unwrap().optional(),
  notes: storyContentSchema.shape.notes.unwrap().optional(),
  sources: storyContentSchema.shape.sources.unwrap().optional(),
  lockVersion: z.number().int().min(0),
  sameStoryAs,
});
const lockBody = z.object({ lockVersion: z.number().int().min(0) });
const reviewBody = lockBody.extend({ approved: z.boolean(), note: z.string().max(STORY_REVIEW_NOTE_MAX).nullish() });
const featureBody = lockBody.extend({ featured: z.boolean() });
// each part optional (left out: unchanged), null to remove it; a list has one entry per question, reflection or note
const translationBody = lockBody.extend({
  body: z.string().max(60_000).nullish(),
  title: z.string().max(1200).nullish(),
  summary: z.string().max(3000).nullish(),
  questions: z.array(questionTranslationSchema.nullable()).max(100).optional(),
  reflections: z.array(z.string().max(4000).nullable()).max(20).optional(),
  notes: z.array(noteTranslationSchema.nullable()).max(20).optional(),
});
const translationReviewBody = lockBody.extend({
  status: z.enum(STORY_TRANSLATION_REVIEW_STATUSES),
  note: z.string().max(STORY_REVIEW_NOTE_MAX).nullish(),
});
const deleteQuery = z.object({ lockVersion: z.coerce.number().int().min(0) });
const categoryBody = z.object({ name: categoryNameSchema, position: z.number().int().min(0).max(10_000).nullish() });
const createCategoryBody = categoryBody.extend({ slug: categorySlugSchema });
const deleteCategoryQuery = z.object({ force: z.preprocess(absentIfEmpty, z.enum(['1', 'true']).optional()) });

function context(req: FastifyRequest): { adminId: string; requestId: string } {
  return { adminId: req.user!.id, requestId: req.id };
}

/** `sameStoryAs` as the service takes it: absent means "leave the group alone", null means "leave the group". */
function linking(b: { sameStoryAs?: string | null | undefined }): { sameStoryAs?: string | null } {
  return b.sameStoryAs === undefined ? {} : { sameStoryAs: b.sameStoryAs };
}

export function registerStoryAdminRoutes(app: FastifyInstance, stories: StoryAdminService): void {
  const preHandler = [requireAuth, requireRoles(...STORY_EDITOR_ROLES)];

  app.get('/admin/stories', { schema: { querystring: listQuery }, preHandler }, async (req) => {
    const q = req.query as z.infer<typeof listQuery>;
    return stories.list({
      q: q.q,
      status: q.status,
      dialect: q.dialect,
      level: q.level,
      category: q.category,
      review: q.review,
      featured: q.featured === undefined ? undefined : q.featured === '1' || q.featured === 'true',
      limit: q.limit,
      offset: q.offset,
    });
  });

  app.get('/admin/stories/:id', { schema: { params: idParam }, preHandler }, async (req) => {
    const story = await stories.get((req.params as z.infer<typeof idParam>).id);
    if (!story) throw new AppError('NOT_FOUND', 404, 'no such story');
    return story;
  });

  app.post('/admin/stories', { schema: { body: createBody }, preHandler }, async (req, reply) => {
    const b = req.body as z.infer<typeof createBody>;
    const story = await stories.create({ ...storyInputFrom(b), slug: b.slug ?? null }, context(req), linking(b));
    return reply.code(201).send(story);
  });

  app.put('/admin/stories/:id', { schema: { params: idParam, body: updateBody }, preHandler }, async (req) => {
    const b = req.body as z.infer<typeof updateBody>;
    const { id } = req.params as z.infer<typeof idParam>;
    return stories.update(id, { ...storyInputFrom(b), slug: b.slug }, b.lockVersion, context(req), linking(b));
  });

  for (const action of ['submit', 'publish', 'unpublish', 'archive'] as const) {
    app.post(`/admin/stories/:id/${action}`, { schema: { params: idParam, body: lockBody }, preHandler }, async (req) => {
      const { id } = req.params as z.infer<typeof idParam>;
      const { lockVersion } = req.body as z.infer<typeof lockBody>;
      return stories.transition(id, action, { ...context(req), lockVersion });
    });
  }

  app.post('/admin/stories/:id/review', { schema: { params: idParam, body: reviewBody }, preHandler }, async (req) => {
    const { id } = req.params as z.infer<typeof idParam>;
    const b = req.body as z.infer<typeof reviewBody>;
    return stories.review(id, { approved: b.approved, note: b.note ?? null }, { ...context(req), lockVersion: b.lockVersion });
  });

  app.post('/admin/stories/:id/feature', { schema: { params: idParam, body: featureBody }, preHandler }, async (req) => {
    const { id } = req.params as z.infer<typeof idParam>;
    const b = req.body as z.infer<typeof featureBody>;
    return stories.feature(id, b.featured, { ...context(req), lockVersion: b.lockVersion });
  });

  app.put('/admin/stories/:id/translations/:locale', { schema: { params: localeParams, body: translationBody }, preHandler }, async (req) => {
    const { id, locale } = req.params as z.infer<typeof localeParams>;
    const { lockVersion, questions, ...rest } = req.body as z.infer<typeof translationBody>;
    return stories.saveTranslation(
      id,
      locale as AppLocale,
      {
        ...rest,
        ...(questions
          ? { questions: questions.map((q) => (q ? { prompt: q.prompt, options: q.options, ...(q.explanation ? { explanation: q.explanation } : {}) } : null)) }
          : {}),
      },
      { ...context(req), lockVersion },
    );
  });

  app.post('/admin/stories/:id/translations/:locale/review', { schema: { params: localeParams, body: translationReviewBody }, preHandler }, async (req) => {
    const { id, locale } = req.params as z.infer<typeof localeParams>;
    const b = req.body as z.infer<typeof translationReviewBody>;
    return stories.reviewTranslation(id, locale as AppLocale, { status: b.status, note: b.note ?? null }, { ...context(req), lockVersion: b.lockVersion });
  });

  app.delete('/admin/stories/:id', { schema: { params: idParam, querystring: deleteQuery }, preHandler }, async (req) => {
    const { id } = req.params as z.infer<typeof idParam>;
    const { lockVersion } = req.query as z.infer<typeof deleteQuery>;
    await stories.delete(id, { ...context(req), lockVersion });
    return { id, deleted: true };
  });

  app.get('/admin/story-categories', { preHandler }, async () => ({ categories: await stories.listCategories() }));

  app.post('/admin/story-categories', { schema: { body: createCategoryBody }, preHandler }, async (req, reply) => {
    const b = req.body as z.infer<typeof createCategoryBody>;
    const category = await stories.createCategory(b.slug, { name: b.name, position: b.position ?? null }, context(req));
    return reply.code(201).send(category);
  });

  app.put('/admin/story-categories/:slug', { schema: { params: slugParam, body: categoryBody }, preHandler }, async (req) => {
    const { slug } = req.params as z.infer<typeof slugParam>;
    const b = req.body as z.infer<typeof categoryBody>;
    return stories.updateCategory(slug, { name: b.name, position: b.position ?? null }, context(req));
  });

  app.delete('/admin/story-categories/:slug', { schema: { params: slugParam, querystring: deleteCategoryQuery }, preHandler }, async (req) => {
    const { slug } = req.params as z.infer<typeof slugParam>;
    const { force } = req.query as z.infer<typeof deleteCategoryQuery>;
    return stories.deleteCategory(slug, force !== undefined, context(req));
  });
}
