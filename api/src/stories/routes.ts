/**
 * Reading stories: open to everyone, signed in or not (playing a quiz needs an account; reading does not).
 *
 *   GET /stories/library?dialect          the library's front page: featured, the legends, recent, categories, and the caller's
 *                                         own rows; with a dialect, that variety's page alone (kurmanci or sorani), its legends on
 *                                         their shelf and not among the newest; without one, all of it, as older apps know it
 *   GET /stories?q&category&level&dialect&length&language&audio&sort&limit&offset
 *                                         published stories, filtered and paged (length: short, medium, long or saga)
 *   GET /stories/categories               every category
 *   GET /stories/:idOrSlug                one published story to read, with its recordings and translations, its
 *                                         sections, title and summary per language, reflections, notes and sources
 *   PUT /stories/:id/bookmark · DELETE    the caller's shelf (signed in; guests too, as for saved words)
 *   PUT /stories/:id/progress             where the caller is in the story (signed in)
 *   GET /me/stories                       the caller's shelves: continue, bookmarks, finished (signed in)
 *
 * None of these carries a story's questions. An unpublished story (draft, in review, pulled or unapproved) is 404, like
 * one that never existed.
 *
 * Public reads take an optional bearer: when sent, these routes add the caller's own record (`me`). Lists and the
 * library are cached on the server (StoriesService) but not at the edge, since an unpublished story must leave the app
 * at once.
 *
 * Progress writes are capped at sixty a minute per account; clients write every ten seconds and on leaving, so only a
 * looping client hits it.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { STORY_DIALECTS, STORY_LANGUAGES, STORY_LENGTHS, STORY_LEVELS, type StoryLevel } from '@kurda/shared';
import { pageQuery } from '../http/query.js';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { categorySlugSchema } from './schema.js';
import type { StoriesService } from './service.js';

const absentIfEmpty = (v: unknown): unknown => (v === '' ? undefined : v);

const listQuery = z.object({
  q: z.preprocess(absentIfEmpty, z.string().max(80).optional()),
  category: z.preprocess(absentIfEmpty, categorySlugSchema.optional()),
  dialect: z.preprocess(absentIfEmpty, z.enum(STORY_DIALECTS).optional()),
  length: z.preprocess(absentIfEmpty, z.enum(STORY_LENGTHS).optional()),
  level: z.preprocess(absentIfEmpty, z.coerce.number().int().min(STORY_LEVELS[0]).max(STORY_LEVELS[STORY_LEVELS.length - 1]!).optional()),
  language: z.preprocess(absentIfEmpty, z.enum(STORY_LANGUAGES).optional()),
  /** `audio=1` (or true): only fully narrated stories */
  audio: z.preprocess(absentIfEmpty, z.enum(['1', '0', 'true', 'false']).optional()),
  sort: z.preprocess(absentIfEmpty, z.enum(['newest', 'level', 'title']).optional()),
  ...pageQuery,
});

/** The library shows one variety at a time; an app from before that asks for none and gets the whole library. */
const libraryQuery = z.object({
  dialect: z.preprocess(absentIfEmpty, z.enum(STORY_DIALECTS).optional()),
});

const storyParams = z.object({ idOrSlug: z.string().min(1).max(80) });
const idParam = z.object({ id: lowerUuid() });
const progressBody = z.object({
  paragraph: z.number().int().min(0).max(1000),
  share: z.number().min(0).max(1),
  finished: z.boolean().optional(),
});

export function registerStoryRoutes(app: FastifyInstance, stories: StoriesService): void {
  const viewer = (req: { user?: { id: string } | undefined }): string | null => req.user?.id ?? null;

  app.get('/stories/library', { schema: { querystring: libraryQuery } }, async (req) =>
    stories.library(viewer(req), (req.query as z.infer<typeof libraryQuery>).dialect ?? null),
  );

  app.get('/stories/categories', async () => ({ categories: await stories.categories() }));

  app.get('/stories', { schema: { querystring: listQuery } }, async (req) => {
    const q = req.query as z.infer<typeof listQuery>;
    return stories.list(
      {
        q: q.q,
        category: q.category,
        dialect: q.dialect,
        length: q.length,
        level: q.level as StoryLevel | undefined,
        language: q.language,
        audio: q.audio === '1' || q.audio === 'true',
        sort: q.sort,
        // the service applies the default and caps a larger ask at LIST_MAX_LIMIT rather than refusing it
        limit: q.limit,
        offset: q.offset,
      },
      viewer(req),
    );
  });

  app.get('/me/stories', { preHandler: requireAuth }, async (req) => stories.myStories(req.user!.id));

  app.get('/stories/:idOrSlug', { schema: { params: storyParams } }, async (req) => {
    const story = await stories.detail((req.params as z.infer<typeof storyParams>).idOrSlug, viewer(req));
    if (!story) throw new AppError('NOT_FOUND', 404, 'no such story');
    return story;
  });

  app.put('/stories/:id/bookmark', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req) =>
    stories.bookmark(req.user!.id, (req.params as z.infer<typeof idParam>).id, true),
  );

  app.delete('/stories/:id/bookmark', { schema: { params: idParam }, preHandler: requireAuth }, async (req) =>
    stories.bookmark(req.user!.id, (req.params as z.infer<typeof idParam>).id, false),
  );

  app.put(
    '/stories/:id/progress',
    {
      schema: { params: idParam, body: progressBody },
      config: { rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => ({ me: await stories.saveProgress(req.user!.id, (req.params as z.infer<typeof idParam>).id, req.body as z.infer<typeof progressBody>) }),
  );
}
