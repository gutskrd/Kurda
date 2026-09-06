import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../plugins/errors.js';
import { FeedService, isFeedKind } from './service.js';

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
          kind: z.string().max(16).optional(),
          limit: z.coerce.number().int().min(1).max(50).optional(),
          offset: z.coerce.number().int().min(0).max(10_000).optional(),
        }),
      },
    },
    async (req) => {
      const { kind = 'all', limit, offset } = req.query as { kind?: string; limit?: number; offset?: number };
      if (!isFeedKind(kind)) throw new AppError('BAD_KIND', 400, 'unknown feed filter');

      return {
        items: await feed.list(req.user?.id ?? null, {
          kind,
          limit,
          offset,
          publicUrl: (k) => (app.storage ? app.storage.publicUrl(k) : null),
        }),
      };
    },
  );
}
