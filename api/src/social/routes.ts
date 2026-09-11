import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
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
import { FriendService } from '../friends/service.js';
import { FeedService, type FeedItem } from '../feed/service.js';
import {
  MAX_REASON_LEN,
  MIN_REASON_LEN,
  REPORT_CATEGORIES,
  UserReportService,
  type ReportCategory,
} from './report-service.js';

/** User search + public profiles + privacy (KUR-082). */
export function registerSocialRoutes(app: FastifyInstance, social: SocialService): void {
  const activity = new ProfileActivityService(app.db);
  const feed = new FeedService(app.db);
  const engagement = new EngagementService(app.db);
  const friends = new FriendService(app.db);
  const reports = new UserReportService(app.db);
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);

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
      schema: { body: z.object({ visibility: z.enum(VISIBILITIES) }) },
      preHandler: requireAuth,
    },
    async (req) => {
      const { visibility } = req.body as { visibility: Visibility };
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
  /**
   * Who this person is friends with.
   *
   * A profile that shows a level, a country and what someone is wearing but
   * not who they know is a profile of an account rather than of a person — and
   * on a community app, who someone knows is most of what makes them findable.
   *
   * The privacy rules are the profile's own: the profile call already resolves
   * blocks and the everyone/members/friends setting, so it is reused rather
   * than reimplemented where the two could drift apart. A profile you may not
   * see the detail of has no friend list either.
   */
  app.get(
    '/users/:id/friends',
    { schema: { params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const { id } = req.params as { id: string };
      const profile = await social.profile(req.user?.id ?? null, id);
      if (profile.private) return { friends: [] };
      return { friends: await friends.list(id, publicUrl) };
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
       * A game result is a line in a history; a post is a post.
       *
       * Only games stay a row. The other three come back as whole cards — the
       * same ones the wall shows — because a profile that reduced a picture to a
       * 40px square and a poem to an icon was showing a list *about* posts
       * rather than the posts themselves.
       *
       * That means two response shapes from one route, so both keys are always
       * present and the unused one is empty. The refusals below then do not have
       * to know which kind was asked for.
       */
      const nothing = { entries: [] as ActivityEntry[], items: [] as FeedItem[] };

      // the profile call enforces privacy and blocks; reuse it rather than
      // reimplementing the rules where they could drift apart
      const viewerId = req.user?.id ?? null;
      const profile = await social.profile(viewerId, id);
      if (profile.private) return nothing;

      // hiding a section hides it from other people, not from the person who
      // wrote it — their own profile still shows it, marked as hidden
      const visible = await activity.sections(id);
      if (!visible[kind] && viewerId !== id) return nothing;

      if (kind === 'games') return { ...nothing, entries: await activity.games(id, limit, offset) };

      // engagement resolves for whoever is LOOKING, not whose profile this is:
      // the heart on a card in someone else's likes tab is about you, so a
      // stranger's tab never arrives pre-liked
      const shared = { limit, offset, publicUrl, viewerId };

      if (kind === 'likes' || kind === 'saved') {
        // 'saved' is the word the app uses; the engagement table still calls the
        // row a bookmark, and renaming a stored value is not worth a migration
        const engagementKind = kind === 'likes' ? 'like' : 'bookmark';
        return { ...nothing, items: await feed.engagedBy(id, engagementKind, shared) };
      }
      return { ...nothing, items: await feed.byAuthor(id, shared) };
    },
  );

  /**
   * Report a person to the moderators.
   *
   * Blocking already ends it privately, but a block tells nobody — so somebody
   * doing the same thing to twenty people looked exactly like somebody nobody
   * had blocked. This is the half that reaches a moderator, and the profile
   * card offers both, because most people want to stop seeing someone *and*
   * have somebody look at them.
   *
   * Deliberately says almost nothing back. It answers the same way whether the
   * report is new, a duplicate of one you already filed, or about an account
   * that does not exist — the alternative is an endpoint that reveals which
   * user ids are real and whether an account has been reported before, and a
   * reporter needs neither.
   *
   * The one exception is your own reason being too short, which is about what
   * *you* typed and has to be fixable.
   *
   * Rate-limited hard, per hour rather than per minute: a report costs a
   * moderator's attention, so filing them in bulk is itself a way to attack
   * somebody.
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
      preHandler: requireAuth,
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
        /*
         * Built from PROFILE_SECTIONS rather than listed again. The two had
         * already drifted once: this schema still named the old sections, so a
         * toggle for a new one was accepted with a 200 and silently dropped.
         */
        body: z.object(
          Object.fromEntries(PROFILE_SECTIONS.map((s) => [s, z.boolean().optional()])) as Record<
            (typeof PROFILE_SECTIONS)[number],
            z.ZodOptional<z.ZodBoolean>
          >,
        ),
      },
      preHandler: requireAuth,
    },
    async (req) => ({
      sections: await activity.setSections(req.user!.id, req.body as Record<string, boolean>),
    }),
  );



  /**
   * Like or save a post — one button, one endpoint, and the server decides.
   *
   * A toggle rather than add/remove: the client's idea of the current state can
   * be stale (a second tab, a poll between renders), and letting the database
   * answer from what is actually stored means a double click cannot leave the
   * heart disagreeing with the count.
   */
  app.post(
    '/posts/:type/:id/:kind',
    {
      schema: {
        params: z.object({ type: z.string().max(16), id: z.uuid(), kind: z.string().max(16) }),
      },
      config: { rateLimit: { max: 120, windowMs: 60_000, per: 'user-or-ip' as const }, skipValidation: true },
      preHandler: requireAuth,
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
   * A user's public profile (privacy- and block-gated).
   *
   * Readable without an account: the bylines on the public wall have to lead
   * somewhere. A signed-out reader is simply nobody's friend, so a profile set
   * to friends-only or nobody shows them what it shows any other stranger.
   */
  app.get(
    '/users/:id',
    { schema: { params: z.object({ id: z.uuid() }) } },
    async (req) => {
      const id = (req.params as { id: string }).id;
      const profile = await social.profile(req.user?.id ?? null, id);
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
