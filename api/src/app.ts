import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import { registerAuthRoutes } from './auth/routes.js';
import { setShuffleKey } from './content/exercises.js';
import { Cache } from './cache/cache.js';
import { JobQueue } from './jobs/queue.js';
import { createStorage, preparePrivateStorage, type MediaStorage } from './media/storage.js';
import { registerImageUploadParser } from './media/uploadParser.js';
import { mediaLimits } from './media/mediaLimits.js';
import { createRedis, redisHealthCheck } from './cache/redis.js';
import { trustProxyOption, type AppConfig } from './config/env.js';
import { createPool, dbHealthCheck } from './db/pool.js';
import { HealthRegistry, notConfigured } from './health/registry.js';
import { setupMetrics } from './observability/metrics.js';
import { setupAuth } from './plugins/auth.js';
import { installActivationGate } from './plugins/activation.js';
import { setupErrorHandling } from './plugins/errors.js';
import { setupSecurityHeaders } from './plugins/security-headers.js';
import { setupClientIp } from './plugins/client-ip.js';
import { setupNetworkSightings } from './net/sightings.js';
import { setupCachePolicy } from './plugins/cache-policy.js';
import { setupValidation } from './plugins/validation.js';
import { setupRateLimit } from './ratelimit/plugin.js';
import { MemoryRateLimitStore, RedisRateLimitStore } from './ratelimit/store.js';
import { registerAchievementRoutes } from './achievements/routes.js';
import { AchievementsService } from './achievements/service.js';
import fastifyWebsocket from '@fastify/websocket';
import { TournamentService } from './tournament/service.js';
import { registerTournamentRoutes } from './tournament/routes.js';
import { ShopService } from './shop/service.js';
import { registerShopRoutes } from './shop/routes.js';
import { registerShopAdminRoutes } from './shop/admin-routes.js';
import { ArtOverrideService } from './art/overrides.js';
import { registerArtRoutes } from './art/routes.js';
import { ItemReturns } from './shop/returns.js';
import { GiftService } from './gifts/service.js';
import { registerGiftRoutes } from './gifts/routes.js';
import { CosmeticsService } from './cosmetics/service.js';
import { registerCosmeticsRoutes } from './cosmetics/routes.js';
import { IapService } from './iap/service.js';
import { registerIapRoutes } from './iap/routes.js';
import { createReceiptVerifier } from './iap/verifier.js';
import { FraudService } from './fraud/service.js';
import { registerFraudRoutes } from './fraud/routes.js';
import { EconomyService } from './economy/service.js';
import { registerEconomyRoutes } from './economy/routes.js';
import { WalletService } from './wallet/service.js';
import { createQueueConnection } from './jobs/queue.js';
import { LocalRoomBus, RedisRoomBus } from './realtime/bus.js';
import { MAX_CLIENT_MESSAGE_BYTES, RealtimeGateway, type GatewayOptions } from './realtime/gateway.js';
import { MemoryKV, RedisKV } from './realtime/kv.js';
import { setupCors } from './plugins/cors.js';
import { registerUserRoutes } from './users/routes.js';
import { registerLessonRoutes } from './content/routes.js';
import { registerWalletRoutes } from './wallet/routes.js';
import { registerDailyGoalRoutes } from './goals/routes.js';
import { DailyRewardService } from './rewards/service.js';
import { registerDailyRewardRoutes } from './rewards/routes.js';
import { GemService } from './gems/service.js';
import { registerGemRoutes } from './gems/routes.js';
import { createProgression } from './badges/progression.js';
import { registerBadgeRoutes } from './badges/routes.js';
import { badgeNotices, scheduleBadgeJobs } from './jobs/badge-jobs.js';
import { registerLeagueRoutes } from './leagues/routes.js';
import { scheduleLeagueJobs } from './jobs/league-jobs.js';
import { progressNotices } from './notifications/progress-notices.js';
import { LeaderboardService } from './leaderboards/service.js';
import { registerLeaderboardRoutes } from './leaderboards/routes.js';
import { RankService } from './ranks/service.js';
import { RankSeasons } from './ranks/seasons.js';
import { RankAdmin } from './ranks/admin.js';
import { registerRankRoutes } from './ranks/routes.js';
import { FriendService } from './friends/service.js';
import { registerFriendRoutes } from './friends/routes.js';
import { SocialService } from './social/service.js';
import { registerSocialRoutes } from './social/routes.js';
import { registerSocialRailRoutes } from './social/rail-routes.js';
import { registerFeedRoutes } from './feed/routes.js';
import { ActivityService } from './activity/service.js';
import { registerActivityRoutes } from './activity/routes.js';
import { ChatService } from './chat/service.js';
import { registerChatRoutes } from './chat/routes.js';
import { GroupService } from './groups/service.js';
import { registerGroupRoutes } from './groups/routes.js';
import { GroupChatService } from './groups/chat-service.js';
import { registerGroupChatRoutes } from './groups/chat-routes.js';
import { ModerationService } from './moderation/service.js';
import { registerModerationRoutes } from './moderation/routes.js';
import { registerReviewRoutes } from './review/routes.js';
import { registerPracticeRoutes } from './practice/routes.js';
import { registerWordleRoutes } from './game/wordle-routes.js';
import { registerWordleBattleRoutes } from './game/wordle-battle-routes.js';
import { registerRhymeRoutes } from './game/rhyme-routes.js';
import { registerRaceRoutes } from './game/race-routes.js';
import { registerRhymeMatchRoutes } from './game/rhyme-match-routes.js';
import { registerStoryGameRoutes } from './story-games/routes.js';
import { PlayEvents } from './play/events.js';
import { registerPlayRoutes } from './play/routes.js';
import { TrustService } from './trust/service.js';
import { AiModerationService } from './moderation/ai-service.js';
import { ImageModerationService } from './moderation/image-moderation-service.js';
import { registerAiModerationRoutes, registerImageModerationRoutes } from './moderation/ai-routes.js';
import { registerModeration, type ModerationOptions } from './moderation/wire.js';
import { registerCopyright, type CopyrightWireOptions } from './copyright/wire.js';
import { setModerationKey } from './moderation/pseudonym.js';
import { BotDetectionService } from './antibot/service.js';
import { registerAntibotRoutes } from './antibot/routes.js';
import { registerLibraryRoutes } from './library/routes.js';
import { registerLibraryCommentRoutes } from './library/comment-routes.js';
import { registerLibraryReportRoutes } from './library/report-routes.js';
import { registerImagePostRoutes } from './images/routes.js';
import { registerImageInteractionRoutes } from './images/interaction-routes.js';
import { registerImageReportRoutes } from './images/report-routes.js';
import { registerTagRoutes } from './tags/routes.js';
import { ConfigService } from './admin/config-service.js';
import { registerConfigRoutes } from './admin/config-routes.js';
import { registerPhoneVerificationRoutes } from './auth/phone-routes.js';
import { PhoneVerificationService } from './auth/phone-verification-service.js';
import { StubSmsSender } from './auth/sms.js';
import { registerMediaRoutes } from './media/routes.js';
import { registerVoiceRoutes } from './media/voice-routes.js';
import { registerPlacementRoutes } from './placement/routes.js';
import { registerCourseMapRoutes } from './coursemap/routes.js';
import { registerDictionaryRoutes } from './dictionary/routes.js';
import { AdminTotpService } from './admin/totp-service.js';
import { registerAdminRoutes } from './admin/routes.js';
import { AdminAccess } from './admin/owner-access.js';
import { installAdminGate } from './admin/admin-gate.js';
import { registerGameContentRoutes } from './admin/game-content-routes.js';
import { registerDictionaryImportRoutes } from './admin/dictionary-import-routes.js';
import { registerAlphabetAudioRoutes } from './alphabet/routes.js';
import { registerLessonAudioRoutes } from './lessonaudio/routes.js';
import { registerRecordingVoiceRoutes } from './speakers/routes.js';
import type { RecordingFileOptions } from './speakers/recording-file.js';
import { StoriesService } from './stories/service.js';
import { StoryAdminService } from './stories/admin-service.js';
import { registerStoryRoutes } from './stories/routes.js';
import { registerStoryAdminRoutes } from './stories/admin-routes.js';
import { seedStarterStories } from './stories/import.js';
import type { FerhengSource } from '@kurda/shared';
import { DeviceTokenService } from './push/tokens-service.js';
import { PushService } from './push/service.js';
import { createPushProvider } from './push/provider.js';
import { registerPushRoutes } from './push/routes.js';
import { EventService } from './events/service.js';
import { registerEventRoutes } from './events/routes.js';
import { QuestService, DbQuestMetrics } from './events/quest-service.js';
import { registerQuestRoutes } from './events/quest-routes.js';
import { NotificationPrefsService } from './notifications/prefs-service.js';
import { registerNotificationRoutes } from './notifications/routes.js';
import { InboxService } from './notifications/inbox-service.js';
import { registerInboxRoutes } from './notifications/inbox-routes.js';
import { StreakReminderService } from './notifications/streak-reminder-service.js';
import { makePushSendJob } from './jobs/push-jobs.js';
import { ContentAdminService } from './content/admin-service.js';
import { seedStarterLessons } from './content/starter-lessons.js';
import { registerContentAdminRoutes } from './content/admin-routes.js';
import { UserAdminService } from './admin/user-admin-service.js';
import { registerUserAdminRoutes } from './admin/user-admin-routes.js';
import { AuditService } from './admin/audit-service.js';
import { registerAuditLog } from './admin/audit-routes.js';
import { installRequestContext } from './security/context.js';
import { setupSecurityLog, type SecurityLogOptions } from './security/wire.js';
import { registerSecurityLogRoutes } from './security/routes.js';
import { SecurityLogReader } from './security/search.js';
import { installScannerShield } from './security/shield.js';
import { MaintenanceService } from './maintenance/service.js';
import { installMaintenanceGate, registerMaintenanceRoutes } from './maintenance/routes.js';
import { Counter } from 'prom-client';
import { AnalyticsService } from './analytics/service.js';
import { registerAnalyticsRoutes } from './analytics/routes.js';
import { FeedbackService } from './feedback/service.js';
import { registerFeedbackRoutes } from './feedback/routes.js';
import { EmailService } from './email/service.js';
import { createEmailProvider } from './email/provider.js';
import pino from 'pino';
import { LOG_REDACT } from './observability/redact.js';
import { createWorker } from './jobs/worker.js';
import {
  ROLLUP_INTERVAL_MS,
  ROLLUP_WINDOW_DAYS,
  makeAnalyticsRollupJob,
  makeEconomyRollupJob,
} from './jobs/rollup-jobs.js';
import { DashboardService as RollupDashboards } from './analytics/dashboard-service.js';
import { EconomyService as RollupEconomy } from './economy/service.js';
import { grantBootstrapAdmins } from './admin/bootstrap-admins.js';
import { scheduleMaintenance } from './jobs/maintenance.js';
import { registerEmailWebhookRoutes } from './email/webhook-routes.js';
import { registerResendWebhookRoutes } from './email/resend-webhook.js';
import { registerEmailAdminRoutes } from './email/admin-routes.js';
import { ResendMailReader, SupportInbox } from './email/support-inbox.js';
import { DashboardService } from './analytics/dashboard-service.js';
import { registerDashboardRoutes } from './analytics/dashboard-routes.js';
import { ExperimentService } from './experiments/service.js';
import { registerExperimentRoutes } from './experiments/routes.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

export interface BuildAppOptions {
  /** Test seam: shrink heartbeat windows etc. */
  gateway?: GatewayOptions;
  /**
   * Test seam: where a dictionary import reads its words from.
   *
   * The real one downloads 65 MB from GitHub over about ninety minutes, which no
   * test should start by accident — and a test that asserts the endpoint returns
   * 202 does start it, because returning before the work finishes is the point.
   */
  ferheng?: FerhengSource;
  /** Test seams for moderation: the moderator count and the urgent-report mailer. */
  moderation?: ModerationOptions;
  /** where the security log's alert emails go (security/wire.ts) */
  security?: SecurityLogOptions;
  /** Test seam for copyright notices: where their emails go. */
  copyright?: CopyrightWireOptions;
  /** Test seam for reading a recording's file from another site: the fetch, the name lookup, the time allowed. */
  recordingFiles?: RecordingFileOptions;
  /**
   * Test seam: the clock offline mode reads. The setting is one row in a
   * database every test file shares, so a test runs it days ahead of everyone
   * else's clock, where only its own app sees it on.
   */
  maintenanceClock?: () => Date;
}

export function buildApp(config: AppConfig, options: BuildAppOptions = {}): FastifyInstance {
  // the lesson shuffle is keyed with a server secret, never with what the client sees
  setShuffleKey(config.JWT_SECRET);
  // and moderation's pseudonyms and banned-address hashes, with the same secret
  setModerationKey(config.JWT_SECRET);
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // pretty logs are a dev nicety; structured JSON everywhere else
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      // PII never reaches log storage (KUR-009); see observability/redact.ts
      redact: LOG_REDACT,
    },
    // trust an upstream-provided request id (gateway/LB) or generate one
    requestIdHeader: 'x-request-id',
    // a whole request, body included, within two minutes: Fastify otherwise
    // turns Node's own limit off, and a client dripping a body a byte at a time
    // would hold its connection for ever. Two minutes covers the largest upload
    // on a slow phone connection.
    requestTimeout: 120_000,
    // who the client is, when there is a proxy in between — see TRUST_PROXY
    trustProxy: trustProxyOption(config.TRUST_PROXY),
  });

  // who the client is, read past the proxies once, before any hook asks
  setupClientIp(app, config);
  // and which request is being served, for the security log, from then on
  installRequestContext(app);

  setupCors(app, config);
  setupValidation(app);
  setupErrorHandling(app, config);
  setupSecurityHeaders(app);
  setupCachePolicy(app);
  const metricsRegistry = setupMetrics(app, config);


  const health = new HealthRegistry();
  if (config.DATABASE_URL) {
    const pool = createPool(config);
    app.decorate('db', pool);
    // reconcile the configured admin allowlist once the server is up (idempotent;
    // only grants to accounts that have confirmed their address)
    app.addHook('onReady', async () => {
      await grantBootstrapAdmins(pool, config.BOOTSTRAP_ADMIN_EMAILS, app.log, app.securityLog).catch((err) => {
        app.log.warn({ err }, 'bootstrap admin reconciliation failed');
      });
    });
    health.register('db', dbHealthCheck(pool));
    app.addHook('onClose', async () => {
      await pool.end();
    });
  } else {
    health.register('db', notConfigured('DATABASE_URL not set'));
  }
  if (config.REDIS_URL) {
    const redis = createRedis(config);
    app.decorate('redis', redis);
    app.decorate('cache', new Cache(redis, app.log));
    health.register('redis', redisHealthCheck(redis));
    const jobs = JobQueue.create(config);
    app.decorate('jobs', jobs);
    // The API only enqueues; something must CONSUME the queue or verification and
    // password-reset mail is never sent. Run the worker in-process by default so a
    // single-service deploy still delivers mail (BullMQ shares work safely if a
    // dedicated worker also runs). Skipped under test so suites don't spawn one.
    if (config.NODE_ENV !== 'test' && config.RUN_WORKER_IN_API !== 'false') {
      // its own pino instance: Fastify's logger type isn't pino's, and a distinct
      // name keeps job logs separable from request logs
      const worker = createWorker(config, pino({ level: config.LOG_LEVEL, name: 'hevalo-api-worker', redact: LOG_REDACT }));
      app.log.info('processing background jobs in-process (set RUN_WORKER_IN_API=false if a dedicated worker runs)');
      // The dashboards read pre-aggregated tables that nothing populated, so they
      // were permanently empty. Schedule the rollups here (the dedicated worker
      // service is off on the free tier), and kick off a one-time catch-up:
      // signups and the economy both aggregate from existing rows, so a backfill
      // fills real history straight away instead of starting from today.
      if (config.DATABASE_URL) {
        const analyticsJob = makeAnalyticsRollupJob(new RollupDashboards(app.db));
        const economyJob = makeEconomyRollupJob(new RollupEconomy(app.db));
        void (async () => {
          try {
            await jobs.scheduleEvery(analyticsJob, ROLLUP_INTERVAL_MS, { days: ROLLUP_WINDOW_DAYS });
            await jobs.scheduleEvery(economyJob, ROLLUP_INTERVAL_MS, { days: ROLLUP_WINDOW_DAYS });
            // and the housekeeping only the undeployed worker used to schedule:
            // deletions past their grace period, unclaimed uploads
            await scheduleMaintenance(jobs, app.db, createStorage(config));
            // Backfill once, not on every boot: this host spins down when idle, so
            // an unconditional 60-day re-aggregate would run constantly for nothing.
            // Each dashboard is checked against ITS OWN table — gating both on the
            // analytics table left the economy permanently empty whenever analytics
            // had already been seeded.
            const backfills: Array<[string, typeof analyticsJob | typeof economyJob]> = [
              ['analytics_daily_metrics', analyticsJob],
              ['economy_daily', economyJob],
            ];
            for (const [table, job] of backfills) {
              // table names here are literals in this array, never user input
              const seeded = await app.db.query(`SELECT 1 FROM ${table} LIMIT 1`);
              if (seeded.rowCount) continue;
              await jobs.enqueue(job, { days: 60 });
              app.log.info({ table, job: job.name }, 'enqueued a one-time dashboard backfill');
            }
          } catch (err) {
            app.log.warn({ err }, 'failed to schedule dashboard rollups');
          }
        })();
      }
      app.addHook('onClose', async () => {
        await worker.close();
      });
    }
    app.addHook('onClose', async () => {
      await jobs.close();
      redis.disconnect();
    });
  } else {
    app.decorate('cache', new Cache(null, app.log));
    health.register('redis', notConfigured('REDIS_URL not set'));
  }
  app.decorate('health', health);
  // before the gate, the limiter and sign-in, which all record into it
  setupSecurityLog(app, config, options.security);

  // hook order matters: authenticate → userId logging → rate limiting
  // (user-keyed limits need req.user set first)
  // shared with the admin routes further down; declared here because the 2FA
  // gate has to be installed before any route is registered
  let adminTotp: AdminTotpService | undefined;
  let adminAccess: AdminAccess | undefined;
  if (config.DATABASE_URL) {
    setupAuth(app, config);
    // An unverified account cannot write anything. Installed here for the same
    // reason as the gate below: a preHandler hook only applies to routes added
    // after it, so this has to come before every route.
    installActivationGate(app);

    // Mandatory 2FA on every staff-only route: one hook rather than a guard on
    // each of forty routes, so a new one is covered the day it is written. It
    // reads the route table to find them, so it must be installed HERE, before
    // any route is registered — a Fastify hook only applies to routes added
    // after it, and placing this further down would silently leave every
    // earlier staff route ungated.
    adminTotp = new AdminTotpService(app.db);
    adminAccess = new AdminAccess(app.db, config);
    // whether the console is for every staff role, or only the addresses listed
    app.log.info({ listedAddressesOnly: adminAccess.listed }, 'admin console access');
    installAdminGate(app, adminTotp, adminAccess);

    // which network each signed-in account is on, for account linking, and the
    // daily prune of that and the risk decisions; also before any route
    setupNetworkSightings(app, { pruneAtStart: config.NODE_ENV !== 'test' });
  }
  app.addHook('onRequest', async (req) => {
    if (req.user?.id) {
      req.log = req.log.child({ userId: req.user.id });
    }
  });

  // scanners' probes (PHP, WordPress, secrets files) answered "not found" at once, and a network that keeps
  // probing shut out while signed out: after the session is read, before anyone's rate limit is spent
  installScannerShield(app, { redis: app.hasDecorator('redis') ? app.redis : undefined });

  // Hevalo taken offline from the admin: every request but the console's and staff's answered with the
  // offline notice, before any route and before anyone's rate limit is spent
  let maintenance: MaintenanceService | undefined;
  if (config.DATABASE_URL) {
    maintenance = new MaintenanceService(app.db, (key) => (app.storage ? app.storage.publicUrl(key) : null), app.securityLog, options.maintenanceClock);
    installMaintenanceGate(app, maintenance);
  }

  // shares the app redis connection; commands fail fast when Redis is
  // down and the limiter then allows requests rather than blocking all
  setupRateLimit(app, app.redis ? new RedisRateLimitStore(app.redis) : new MemoryRateLimitStore(), {
    onLimited: (req, limit) => app.securityLog.record('request.rate_limited', { userId: req.user?.id ?? null, details: limit }),
  });

  const storage = createStorage(config);
  if (storage) {
    app.decorate('storage', storage);
    // a private bucket for evidence and data exports: checked, and the older
    // private files moved into it, once the server is up (media/storage.ts)
    if (storage.hasPrivateBucket && config.NODE_ENV !== 'test') {
      app.addHook('onReady', async () => {
        void preparePrivateStorage(storage, app.log);
      });
    }
  }

  // auth + user endpoints need the database
  if (config.DATABASE_URL) {
    // config-driven Gem grants (KUR-068): shared by achievements, lessons, tournaments
    const gemService = new GemService(app.db, new WalletService(app.db));
    registerGemRoutes(app, gemService);

    // friend system (KUR-081) + activity feed (KUR-087): needed by producers below
    const friends = new FriendService(app.db);
    const activity = new ActivityService(app.db, friends, app.redis);

    // push infrastructure (KUR-094): device token lifecycle + queued delivery,
    // gated by per-category preferences + quiet hours at delivery time (KUR-095);
    // set up here because league and badge news below goes through it
    const deviceTokens = new DeviceTokenService(app.db);
    const notificationPrefs = new NotificationPrefsService(app.db);
    const pushService = new PushService(deviceTokens, createPushProvider(config, app.log), notificationPrefs);
    const inbox = new InboxService(app.db);
    const notices = progressNotices({ inbox, push: pushService, jobs: app.jobs });

    // Game Ranks (contract-4 §R): one OpenSkill rating per online game, Rated
    // or Friendly per game. One service, shared by every game's routes and the
    // play layer, so its events (`app.ranks.events`: a rated game finished, a
    // season closed — what the badges listen to) come from one place.
    const ranks = new RankService(app.db, { log: app.log });
    app.decorate('ranks', ranks);

    // Learning Leagues (KUR-062, contract 4 §L): learning XP joins the week's
    // group; the week is settled on Monday and small groups merged on
    // Wednesday from the job queue (jobs/league-jobs.ts)
    // — and badges (contract 4 §B), counted from what happened, told through
    // the list, a realtime `badge_unlocked` (the gateway is set up further
    // down, so it is looked up when there is something to say) and one push a day.
    // The ranked badges listen to `ranks.events` (badges/rank-hooks.ts)
    const { xp: xpService, leagues, badges } = createProgression(app.db, {
      ranks: ranks.events,
      gems: gemService,
      activity,
      notices,
      badgeNotices: (badgeService) =>
        badgeNotices({
          inbox,
          realtime: (uid, ev) => app.realtime.notifyUser(uid, ev),
          badges: badgeService,
          push: pushService,
          jobs: app.jobs,
        }),
      weeklyGoalXp: config.LEAGUE_WEEKLY_GOAL_XP,
      log: app.log,
    });
    registerLeagueRoutes(app, leagues);
    registerBadgeRoutes(app, badges);
    if (config.NODE_ENV !== 'test') {
      if (app.jobs) {
        void scheduleLeagueJobs(app.jobs, leagues).catch((err) => app.log.warn({ err }, 'failed to schedule the league week'));
        void scheduleBadgeJobs(app.jobs, badges).catch((err) => app.log.warn({ err }, 'failed to schedule badge rarity'));
      } else {
        // no queue (one process, no Redis): the same idempotent runs, checked hourly and at startup
        const runLeagueWeek = () =>
          void leagues
            .settleDue()
            .then(() => leagues.mergeSmallGroups())
            .catch((err) => app.log.warn({ err }, 'league settle failed'));
        runLeagueWeek();
        const leagueWeek = setInterval(runLeagueWeek, 60 * 60 * 1000);
        const rarity = setInterval(
          () => void badges.computeRarity().catch((err) => app.log.warn({ err }, 'badge rarity failed')),
          24 * 60 * 60 * 1000,
        );
        app.addHook('onClose', async () => {
          clearInterval(leagueWeek);
          clearInterval(rarity);
        });
      }
    }

    // Game Ranks' seasons, routes and admin. Seasons close on the calendar
    // quarter; the job runs every six hours and once after start-up, so a
    // deploy at the turn of a quarter catches up. Its close is told on the same
    // `ranks.events`, so the season emblems reach the badges
    const rankSeasons = new RankSeasons(app.db, { wallet: new WalletService(app.db), events: ranks.events, log: app.log });
    registerRankRoutes(app, { ranks, seasons: rankSeasons, admin: new RankAdmin(app.db) });
    const closeSeasons = () =>
      void rankSeasons.closeDue().catch((err) => app.log.warn({ err }, 'rank season close failed'));
    const seasonSweep = setInterval(closeSeasons, 6 * 60 * 60 * 1000);
    if (config.NODE_ENV !== 'test') app.addHook('onReady', async () => closeSeasons());
    app.addHook('onClose', async () => clearInterval(seasonSweep));

    // Hot-table partition maintenance (KUR-115): create upcoming monthly partitions
    // ahead of time so inserts always have a home. Runs in the API process (works
    // without the worker on free tier) and is idempotent, so multiple replicas
    // running it is harmless. Retention (dropping old partitions) is left off by
    // default — no data is auto-deleted; enable per-table with a retain window.
    const PARTITIONED_TABLES = ['notifications', 'rhyme_games'];
    const ensurePartitions = async (): Promise<void> => {
      for (const tbl of PARTITIONED_TABLES) {
        await app.db.query('SELECT ensure_partitions($1, 3, NULL)', [tbl]).catch((err) => app.log.warn({ err, tbl }, 'ensure_partitions failed'));
      }
    };
    void ensurePartitions();
    const partitionSweep = setInterval(() => void ensurePartitions(), 24 * 60 * 60 * 1000);
    app.addHook('onClose', async () => clearInterval(partitionSweep));

    registerAuthRoutes(app, config, adminAccess);
    // optional phone (SMS) verification (KUR-297) — stub sender until a provider
    // is configured; raises trust (#295) and is exported/deleted with the account
    registerPhoneVerificationRoutes(app, new PhoneVerificationService(app.db, { sms: new StubSmsSender() }));
    // shared raw-image body parser for every through-server upload (KUR-177/290)
    registerImageUploadParser(app, mediaLimits(config).maxUploadBytes);
    registerUserRoutes(app, config);
    registerAchievementRoutes(app, gemService, activity);
    // the old achievements: only the (retired, unreachable) tournament win still
    // awards one; lessons, practice, Peyvok and Stories report to the badges above
    const achievements = new AchievementsService(app.db, gemService, activity);
    registerWalletRoutes(app);

    // friend + social + activity-feed routes
    registerFriendRoutes(app, friends);
    // reports, cases, sanctions and appeals: one report service behind every
    // report button, old and new
    const moderationKit = registerModeration(app, config, options.moderation);
    // copyright notices from the public /copyright page land in the same queue (contract-3 §C)
    registerCopyright(app, config, options.copyright);
    registerSocialRoutes(app, new SocialService(app.db, friends, ranks), { reports: moderationKit.reports });
    registerActivityRoutes(app, activity);
    // one wall for stories, poems and pictures — public, like the pages it replaces
    registerFeedRoutes(app);

    // groups / clubs (KUR-084): heal ownerless groups after account deletions
    const groups = new GroupService(app.db);
    // trust levels + velocity caps + spam auto-moderation (KUR-295)
    const trust = new TrustService(app.db, { redis: app.redis });
    // AI-assisted content moderation (KUR-293): spam/scam heuristic by default,
    // provider-pluggable; feeds the #102 review queue via moderation_flags
    const aiMod = new AiModerationService(app.db);
    registerAiModerationRoutes(app, aiMod);
    // automatic image scanning (KUR-294): stub scanner (clean) by default,
    // provider-pluggable; image consumers call ImageModerationService.scan at
    // finalize to gate visibility before serving
    registerImageModerationRoutes(app, new ImageModerationService(app.db));
    // behavioral bot detection (KUR-110): scoring + CAPTCHA gating + ledger reversal
    registerAntibotRoutes(app, new BotDetectionService(app.db));
    // community library (KUR-281): stories & poems authoring + browsing;
    // text auto-screened via the AI moderation tier (KUR-285/#293)
    registerLibraryRoutes(app, undefined, aiMod, trust);
    // threaded comments on library posts (KUR-283)
    registerLibraryCommentRoutes(app, undefined, aiMod, trust);
    // community library reporting → unified moderation queue (KUR-285)
    registerLibraryReportRoutes(app, moderationKit.reports);
    // community image & meme sharing (KUR-290): content model + cost-safe
    // through-server upload (KUR-291)
    registerImagePostRoutes(app, config, undefined, aiMod, trust);
    // reactions + threaded comments on image/meme posts (KUR-291), trust-gated
    // and auto-screened like library comments (#293/#295)
    registerImageInteractionRoutes(app, undefined, undefined, aiMod, trust);
    // image/meme reporting → unified moderation queue (KUR-292)
    registerImageReportRoutes(app, moderationKit.reports);
    // user tags & badges (KUR-286): main-tag precedence + claimable tags
    registerTagRoutes(app);
    registerGroupRoutes(app, groups, trust, config, aiMod);
    const groupReconcile = setInterval(
      () => void groups.reconcileOwnerless().catch((err) => app.log.warn({ err }, 'group reconcile failed')),
      6 * 60 * 60 * 1000,
    );
    app.addHook('onClose', async () => clearInterval(groupReconcile));
    const requestExpiry = setInterval(
      () => void friends.expireOldRequests().catch((err) => app.log.warn({ err }, 'friend request expiry failed')),
      6 * 60 * 60 * 1000,
    );
    app.addHook('onClose', async () => clearInterval(requestExpiry));
    // the shop is registered with gifts, below the chats a gift is posted in
    // Profile cosmetics: equip (server-verified access) + favorites (KUR profile)
    registerCosmeticsRoutes(app, new CosmeticsService(app.db));
    // payment fraud (KUR-073): holds suspicious purchases for admin review
    const fraudService = new FraudService(app.db, new WalletService(app.db));
    registerFraudRoutes(app, fraudService);
    const receiptVerifier = createReceiptVerifier(config);
    if (config.NODE_ENV === 'production' && config.IAP_ALLOW_STUB === 'true') {
      app.log.warn(
        'IAP has no store credentials (IAP_ALLOW_STUB=true): purchases are REFUSED ' +
          'with 503 IAP_UNAVAILABLE. Configure the Apple/Google verifiers before selling anything.',
      );
    }
    registerIapRoutes(
      app,
      new IapService(app.db, new WalletService(app.db), receiptVerifier, config, fraudService),
      config,
    );

    // economy monitoring (KUR-074): roll the ledger into daily faucet/sink stats
    const economy = new EconomyService(app.db);
    registerEconomyRoutes(app, economy);
    const rollupDay = () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      void economy.aggregateDay(yesterday).catch((err) => app.log.warn({ err }, 'economy rollup failed'));
      void economy.aggregateDay(now).catch((err) => app.log.warn({ err }, 'economy rollup failed'));
    };
    const economyRollup = setInterval(rollupDay, 6 * 60 * 60 * 1000);
    app.addHook('onClose', async () => clearInterval(economyRollup));
    registerLessonRoutes(app, gemService, xpService, badges);
    registerDailyGoalRoutes(app);
    registerDailyRewardRoutes(app, new DailyRewardService(app.db, new WalletService(app.db)));
    registerReviewRoutes(app);
    registerPracticeRoutes(app, xpService, badges);
    registerWordleRoutes(app, { xp: xpService, milestones: badges });
    // `play_changed` after every change to a lobby (play/events.ts), so clients
    // stop polling. The gateway it speaks through is set up further down, so it
    // is looked up when there is something to say.
    const playEvents = new PlayEvents(
      app.db,
      {
        notifyUser: (uid, ev) => app.realtime.notifyUser(uid, ev as never),
        publish: (room, ev) => app.realtime.publish(room, ev as never),
      },
      { log: app.log },
    );
    // a finished Peyvok Battle, Rhyme Match or story game moves its players' badges
    playEvents.onFinished(
      (game, lobbyId) => void badges.onGameFinished(game, lobbyId).catch((err) => app.log.warn({ err }, 'game badges failed')),
    );
    // Peyvok Battle multiplayer (KUR-306) — server-authoritative, poll-safe
    registerWordleBattleRoutes(app, { xp: xpService, ranks, onChange: (id, o) => playEvents.changed('wordle-battle', id, o) });
    registerRhymeRoutes(app, { xp: xpService, milestones: badges });
    // typing race (solo time trial) over admin-curated texts
    registerRaceRoutes(app, { xp: xpService, milestones: badges });
    // Rhyme 1v1 / free-for-all multiplayer (KUR-299) — server-authoritative, poll-safe
    registerRhymeMatchRoutes(app, { xp: xpService, ranks, onChange: (id, o) => playEvents.changed('rhyme-match', id, o) });

    // leaderboards (KUR-063): Redis sorted sets, rebuilt from Postgres when they
    // are read and a few minutes old, not on a timer (leaderboards/service.ts)
    const leaderboards = new LeaderboardService(app.db, app.redis);
    registerLeaderboardRoutes(app, leaderboards);

    registerMediaRoutes(app, config);
    // cost-safe through-server voice-note upload (KUR-282)
    registerVoiceRoutes(app, config);
    registerPlacementRoutes(app);
    registerCourseMapRoutes(app);
    // a word saved to the list moves the Gencîne badge
    registerDictionaryRoutes(app, badges);

    // admin RBAC + mandatory TOTP 2FA (KUR-099). adminTotp is set whenever a
    // database is configured, which this branch already requires.
    registerAdminRoutes(app, adminTotp!);
    registerGameContentRoutes(app);
    // starting a dictionary import from the panel, so it needs no shell on the host
    registerDictionaryImportRoutes(app, options.ferheng);
    // recordings for the alphabet page, made in the admin panel
    registerAlphabetAudioRoutes(app, config);
    // and of the Kurdish the lessons use, which lessons deliver with their exercises
    registerLessonAudioRoutes(app, config);
    // and who says each of those recordings, chosen or changed after it was made
    registerRecordingVoiceRoutes(app, config, options.recordingFiles);
    // Stories, which replaced the ranked quiz: reading for everyone, writing in
    // the admin panel, and the starter stories seeded once each as drafts for a
    // native speaker to publish. Not under test, where they would be stories no
    // test asked for (the seeding has its own tests).
    registerStoryRoutes(app, new StoriesService(app.db, app.cache));
    registerStoryAdminRoutes(app, new StoryAdminService(app.db, app.cache));
    if (config.NODE_ENV !== 'test') {
      app.addHook('onReady', async () => {
        await seedStarterStories(app.db, app.log);
      });
    }
    // admin content management: draft→review→publish + optimistic locking (KUR-100)
    registerContentAdminRoutes(app, new ContentAdminService(app.db), adminTotp!);
    // and the starter lessons, seeded once each as drafts for the team to record and publish
    if (config.NODE_ENV !== 'test') {
      app.addHook('onReady', async () => {
        await seedStarterLessons(app.db, app.log);
      });
    }
    // the push and notification services set up with the leagues, above
    registerNotificationRoutes(app, notificationPrefs);
    registerInboxRoutes(app, inbox);
    registerPushRoutes(app, deviceTokens, pushService, inbox);

    // personalized streak reminders (KUR-096): hourly, bucketed by local time
    const streakReminders = new StreakReminderService(app.db, {
      enqueue: async (userId, notification) => {
        // job path records to the inbox in the worker; inline path records here
        if (app.jobs) await app.jobs.enqueue(makePushSendJob(pushService), { userId, notification });
        else {
          await inbox.record(userId, notification);
          await pushService.deliver(userId, notification);
        }
      },
    });
    const reminderSweep = setInterval(
      () => void streakReminders.runHourly().catch((err) => app.log.warn({ err }, 'streak reminder run failed')),
      60 * 60 * 1000,
    );
    // config-driven events (KUR-089): data-defined windows, boundary-cached feed
    const events = new EventService(app.db, app.cache);
    registerEventRoutes(app, events);
    // shop + event config with dual-admin approval (KUR-103)
    registerConfigRoutes(
      app,
      new ConfigService(app.db, {
        shop: new ShopService(app.db, new WalletService(app.db), app.cache),
        events,
      }),
    );
    // event quests + explicit reward claims (KUR-091): progress derived from the
    // ledgers over the event window; claims pay Zêr/Gems with a 72h grace period
    registerQuestRoutes(
      app,
      new QuestService(app.db, events, new WalletService(app.db), new DbQuestMetrics(app.db)),
    );
    app.addHook('onClose', async () => clearInterval(reminderSweep));
    // admin user management: search, detail, moderation + ledger adjustments (KUR-101)
    // (sharing the moderation services, so the second-approval count is the same here)
    registerUserAdminRoutes(app, new UserAdminService(app.db, new WalletService(app.db), moderationKit), adminTotp!);
    // immutable audit trail: auto-logs every admin mutation + search (KUR-104)
    registerAuditLog(app, new AuditService(app.db), adminTotp!);
    // the security log: sign-ins, lockouts, attacks and staff access, for superadmins
    registerSecurityLogRoutes(app, new SecurityLogReader(app.db, config.JWT_SECRET, app.securityLog), adminTotp!);
    // behavioral event tracking (KUR-105): schema-validated, deduped, day-partitioned
    const droppedEvents = new Counter({
      name: 'analytics_events_dropped_total',
      help: 'Analytics events rejected on ingest, by reason',
      labelNames: ['reason'],
      registers: [metricsRegistry],
    });
    const analytics = new AnalyticsService(app.db, { onDropped: (reason) => droppedEvents.inc({ reason }) });
    registerAnalyticsRoutes(app, analytics);
    // the one-time rating box, Send feedback, the store prompt's limits, and
    // the admin's feedback inbox (contract-2 §F)
    registerFeedbackRoutes(app, new FeedbackService(app.db, { secret: config.JWT_SECRET }));
    // transactional email (KUR-098): bounce/complaint webhook feeds suppression;
    // sends themselves run in the worker's send-email job
    const emailProvider = createEmailProvider(config, app.log);
    const emailService = new EmailService(app.db, emailProvider);
    registerEmailWebhookRoutes(app, emailService, config.EMAIL_WEBHOOK_SECRET);
    // the support inbox: mail to support@ arrives by Resend's webhook, and is
    // read and answered in the admin panel, beside how email is set up
    const supportInbox = new SupportInbox(app.db, {
      reader: config.RESEND_INBOX_API_KEY ? new ResendMailReader(config.RESEND_INBOX_API_KEY) : null,
      provider: emailProvider,
      from: config.SUPPORT_EMAIL_FROM,
    });
    registerResendWebhookRoutes(app, { secret: config.RESEND_WEBHOOK_SECRET, email: emailService, inbox: supportInbox });
    registerEmailAdminRoutes(app, { config, provider: emailProvider, inbox: supportInbox });

    // core dashboards (KUR-106): daily-refreshed DAU/retention/funnel rollups
    const dashboards = new DashboardService(app.db);
    registerDashboardRoutes(app, dashboards);
    const dashboardRefresh = setInterval(
      () => void dashboards.refreshDay().catch((err) => app.log.warn({ err }, 'dashboard refresh failed')),
      24 * 60 * 60 * 1000,
    );
    app.addHook('onClose', async () => clearInterval(dashboardRefresh));

    // A/B experiments (KUR-107): deterministic bucketing + exposure logging
    registerExperimentRoutes(app, new ExperimentService(app.db, analytics));

    // realtime gateway (KUR-049): multi-node with Redis, single-node without
    const kv = app.redis ? new RedisKV(app.redis) : new MemoryKV();
    const bus = app.redis
      ? new RedisRoomBus(app.redis, createQueueConnection(config))
      : new LocalRoomBus();
    const realtime = new RealtimeGateway(kv, bus, options.gateway);
    app.decorate('realtime', realtime);
    // a client message is a few dozen bytes; the library's default limit is 100 MiB
    app.register(fastifyWebsocket, { options: { maxPayload: MAX_CLIENT_MESSAGE_BYTES } });
    app.register(async (scoped) => {
      realtime.registerRoutes(scoped);
    });

    // chat moderation (KUR-086): profanity filter + reports + escalation mutes
    const moderation = new ModerationService(app.db, { reports: moderationKit.reports });
    registerModerationRoutes(app, moderation);

    // 1:1 direct messages (KUR-083): HTTP send, WS push + receipts
    // a message to a friend moves the Name badge
    registerChatRoutes(
      app,
      new ChatService(app.db, friends, { notifyUser: (uid, ev) => realtime.notifyUser(uid, ev as never) }, moderation, badges),
      trust,
      aiMod,
    );

    // group chat (KUR-085): per-group room fan-out over the bus + moderation
    const groupChat = new GroupChatService(
      app.db,
      groups,
      { publish: (r, ev) => realtime.publish(r, ev as never), invite: (r, uid, ttl) => realtime.invite(r, uid, ttl) },
      moderation,
    );
    registerGroupChatRoutes(app, groupChat);

    // story games (Stories, which replaced the ranked quiz): Postgres is the
    // game; long-polls are woken across instances over the room bus
    const storyGames = registerStoryGameRoutes(app, { bus, xp: xpService, milestones: badges, friends, ranks });

    // shop + gifts: a gift is bought in the shop or from a chat's gift button,
    // and arrives as a message in the chat either way, so it needs both chats
    const shopWallet = new WalletService(app.db);
    const shop = new ShopService(app.db, shopWallet, app.cache);
    const gifts = new GiftService(
      app.db,
      {
        wallet: shopWallet,
        shop,
        friends,
        groupChat,
        realtime: {
          notifyUser: (uid, ev) => realtime.notifyUser(uid, ev),
          publish: (r, ev) => realtime.publish(r, ev),
        },
        inbox,
        moderation,
        badges,
        log: app.log,
      },
      (k) => (app.storage ? app.storage.publicUrl(k) : null),
    );
    registerShopRoutes(app, shop, {
      gifts,
      // owners of items whose art was replaced: the notice, and returns
      returns: new ItemReturns(app.db, new WalletService(app.db)),
    });
    // the admin's art uploads, partial edits, and delete-or-retire
    registerShopAdminRoutes(app, shop, config);
    // pictures put in place of the built-in art: badges, emblems, frames, default avatars, event banners
    registerArtRoutes(app, new ArtOverrideService(app.db, (key) => (app.storage ? app.storage.publicUrl(key) : null)));
    // taking Hevalo offline for a while, and the status the apps ask while it is
    registerMaintenanceRoutes(app, maintenance!);
    registerGiftRoutes(app, gifts);

    // inviting friends to any online game, game cards in chats, and playing
    // again (contract §B): one join rule and one invite flow for every game
    registerPlayRoutes(app, {
      events: playEvents,
      xp: xpService,
      friends,
      groups,
      inbox,
      chat: new ChatService(app.db, friends, { notifyUser: (uid, ev) => realtime.notifyUser(uid, ev as never) }, moderation),
      groupChat,
      stories: storyGames,
      ranks,
    });

    // the social rail's single read — everything it shows, in one answer, so a
    // poll cannot leave the badge and the list disagreeing
    registerSocialRailRoutes(app, { friends, groups, groupChat, inbox, gifts });

    // tournaments (KUR-060): admin brackets with admin-entered results; no
    // client shows them until they have a game to play (contract-4)
    const tournaments = new TournamentService(app.db, new WalletService(app.db), gemService, achievements);
    registerTournamentRoutes(app, tournaments);
  }

  // Render's health check asks this every few seconds for as long as the service
  // runs, near twenty thousand times a day, and each one wrote two info lines
  // ("incoming request", "request completed"): most of what the API logged was
  // this. A warning or worse about it is still written.
  app.get('/health', { logLevel: 'warn' }, async (_req, reply) => {
    const result = await health.run();
    // degraded still returns 200 so load balancers keep routing while a
    // non-critical dependency flaps; hard-down decisions come in KUR-113
    return reply.code(200).send(result);
  });

  app.get('/version', async () => ({
    version: pkg.version,
    sha: config.GIT_SHA,
    env: config.NODE_ENV,
  }));

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    health: HealthRegistry;
    db: pg.Pool;
    redis: Redis;
    cache: Cache;
    /** Present when REDIS_URL is configured. */
    jobs?: JobQueue;
    /** Present when the S3_* env group is configured. */
    storage?: MediaStorage;
    /** Present when DATABASE_URL is configured. */
    realtime: RealtimeGateway;
    /**
     * Game Ranks, when DATABASE_URL is configured. `ranks.events` is how other
     * modules hear of a rated game finishing or a season closing (ranks/events.ts);
     * the badges listen there (badges/rank-hooks.ts).
     */
    ranks: RankService;
  }
  interface FastifyRequest {
    /** Set by the auth middleware (KUR-016) for valid, active sessions. */
    user?: { id: string; roles: string[]; familyId?: string; emailVerified: boolean };
    /** Why authentication failed, when a credential was presented. */
    authFailure?: import('./plugins/auth.js').AuthFailure;
  }
}
