/**
 * Reading stories — open to everyone, signed in or not (playing a quiz on one
 * needs an account; reading does not).
 *
 *   GET /stories?dialect=&length=&level=   published stories, easiest and shortest first
 *   GET /stories/:idOrSlug                 one published story to read, with its recordings
 *
 * Neither ever carries a story's questions. A story that is not published —
 * a draft, one in review, one a reviewer pulled — is 404 here, the same as
 * one that never existed.
 *
 * The list is cached on the server (StoriesService) but not at the edge: an
 * unpublished story must leave the app at once, and an edge copy could not
 * be told so.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { STORY_DIALECTS, STORY_LENGTHS, type StoryLevel } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { StoriesService } from './service.js';

const listQuery = z.object({
  dialect: z.enum(STORY_DIALECTS).optional(),
  length: z.enum(STORY_LENGTHS).optional(),
  level: z.coerce.number().int().min(1).max(3).optional(),
});

const storyParams = z.object({ idOrSlug: z.string().min(1).max(80) });

export function registerStoryRoutes(app: FastifyInstance, stories: StoriesService): void {
  app.get('/stories', { schema: { querystring: listQuery } }, async (req) => {
    const q = req.query as z.infer<typeof listQuery>;
    return { stories: await stories.list({ dialect: q.dialect, length: q.length, level: q.level as StoryLevel | undefined }) };
  });

  app.get('/stories/:idOrSlug', { schema: { params: storyParams } }, async (req) => {
    const story = await stories.detail((req.params as z.infer<typeof storyParams>).idOrSlug);
    if (!story) throw new AppError('NOT_FOUND', 404, 'no such story');
    return story;
  });
}
