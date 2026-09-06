import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { FeedService, isFeedKind, isFeedSection } from './service.js';

/**
 * The community wall.
 *
 * Public, like the three pages it replaces — a guest can read the community
 * without an account. Signing in only adds your own like and bookmark state to
 * each card, which is why the viewer is optional rather than required.
 */
export function registerFeedRoutes(app: FastifyInstance): void {
  const feed = new FeedService(app.db);

  app.get(
    '/feed',
    {
      schema: {
        querystring: z.object({
          section: z.string().max(16).optional(),
          kind: z.string().max(16).optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
          offset: z.coerce.number().int().min(0).max(10_000).optional(),
        }),
      },
    },
    async (req) => {
      const { section = 'all', kind = 'all', limit, offset } = req.query as {
        section?: string;
        kind?: string;
        limit?: number;
        offset?: number;
      };
      if (!isFeedSection(section)) throw new AppError('BAD_SECTION', 400, 'unknown feed section');
      if (!isFeedKind(kind)) throw new AppError('BAD_KIND', 400, 'unknown feed filter');

      const items = await feed.list(req.user?.id ?? null, {
        section,
        kind,
        limit,
        offset,
        publicUrl: (k) => (app.storage ? app.storage.publicUrl(k) : null),
      });
      // a helbest inside Dîmen is a contradiction, not an empty wall
      if (items === null) throw new AppError('BAD_KIND', 400, `${kind} is not part of ${section}`);

      return { items };
    },
  );

  /**
   * Your reading list.
   *
   * Signed-in and always your own — there is no id in the path, because someone
   * else's saved posts are theirs. What they have chosen to show is already on
   * their profile.
   */
  app.get(
    '/me/saved',
    {
      schema: {
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(50).optional(),
          offset: z.coerce.number().int().min(0).max(10_000).optional(),
        }),
      },
      preHandler: requireAuth,
    },
    async (req) => {
      const { limit, offset } = req.query as { limit?: number; offset?: number };
      return {
        items: await feed.saved(req.user!.id, {
          limit,
          offset,
          publicUrl: (k) => (app.storage ? app.storage.publicUrl(k) : null),
        }),
      };
    },
  );
}
