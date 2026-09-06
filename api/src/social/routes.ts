import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { SocialService } from './service.js';
import { toPublicProfileDto } from './profile-dto.js';
import { AppError } from '../plugins/errors.js';
import { isProfileSection, ProfileActivityService } from './profile-activity.js';

/** User search + public profiles + privacy (KUR-082). */
export function registerSocialRoutes(app: FastifyInstance, social: SocialService): void {
  const activity = new ProfileActivityService(app.db);

  /** Username prefix search (rate-limited against scraping). */
  app.get(
    '/users/search',
    {
      schema: { querystring: z.object({ q: z.string().min(1).max(30) }) },
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => ({
      results: await social.search(req.user!.id, (req.query as { q: string }).q, (k) => (app.storage ? app.storage.publicUrl(k) : null)),
    }),
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

  /**
   * What a person has posted and played, for their profile.
   *
   * Gated twice, and both matter: the same privacy check the profile itself
   * uses (a private profile has no public activity either), and the owner's own
   * choice of which sections to show. Asking for a hidden section returns an
   * empty list rather than an error — the client should not be able to tell a
   * hidden section from an empty one.
   */
  app.get(
    '/users/:id/activity',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        querystring: z.object({
          kind: z.string().max(20),
          limit: z.coerce.number().int().min(1).max(50).optional(),
          offset: z.coerce.number().int().min(0).max(10_000).optional(),
        }),
      },
      preHandler: requireAuth,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { kind, limit = 12, offset = 0 } = req.query as { kind: string; limit?: number; offset?: number };
      if (!isProfileSection(kind)) throw new AppError('BAD_SECTION', 400, 'unknown profile section');

      // the profile call enforces privacy and blocks; reuse it rather than
      // reimplementing the rules where they could drift apart
      const profile = await social.profile(req.user!.id, id);
      if (profile.private) return { entries: [] };

      // hiding a section hides it from other people, not from the person who
      // wrote it — their own profile still shows it, marked as hidden
      const visible = await activity.sections(id);
      if (!visible[kind] && req.user!.id !== id) return { entries: [] };

      if (kind === 'stories') return { entries: await activity.posts(id, 'story', limit, offset) };
      if (kind === 'poems') return { entries: await activity.posts(id, 'poem', limit, offset) };
      if (kind === 'games') return { entries: await activity.games(id, limit, offset) };

      const rows = await activity.images(id, limit, offset);
      return {
        entries: rows.map(({ mediaId, ...e }) => ({
          ...e,
          imageUrl: mediaId && app.storage ? app.storage.publicUrl(mediaId) : null,
        })),
      };
    },
  );

  /** Choose which sections your own profile shows. */
  app.patch(
    '/me/profile/sections',
    {
      schema: {
        body: z.object({
          stories: z.boolean().optional(),
          poems: z.boolean().optional(),
          images: z.boolean().optional(),
          games: z.boolean().optional(),
        }),
      },
      preHandler: requireAuth,
    },
    async (req) => ({
      sections: await activity.setSections(req.user!.id, req.body as Record<string, boolean>),
    }),
  );

  /** A user's public profile (privacy- and block-gated). */
  app.get(
    '/users/:id',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireAuth },
    async (req) => {
      const id = (req.params as { id: string }).id;
      const profile = await social.profile(req.user!.id, id);
      // Resolve cosmetics → URLs, derive level, expose only safe favorites, and
      // strip every raw key/entitlement/premium field. The browser loads media
      // directly from R2/static — the API never proxies images.
      const dto = toPublicProfileDto(profile, app.storage);
      // which sections this profile shows, so the client renders the right tabs
      // instead of asking for each one to find out
      return { ...dto, sections: profile.private ? null : await activity.sections(id) };
    },
  );
}
