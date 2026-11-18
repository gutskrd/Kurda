import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount } from '../plugins/auth.js';
import { VISIBILITIES, type SocialService, type Visibility } from './service.js';
import { toPublicProfileDto } from './profile-dto.js';
import { AppError } from '../plugins/errors.js';
import {
  PROFILE_SECTIONS,
  isProfileSection,
  ProfileActivityService,
  type ActivityEntry,
} from './profile-activity.js';
import { EngagementService, isEngagementKind, isTargetType } from './engagement-service.js';
import { FriendService, FRIENDS_PAGE_MAX } from '../friends/service.js';
import { FeedService, type FeedItem } from '../feed/service.js';
import {
  MAX_REASON_LEN,
  MIN_REASON_LEN,
  REPORT_CATEGORIES,
  UserReportService,
  type ReportCategory,
} from './report-service.js';
import type { ReportsService } from '../moderation/reports-service.js';
import type { TreeService } from '../trees/service.js';

/** User search, public profiles and privacy. */
export function registerSocialRoutes(
  app: FastifyInstance,
  social: SocialService,
  deps: { reports?: ReportsService; trees?: Pick<TreeService, 'glimpse'> } = {},
): void {
  const activity = new ProfileActivityService(app.db);
  const feed = new FeedService(app.db);
  const engagement = new EngagementService(app.db);
  const friends = new FriendService(app.db);
  const reports = new UserReportService(app.db, deps.reports);
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);

  /** Username prefix search (rate-limited against scraping). */
  app.get(
    '/users/search',
    {
      schema: { querystring: z.object({ q: z.string().min(1).max(30) }) },
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAccount,
    },
    async (req) => ({
      results: await social.search(req.user!.id, (req.query as { q: string }).q, (k) => (app.storage ? app.storage.publicUrl(k) : null)),
    }),
  );

  /** Set who can see your profile ('everyone' is refused under 18). */
  app.put(
    '/me/privacy',
    {
      schema: { body: z.object({ visibility: z.enum(VISIBILITIES) }) },
      preHandler: requireAccount,
    },
    async (req) => {
      const { visibility } = req.body as { visibility: Visibility };
      await social.setVisibility(req.user!.id, visibility);
      return { visibility };
    },
  );

  /**
   * Who this person is friends with. The profile's privacy rules are reused (blocks and visibility), so a profile
   * whose detail you may not see has no friend list either, and the list never names a minor to a non-friend
   * (FriendService.list).
   */
  app.get(
    '/users/:id/friends',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        querystring: z.object({
          limit: z.coerce.number().int().min(1).max(FRIENDS_PAGE_MAX).optional(),
          offset: z.coerce.number().int().min(0).max(FRIENDS_PAGE_MAX).optional(),
        }),
      },
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { limit, offset } = req.query as { limit?: number; offset?: number };
      if ((await social.access(req.user?.id ?? null, id)).private) return { friends: [], total: 0 };
      return friends.list(id, publicUrl, limit, offset, req.user?.id ?? null);
    },
  );

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
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { kind, limit = 12, offset = 0 } = req.query as { kind: string; limit?: number; offset?: number };
      if (!isProfileSection(kind)) throw new AppError('BAD_SECTION', 400, 'unknown profile section');

      /*
       * What a person has posted and played, gated by the profile's privacy and the owner's chosen sections; a hidden
       * section answers an empty list, indistinguishable from an empty one. Games come back as history rows, posts as whole
       * feed cards, so both keys are always present and the unused one is empty.
       */
      const nothing = { entries: [] as ActivityEntry[], items: [] as FeedItem[] };

      // The profile's own rules for privacy and blocks, shared so they cannot drift.
      const viewerId = req.user?.id ?? null;
      const access = await social.access(viewerId, id);
      if (access.private) return nothing;

      // Hiding a section hides it from others, not from the owner, whose profile marks it hidden.
      if (!access.sections[kind] && viewerId !== id) return nothing;

      if (kind === 'games') return { ...nothing, entries: await activity.games(id, limit, offset) };

      // Engagement resolves for whoever is looking, so a stranger's tab never arrives pre-liked.
      const shared = { limit, offset, publicUrl, viewerId };

      // The three engagement tabs are one call; 'saved' is the stored 'bookmark', not worth a migration to rename.
      const ENGAGEMENT_TAB = { likes: 'like', saved: 'bookmark', reposts: 'repost' } as const;
      const engagementKind = ENGAGEMENT_TAB[kind as keyof typeof ENGAGEMENT_TAB];
      if (engagementKind) {
        return { ...nothing, items: await feed.engagedBy(id, engagementKind, shared) };
      }
      return { ...nothing, items: await feed.byAuthor(id, shared) };
    },
  );

  /**
   * Reports a person to the moderators. It answers the same whether the report is new, a duplicate, or about an
   * account that does not exist, so it reveals neither which ids are real nor past reports; only a too-short reason, the
   * reporter's own input, is refused. Rate limited per hour, since filing reports in bulk is itself a way to attack
   * someone.
   */
  app.post(
    '/users/:id/report',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z.object({
          category: z.enum(REPORT_CATEGORIES),
          reason: z.string().min(MIN_REASON_LEN).max(MAX_REASON_LEN),
        }),
      },
      config: { rateLimit: { max: 5, windowMs: 60 * 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAccount,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { category, reason } = req.body as { category: ReportCategory; reason: string };
      const res = await reports.report(req.user!.id, id, category, reason);

      if (!res.ok && res.reason === 'reason-too-short') {
        throw new AppError('REASON_TOO_SHORT', 400, `say a little more — at least ${MIN_REASON_LEN} characters`);
      }
      if (!res.ok && res.reason === 'self') {
        throw new AppError('SELF_REPORT', 400, 'you cannot report yourself');
      }
      // 'not-found' and a duplicate both land here on purpose
      return { ok: true };
    },
  );

  /** Choose which sections your own profile shows. */
  app.patch(
    '/me/profile/sections',
    {
      schema: {
        /* Built from PROFILE_SECTIONS, so a new section's toggle is never accepted and silently dropped. */
        body: z.object(
          Object.fromEntries(PROFILE_SECTIONS.map((s) => [s, z.boolean().optional()])) as Record<
            (typeof PROFILE_SECTIONS)[number],
            z.ZodOptional<z.ZodBoolean>
          >,
        ),
      },
      preHandler: requireAccount,
    },
    async (req) => ({
      sections: await activity.setSections(req.user!.id, req.body as Record<string, boolean>),
    }),
  );



  /** Likes or saves a post with one toggle; the database decides from what is stored, so a double click cannot desync the heart and count. */
  app.post(
    '/posts/:type/:id/:kind',
    {
      schema: {
        params: z.object({ type: z.string().max(16), id: z.uuid(), kind: z.string().max(16) }),
      },
      config: { rateLimit: { max: 120, windowMs: 60_000, per: 'user-or-ip' as const }, skipValidation: true },
      preHandler: requireAccount,
    },
    async (req) => {
      const { type, id, kind } = req.params as { type: string; id: string; kind: string };
      if (!isTargetType(type)) throw new AppError('BAD_TARGET', 400, 'unknown post type');
      if (!isEngagementKind(kind)) throw new AppError('BAD_KIND', 400, 'unknown engagement');

      const { on } = await engagement.toggle(req.user!.id, type, id, kind);
      const counts = await engagement.forPosts(req.user!.id, type, [id]);
      return { on, engagement: counts.get(id) };
    },
  );

  /**
   * How one post has been received (likes, reposts, saves) and whether you are among them, as its page and the wall
   * show. Readable signed out; only counts and your own part, never who else.
   */
  app.get(
    '/posts/:type/:id/engagement',
    {
      schema: { params: z.object({ type: z.string().max(16), id: z.uuid() }) },
      config: { rateLimit: { max: 240, windowMs: 60_000, per: 'user-or-ip' as const }, skipValidation: true },
    },
    async (req) => {
      const { type, id } = req.params as { type: string; id: string };
      if (!isTargetType(type)) throw new AppError('BAD_TARGET', 400, 'unknown post type');
      const counts = await engagement.forPosts(req.user?.id ?? null, type, [id]);
      return { engagement: counts.get(id) };
    },
  );

  /**
   * A user's public profile, gated by privacy and blocks. Readable signed out, since wall bylines must lead somewhere;
   * a signed-out reader is nobody's friend and sees what any stranger sees.
   */
  app.get(
    '/users/:id',
    { schema: { params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const id = (req.params as { id: string }).id;
      const profile = await social.profile(req.user?.id ?? null, id);
      // Resolve cosmetics to URLs, derive the level, expose only safe favourites and strip every raw key and entitlement
      // field. Clients load media directly; the API never proxies images.
      const dto = toPublicProfileDto(profile, app.storage);
      // The sections this profile shows, so the client renders the right tabs, and today's tree, which a private profile
      // keeps to itself.
      const [sections, tree] = profile.private ? [null, null] : await Promise.all([activity.sections(id), deps.trees?.glimpse(id) ?? null]);
      return { ...dto, sections, tree };
    },
  );
}
