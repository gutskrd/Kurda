import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { SocialService } from './service.js';
import { toPublicProfileDto } from './profile-dto.js';

/** User search + public profiles + privacy (KUR-082). */
export function registerSocialRoutes(app: FastifyInstance, social: SocialService): void {
  /** Username prefix search (rate-limited against scraping). */
  app.get(
    '/users/search',
    {
      schema: { querystring: z.object({ q: z.string().min(1).max(30) }) },
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => ({ results: await social.search(req.user!.id, (req.query as { q: string }).q) }),
  );

  /** Set who can see your profile. */
  app.put(
    '/me/privacy',
    {
      schema: { body: z.object({ visibility: z.enum(['everyone', 'friends', 'nobody']) }) },
      preHandler: requireAuth,
    },
    async (req) => {
      const { visibility } = req.body as { visibility: 'everyone' | 'friends' | 'nobody' };
      await social.setVisibility(req.user!.id, visibility);
      return { visibility };
    },
  );

  /** A user's public profile (privacy- and block-gated). */
  app.get(
    '/users/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireAuth },
    async (req) => {
      const profile = await social.profile(req.user!.id, (req.params as { id: string }).id);
      // Resolve cosmetics → URLs, derive level, expose only safe favorites, and
      // strip every raw key/entitlement/premium field. The browser loads media
      // directly from R2/static — the API never proxies images.
      return toPublicProfileDto(profile, app.storage);
    },
  );
}
