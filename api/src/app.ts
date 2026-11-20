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
import { RefreshedNotices } from './shop/refreshed.js';
import { GiftService } from './gifts/service.js';
import { registerGiftRoutes } from './gifts/routes.js';
import { CosmeticsService } from './cosmetics/service.js';
import { registerCosmeticsRoutes } from './cosmetics/routes.js';
import { IapService } from './iap/service.js';
import { registerIapRoutes } from './iap/routes.js';
import { assertProductionVerifier, createReceiptVerifier, purchasesOff } from './iap/verifier.js';
import { FraudService } from './fraud/service.js';
import { registerFraudRoutes } from './fraud/routes.js';
import { EconomyService } from './economy/service.js';
import { registerEconomyRoutes } from './economy/routes.js';
import { WalletService } from './wallet/service.js';
import { createQueueConnection } from './jobs/queue.js';
import { LocalRoomBus, RedisRoomBus } from './realtime/bus.js';
import { MAX_CLIENT_MESSAGE_BYTES, RealtimeGateway, type GatewayOptions } from './realtime/gateway.js';
import { MemoryKV, RedisKV } from './realtime/kv.js';
import { endedSessions } from './realtime/sessions.js';
import { requestIdGenerator } from './plugins/request-id.js';
import { setupCors } from './plugins/cors.js';
import { registerUserRoutes } from './users/routes.js';
import { registerLessonRoutes } from './content/routes.js';
import { registerWalletRoutes } from './wallet/routes.js';
import { registerDailyGoalRoutes } from './goals/routes.js';
import { DailyRewardService } from './rewards/service.js';
import { registerDailyRewardRoutes } from './rewards/routes.js';
import { StreakService } from './streaks/service.js';
import { registerStreakRoutes } from './streaks/routes.js';
import { DailyQuestService } from './quests/service.js';
import { registerTreeRoutes } from './trees/routes.js';
import { TreeService } from './trees/service.js';
import { registerDailyQuestRoutes } from './quests/routes.js';
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
import { registerChatRoutes, registerChatUnreadRoute } from './chat/routes.js';
import { registerLetterRoutes } from './letters/routes.js';
import { LetterService } from './letters/service.js';
import { GroupService } from './groups/service.js';
import { registerGroupRoutes } from './groups/routes.js';
import { GroupChatService } from './groups/chat-service.js';
import { registerGroupChatRoutes } from './groups/chat-routes.js';
import { ModerationService } from './moderation/service.js';
import { registerModerationRoutes } from './moderation/routes.js';
import { registerReviewRoutes } from './review/routes.js';
import { registerPracticeRoutes } from './practice/routes.js';
import { registerLearnGameRoutes } from './games/routes.js';
import { registerWordleRoutes } from './game/wordle-routes.js';
import { registerWordleBattleRoutes } from './game/wordle-battle-routes.js';
import { registerRhymeRoutes } from './game/rhyme-routes.js';
import { registerRaceRoutes } from './game/race-routes.js';
import { registerRhymeMatchRoutes } from './game/rhyme-match-routes.js';
import { registerStoryGameRoutes } from './story-games/routes.js';
import { PlayEvents } from './play/events.js';
import { registerPlayRoutes } from './play/routes.js';
import { registerMultiplayerRoutes } from './mp/routes.js';
import { TrustService } from './trust/service.js';
import { AiModerationService } from './moderation/ai-service.js';
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
import { registerPathJumpRoutes } from './jump/routes.js';
import { registerDictionaryRoutes } from './dictionary/routes.js';
import { AdminTotpService } from './admin/totp-service.js';
import { registerAdminRoutes } from './admin/routes.js';
import { AdminAccess } from './admin/owner-access.js';
import { installAdminGate } from './admin/admin-gate.js';
import { registerGameContentRoutes } from './admin/game-content-routes.js';
import { registerDictionaryImportRoutes } from './admin/dictionary-import-routes.js';
import { registerAlphabetAudioRoutes } from './alphabet/routes.js';
import { registerLessonAudioRoutes } from './lessonaudio/routes.js';
import { registerReactionRoutes } from './lessonaudio/reactions.js';
import { registerRecordingRoutes } from './recording/routes.js';
import { registerRecordingVoiceRoutes } from './speakers/routes.js';
import type { RecordingFileOptions } from './speakers/recording-file.js';
import { StoriesService } from './stories/service.js';
import { StoryAdminService } from './stories/admin-service.js';
import { registerStoryRoutes } from './stories/routes.js';
import { registerBookRoutes } from './books/routes.js';
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
import { makePushSendJob, pushRecorded } from './jobs/push-jobs.js';
import { ContentAdminService } from './content/admin-service.js';
import { seedStarterLessons } from './content/starter-lessons.js';
import { seedRoadLessons } from './content/road-seed.js';
import { RoadChapterWatch } from './content/road-chapters.js';
import { seedStarterGameContent } from './games/starters.js';
import { seedStarterLibrary } from './games/starter-library.js';
import { seedStarterLore } from './lore/starters.js';
import { seedDetectiveCases } from './games/detective-cases.js';
import { seedMemoryThiefDeck } from './games/memory-thief-deck.js';
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
import { installRawBodyGate } from './plugins/raw-body-gate.js';
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
import { registerClientErrorRoutes } from './observability/client-errors.js';
import { createWorker } from './jobs/worker.js';
import { makeAnalyticsRollupJob, makeEconomyRollupJob } from './jobs/rollup-jobs.js';
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
  /** Test seam: where a dictionary import reads its words from; the real source downloads 65 MB over about ninety minutes, which no test should start. */
  ferheng?: FerhengSource;
  /** Test seams for moderation: the moderator count, the urgent-report mailer and the picture checker. */
  moderation?: ModerationOptions;
  /** where the security log's alert emails go (security/wire.ts) */
  security?: SecurityLogOptions;
  /** Test seam for copyright notices: where their emails go. */
  copyright?: CopyrightWireOptions;
  /** Test seam for reading a recording's file from another site: the fetch, the name lookup, the time allowed. */
  recordingFiles?: RecordingFileOptions;
  /** Test seam: the clock offline mode reads. The setting is one row every test file shares, so a test runs it days ahead where only its own app sees it on. */
  maintenanceClock?: () => Date;
}

export function buildApp(config: AppConfig, options: BuildAppOptions = {}): FastifyInstance {
  // the lesson shuffle is keyed with a server secret, never with what the client sees
  setShuffleKey(config.JWT_SECRET);
  // and moderation's pseudonyms and banned-address hashes, with the same secret
  setModerationKey(config.JWT_SECRET);
  const app = Fastify({
    // Start-up seeding of stories, lessons and game decks runs in onReady hooks, which fastify cuts off at this limit;
    // the 10 s default is too short for a first seed on a small server, and a cut-off start fails the deploy.
    pluginTimeout: 120_000,
    logger: {
      level: config.LOG_LEVEL,
      // pretty logs are a dev nicety; structured JSON everywhere else
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      // Personal data never reaches log storage (observability/redact.ts).
      redact: LOG_REDACT,
    },
    // An upstream request id when it looks like one, else a fresh one; read here, not by fastify, which takes any text.
    requestIdHeader: false,
    genReqId: requestIdGenerator(),
    // A whole request, body included, within two minutes: fastify otherwise turns off Node's own limit, so a client
    // dripping a body would hold its connection forever. Two minutes covers the largest upload on a slow phone.
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
    // Reconcile the configured admin allowlist once the server is up (idempotent; grants only to confirmed addresses).
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
    // The API only enqueues, so something must consume the queue or verification and reset mail is never sent. The
    // worker runs in-process by default, which is safe alongside a dedicated worker; skipped under test.
    if (config.NODE_ENV !== 'test' && config.RUN_WORKER_IN_API !== 'false') {
      // Its own pino instance, since fastify's logger type is not pino's, and a distinct name keeps job logs separate.
      const worker = createWorker(config, pino({ level: config.LOG_LEVEL, name: 'hevalo-api-worker', redact: LOG_REDACT }));
      app.log.info('processing background jobs in-process (set RUN_WORKER_IN_API=false if a dedicated worker runs)');
      // The housekeeping and the dashboards' rollups are scheduled here (there may be no dedicated worker), with a one-time
      // catch-up: sign-ups and the economy aggregate from existing rows, so history fills at once.
      if (config.DATABASE_URL) {
        const analyticsJob = makeAnalyticsRollupJob(new RollupDashboards(app.db));
        const economyJob = makeEconomyRollupJob(new RollupEconomy(app.db));
        void (async () => {
          try {
            await scheduleMaintenance(jobs, app.db, createStorage(config));
            // Backfill once, not on every boot, since an idle host restarts often; each dashboard is checked against its own table.
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

  // Hook order matters: authenticate, log the user id, then rate limit, since user-keyed limits need req.user. The admin
  // TOTP service is declared here because the 2FA gate must be installed before any route.
  let adminTotp: AdminTotpService | undefined;
  let adminAccess: AdminAccess | undefined;
  if (config.DATABASE_URL) {
    setupAuth(app, config);
    // An unverified account cannot write anything. Installed before every route, since a preHandler hook applies only to
    // routes added after it.
    installActivationGate(app);

    // Mandatory 2FA on every staff-only route, as one hook so new routes are covered. It reads the route table, so it must
    // be installed here, before any route: a fastify hook only applies to routes added after it.
    adminTotp = new AdminTotpService(app.db);
    adminAccess = new AdminAccess(app.db, config);
    // whether the console is for every staff role, or only the addresses listed
    app.log.info({ listedAddressesOnly: adminAccess.listed }, 'admin console access');
    installAdminGate(app, adminTotp, adminAccess);

    // Which network each signed-in account is on, for account linking, and the daily prune of that and risk decisions;
    // also before any route.
    setupNetworkSightings(app, { pruneAtStart: config.NODE_ENV !== 'test' });
  }
  app.addHook('onRequest', async (req) => {
    if (req.user?.id) {
      req.log = req.log.child({ userId: req.user.id });
    }
  });

  // Scanner probes (PHP scripts, CMS admin pages, secrets files) are answered "not found" at once, and a network that
  // keeps probing is shut out while signed out: after the session is read, before any rate limit is spent.
  installScannerShield(app, { redis: app.hasDecorator('redis') ? app.redis : undefined });
  // Upload bodies only for the routes that store uploads, refused before they are read anywhere else.
  installRawBodyGate(app);

  // Hevalo taken offline from the admin: every request but the console's and staff's gets the offline notice, before
  // any route and any rate limit.
  let maintenance: MaintenanceService | undefined;
  if (config.DATABASE_URL) {
    maintenance = new MaintenanceService(app.db, (key) => (app.storage ? app.storage.publicUrl(key) : null), app.securityLog, options.maintenanceClock);
    installMaintenanceGate(app, maintenance);
  }

  // Shares the app's Redis connection; commands fail fast when Redis is down, and the limiter then allows requests.
  setupRateLimit(app, app.redis ? new RedisRateLimitStore(app.redis) : new MemoryRateLimitStore(), {
    onLimited: (req, limit) => app.securityLog.record('request.rate_limited', { userId: req.user?.id ?? null, details: limit }),
  });

  const storage = createStorage(config);
  if (storage) {
    app.decorate('storage', storage);
    // A private bucket for evidence and data exports, checked and filled with older private files once the server is up
    // (media/storage.ts).
    if (storage.hasPrivateBucket && config.NODE_ENV !== 'test') {
      app.addHook('onReady', async () => {
        void preparePrivateStorage(storage, app.log);
      });
    }
  }

  // auth + user endpoints need the database
  if (config.DATABASE_URL) {
    // Config-driven Gem grants, shared by achievements, lessons and tournaments.
    const gemService = new GemService(app.db, new WalletService(app.db));
    registerGemRoutes(app, gemService);

    // Friends and friend milestones, needed by the services below.
    const friends = new FriendService(app.db);
    const activity = new ActivityService(app.db, friends);

    // Push: device tokens and queued delivery, gated by category preferences and quiet hours at delivery; set up here
    // because league and badge news below goes through it.
    const deviceTokens = new DeviceTokenService(app.db);
    const notificationPrefs = new NotificationPrefsService(app.db);
    const pushService = new PushService(deviceTokens, createPushProvider(config, app.log), notificationPrefs);
    const inbox = new InboxService(app.db);
    const notices = progressNotices({ inbox, push: pushService, jobs: app.jobs });

    // Learning Leagues and badges. Learning XP joins the week's group; the week is settled on Monday and small groups
    // merged on Wednesday from the job queue (jobs/league-jobs.ts). Badges are counted from what happened and told
    // through the list, a realtime `badge_unlocked` (the gateway is looked up later, since it is set up further down) and
    // one push a day.
    const { xp: xpService, leagues, badges } = createProgression(app.db, {
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

    // Game ranks and seasons have ended; their routes answer older phone builds with empty shapes.
    registerRankRoutes(app);

    // Monthly partitions created ahead of time so inserts always have a home. Runs in the API process and is idempotent,
    // so several replicas are harmless. Retention is off by default; nothing is deleted automatically.
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
    // Optional phone verification with a stub sender until a provider is configured; it raises trust and is exported and
    // deleted with the account.
    registerPhoneVerificationRoutes(app, new PhoneVerificationService(app.db, { sms: new StubSmsSender() }));
    // The shared raw-image body parser for every through-server upload.
    registerImageUploadParser(app, mediaLimits(config).maxUploadBytes);
    registerUserRoutes(app, config);
    registerAchievementRoutes(app, gemService, activity);
    // The old achievements: only the tournament win still awards one; lessons, practice, Peyvok and Stories report to the
    // badges above.
    const achievements = new AchievementsService(app.db, gemService, activity);
    registerWalletRoutes(app);

    // friend + social + activity-feed routes
    registerFriendRoutes(app, friends);
    // Reports, cases, sanctions and appeals: one report service behind every report button.
    const moderationKit = registerModeration(app, config, { ...options.moderation, registry: metricsRegistry });
    // Copyright notices from the public /copyright page land in the same queue.
    registerCopyright(app, config, options.copyright);
    registerSocialRoutes(app, new SocialService(app.db, friends), { reports: moderationKit.reports, trees: new TreeService(app.db, new WalletService(app.db)) });
    registerActivityRoutes(app, activity);
    // one wall for stories, poems and pictures — public, like the pages it replaces
    registerFeedRoutes(app);

    // Groups: ownerless groups are healed after account deletions, and removals, bans and requests to come back are
    // notifications pushed after the change commits.
    const groups = new GroupService(app.db, { push: pushRecorded(pushService, app.jobs), log: app.log });
    // Trust levels, velocity caps and spam auto-moderation.
    const trust = new TrustService(app.db, { redis: app.redis });
    // Automated content moderation: a spam and scam heuristic by default, provider-pluggable, feeding the review queue.
    const aiMod = new AiModerationService(app.db);
    registerAiModerationRoutes(app, aiMod);
    // The older "Automated flags" image routes, decided through the same picture checks as the Picture checks page.
    registerImageModerationRoutes(app, moderationKit.pictures.checks, moderationKit.pictures);
    // Behavioural bot detection: scoring, CAPTCHA gating and ledger reversal.
    registerAntibotRoutes(app, new BotDetectionService(app.db));
    // The community library: stories and poems, with text screened by automated moderation.
    registerLibraryRoutes(app, undefined, aiMod, trust);
    // Threaded comments on library posts.
    registerLibraryCommentRoutes(app, undefined, aiMod, trust);
    // Library reports into the shared moderation queue.
    registerLibraryReportRoutes(app, moderationKit.reports);
    // Community image posts, with the cost-safe through-server upload.
    registerImagePostRoutes(app, config, undefined, aiMod, trust);
    // Reactions and threaded comments on image posts, trust-gated and screened like library comments.
    registerImageInteractionRoutes(app, undefined, undefined, aiMod, trust);
    // Image post reports into the shared moderation queue.
    registerImageReportRoutes(app, moderationKit.reports);
    // User tags: main-tag precedence and claimable tags.
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
    // The shop is registered with gifts, below the chats a gift is posted in. Profile cosmetics: equipping (access checked
    // on the server) and favourites.
    registerCosmeticsRoutes(app, new CosmeticsService(app.db));
    // Payment fraud: suspicious purchases are held for admin review.
    const fraudService = new FraudService(app.db, new WalletService(app.db));
    registerFraudRoutes(app, fraudService);
    // a stub verifier in production stops the boot here (iap/verifier.ts)
    const receiptVerifier = assertProductionVerifier(config, createReceiptVerifier(config));
    if (config.NODE_ENV === 'production' && purchasesOff(config)) {
      app.log.warn(
        'IAP has no store credentials (IAP_PURCHASES_OFF=true): purchases are REFUSED ' +
          'with 503 IAP_UNAVAILABLE. Configure the Apple/Google verifiers before selling anything.',
      );
      if (config.IAP_ALLOW_STUB === 'true') {
        app.log.warn('IAP_ALLOW_STUB is the old name for IAP_PURCHASES_OFF and is read as it: rename it in the dashboard.');
      }
    }
    registerIapRoutes(
      app,
      new IapService(app.db, new WalletService(app.db), receiptVerifier, config, fraudService),
      config,
    );

    // Economy monitoring: the ledger rolled into daily faucet and sink stats.
    const economy = new EconomyService(app.db);
    registerEconomyRoutes(app, economy);
    const rollupDay = () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      void economy.aggregateDay(yesterday).catch((err) => app.log.warn({ err }, 'economy rollup failed'));
      void economy.aggregateDay(now).catch((err) => app.log.warn({ err }, 'economy rollup failed'));
    };
    // With a queue the rollup job does this (jobs/maintenance.ts); the timer is for a process without one.
    if (!app.jobs) {
      const economyRollup = setInterval(rollupDay, 6 * 60 * 60 * 1000);
      app.addHook('onClose', async () => clearInterval(economyRollup));
    }
    registerLessonRoutes(app, gemService, xpService, badges);
    registerDailyGoalRoutes(app);
    registerDailyRewardRoutes(app, new DailyRewardService(app.db, new WalletService(app.db)));
    // a streak that ended, restored for gems (or a Hevalo+ member's free one of the month)
    registerStreakRoutes(app, new StreakService(app.db, new WalletService(app.db)));
    // today's three quests, moved by finished lessons and practice, each paying a chest of Zêr
    registerDailyQuestRoutes(app, new DailyQuestService(app.db, new WalletService(app.db)));
    // the learner's tree: planted once, watered with what lessons earn, another kind bought with Zêr
    registerTreeRoutes(app, new TreeService(app.db, new WalletService(app.db)));
    registerReviewRoutes(app);
    registerPracticeRoutes(app, xpService, badges);
    // The learning games (Build a Sentence and after): approved content only, rounds made and checked here, paid by
    // performance, and their content's review in the admin panel.
    registerLearnGameRoutes(app, { xp: xpService, milestones: badges, config, recordingFiles: options.recordingFiles });
    registerWordleRoutes(app, { milestones: badges });
    // `play_changed` after every lobby change (play/events.ts), so clients need not poll; the gateway is looked up when
    // needed, since it is set up further down.
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
    // Peyvok Battle: server-authoritative and safe to poll.
    registerWordleBattleRoutes(app, { xp: xpService, onChange: (id, o) => playEvents.changed('wordle-battle', id, o) });
    registerRhymeRoutes(app, { milestones: badges });
    // typing race (solo time trial) over admin-curated texts
    registerRaceRoutes(app, { milestones: badges });
    // Rhyme 1v1 and free-for-all: server-authoritative and safe to poll.
    registerRhymeMatchRoutes(app, { xp: xpService, onChange: (id, o) => playEvents.changed('rhyme-match', id, o) });

    // Leaderboards: Redis sorted sets rebuilt from Postgres when read and a few minutes old, not on a timer.
    const leaderboards = new LeaderboardService(app.db, app.redis, {
      publicUrl: (key) => (app.storage ? app.storage.publicUrl(key) : null),
    });
    registerLeaderboardRoutes(app, leaderboards);

    registerMediaRoutes(app, config);
    // Cost-safe through-server voice-note upload.
    registerVoiceRoutes(app, config);
    registerPlacementRoutes(app);
    registerCourseMapRoutes(app);
    // jumping ahead on the path: a short test that opens a later unit
    registerPathJumpRoutes(app);
    // a word saved to the list moves the Gencîne badge
    registerDictionaryRoutes(app, badges);

    // Admin roles and mandatory TOTP 2FA; adminTotp is set whenever a database is configured, which this branch requires.
    registerAdminRoutes(app, adminTotp!);
    registerGameContentRoutes(app);
    // starting a dictionary import from the panel, so it needs no shell on the host
    registerDictionaryImportRoutes(app, options.ferheng);
    // recordings for the alphabet page, made in the admin panel
    registerAlphabetAudioRoutes(app, config);
    // And the Kurdish lessons use, delivered with their exercises; a take may complete a Kurmanji Road chapter, which then
    // goes online by itself (content/road-chapters.ts), except under test, where no road is seeded.
    const roadChapters = new RoadChapterWatch(app.db, app.log);
    registerLessonAudioRoutes(app, config, config.NODE_ENV === 'test' ? undefined : () => void roadChapters.nudge());
    // Hevalo's and Xezo's recorded reactions, which the apps play at moments anywhere.
    registerReactionRoutes(app);
    // And who says each of those recordings, set or changed after recording.
    registerRecordingVoiceRoutes(app, config, options.recordingFiles);
    // And everything each voice says, for the "Record by person" page; Road lessons only in files are listed too, except
    // under test, where nothing is seeded.
    registerRecordingRoutes(app, { withRoadFiles: config.NODE_ENV !== 'test' });
    // Stories: reading for everyone, writing in the admin panel, and the starter stories seeded once each, published and
    // kept as their files say until changed in the panel. Not under test, where seeding has its own tests.
    registerStoryRoutes(app, new StoriesService(app.db, app.cache));
    // and the Hevalo book: the road's chapters that are online, as a PDF to keep
    registerBookRoutes(app);
    registerStoryAdminRoutes(app, new StoryAdminService(app.db, app.cache));
    if (config.NODE_ENV !== 'test') {
      app.addHook('onReady', async () => {
        await seedStarterStories(app.db, app.log, undefined, app.cache);
      });
    }
    // Admin content management: draft, review, publish, with optimistic locking.
    registerContentAdminRoutes(app, new ContentAdminService(app.db), adminTotp!);
    // And the starter lessons, seeded once each as drafts to record and publish, then the Kurmanji Road's, each once as a
    // draft in its own course (content/road-seed.ts).
    if (config.NODE_ENV !== 'test') {
      app.addHook('onReady', async () => {
        await seedStarterLessons(app.db, app.log);
        await seedRoadLessons(app.db, app.log);
        // A chapter whose lines were all recorded before its lessons arrived goes online now.
        await roadChapters.nudge();
        // And the learning games' starters: the first case, from the Road's lines once present (games/starters.ts), then each
        // game's first rows, made once from the course and published (games/starter-library.ts).
        await seedStarterGameContent(app.db, app.log);
        await seedStarterLibrary(app.db, app.log, app.cache);
        // And the Stories' starter riddles and proverbs, published and kept as their files say until changed (lore/starters.ts).
        await seedStarterLore(app.db, app.log);
        // And Detective's cases and the Memory Thief's deck, kept as their files say until a row is changed
        // (games/detective-cases.ts, games/memory-thief-deck.ts); both read the course and stories seeded above.
        await seedDetectiveCases(app.db, app.log, app.cache);
        await seedMemoryThiefDeck(app.db, app.log, app.cache);
      });
    }
    // the push and notification services set up with the leagues, above
    registerNotificationRoutes(app, notificationPrefs);
    registerInboxRoutes(app, inbox);
    registerPushRoutes(app, deviceTokens, pushService, inbox);

    // Personalized streak reminders, hourly, by local time.
    const streakReminders = new StreakReminderService(app.db, {
      enqueue: async (reminders) => {
        // job path records to the inbox in the worker; inline path records here
        if (app.jobs) await app.jobs.enqueueMany(makePushSendJob(pushService), reminders);
        else {
          for (const { userId, notification } of reminders) {
            await inbox.record(userId, notification);
            await pushService.deliver(userId, notification);
          }
        }
      },
    });
    const reminderSweep = setInterval(
      () => void streakReminders.runHourly().catch((err) => app.log.warn({ err }, 'streak reminder run failed')),
      60 * 60 * 1000,
    );
    // Config-driven events: data-defined windows with a boundary-cached list.
    const events = new EventService(app.db, app.cache);
    registerEventRoutes(app, events);
    // Shop and event config with dual-admin approval.
    registerConfigRoutes(
      app,
      new ConfigService(app.db, {
        shop: new ShopService(app.db, new WalletService(app.db), app.cache),
        events,
      }),
    );
    // Event quests and reward claims: progress from the ledgers over the event window, claims paying Zêr or Gems with a
    // 72-hour grace period.
    registerQuestRoutes(
      app,
      new QuestService(app.db, events, new WalletService(app.db), new DbQuestMetrics(app.db)),
    );
    app.addHook('onClose', async () => clearInterval(reminderSweep));
    // Admin user management: search, detail, moderation and ledger adjustments, sharing the moderation services so the
    // second-approval count matches.
    registerUserAdminRoutes(app, new UserAdminService(app.db, new WalletService(app.db), moderationKit), adminTotp!);
    // Immutable audit trail logging every admin change and search.
    registerAuditLog(app, new AuditService(app.db), adminTotp!);
    // the security log: sign-ins, lockouts, attacks and staff access, for superadmins
    registerSecurityLogRoutes(app, new SecurityLogReader(app.db, config.JWT_SECRET, app.securityLog), adminTotp!);
    // Behavioural event tracking: schema-validated, deduplicated, day-partitioned.
    const droppedEvents = new Counter({
      name: 'analytics_events_dropped_total',
      help: 'Analytics events rejected on ingest, by reason',
      labelNames: ['reason'],
      registers: [metricsRegistry],
    });
    const analytics = new AnalyticsService(app.db, { onDropped: (reason) => droppedEvents.inc({ reason }) });
    registerAnalyticsRoutes(app, analytics);
    // The one-time rating box, Send feedback, the store prompt's limits, and the admin's feedback inbox.
    registerFeedbackRoutes(app, new FeedbackService(app.db, { secret: config.JWT_SECRET }));
    // Transactional email: the bounce and complaint webhook feeds suppression; sends run in the worker's job.
    const emailProvider = createEmailProvider(config, app.log);
    const emailService = new EmailService(app.db, emailProvider);
    registerEmailWebhookRoutes(app, emailService, config.EMAIL_WEBHOOK_SECRET);
    // The support inbox: mail to the support address arrives by the provider's webhook and is read and answered in the
    // admin panel.
    const supportInbox = new SupportInbox(app.db, {
      reader: config.RESEND_INBOX_API_KEY ? new ResendMailReader(config.RESEND_INBOX_API_KEY) : null,
      provider: emailProvider,
      from: config.SUPPORT_EMAIL_FROM,
      ...(config.ZAGROSIAN_EMAIL_FROM ? { zagrosianFrom: config.ZAGROSIAN_EMAIL_FROM } : {}),
    });
    registerResendWebhookRoutes(app, { secret: config.RESEND_WEBHOOK_SECRET, email: emailService, inbox: supportInbox });
    registerEmailAdminRoutes(app, { config, provider: emailProvider, inbox: supportInbox });

    // Core dashboards: daily-refreshed DAU, retention and funnel rollups.
    const dashboards = new DashboardService(app.db);
    registerDashboardRoutes(app, dashboards);
    // as the economy's above: the queue's rollup job, or this timer without a queue
    if (!app.jobs) {
      const dashboardRefresh = setInterval(
        () => void dashboards.refreshDay().catch((err) => app.log.warn({ err }, 'dashboard refresh failed')),
        24 * 60 * 60 * 1000,
      );
      app.addHook('onClose', async () => clearInterval(dashboardRefresh));
    }

    // A/B experiments: deterministic bucketing and exposure logging.
    registerExperimentRoutes(app, new ExperimentService(app.db, analytics));

    // Realtime gateway: several nodes with Redis, one without.
    const kv = app.redis ? new RedisKV(app.redis) : new MemoryKV();
    const bus = app.redis
      ? new RedisRoomBus(app.redis, createQueueConnection(config))
      : new LocalRoomBus();
    // a socket stops when its session does: signed out, a new password, a ban (realtime/sessions.ts)
    const realtime = new RealtimeGateway(kv, bus, { sessionsEnded: endedSessions(app.db), ...options.gateway });
    app.decorate('realtime', realtime);
    // a client message is a few dozen bytes; the library's default limit is 100 MiB
    app.register(fastifyWebsocket, { options: { maxPayload: MAX_CLIENT_MESSAGE_BYTES } });
    app.register(async (scoped) => {
      realtime.registerRoutes(scoped);
    });

    // Chat moderation: profanity filter, reports and escalation mutes.
    const moderation = new ModerationService(app.db, { reports: moderationKit.reports });
    registerModerationRoutes(app, moderation);

    // Direct messages: sent over HTTP, pushed and acknowledged over the WebSocket; a message to a friend moves the Name badge.
    const chat = new ChatService(app.db, friends, { notifyUser: (uid, ev) => realtime.notifyUser(uid, ev as never) }, moderation, badges);
    registerChatRoutes(app, chat, trust, aiMod);

    // Letters by bird: pen pals in Kurdish, met by sending a bird out, within an age band (letters/service.ts).
    const letterService = new LetterService(app.db, {
      moderation,
      inbox,
      push: pushRecorded(pushService, app.jobs),
      // an open window or correspondence hears of every change as it happens, and reads the page again
      realtime: { notifyUser: (uid, ev) => realtime.notifyUser(uid, ev as never) },
      log: app.log,
      wallet: new WalletService(app.db),
      // a drawing is checked as any picture is before the letter is delivered
      pictures: moderationKit.pictures,
    });
    registerLetterRoutes(app, letterService);
    // and once a person approves it, its reader hears of it the way any letter's reader does
    moderationKit.pictures.useLetters(letterService);

    // Group chat: per-group room fan-out over the bus, with moderation.
    const groupChat = new GroupChatService(
      app.db,
      groups,
      { publish: (r, ev) => realtime.publish(r, ev as never), invite: (r, uid, ttl) => realtime.invite(r, uid, ttl) },
      moderation,
    );
    registerGroupChatRoutes(app, groupChat);
    // The badges' unread counts, direct and group, without the conversation list.
    registerChatUnreadRoute(app, chat, groupChat);

    // Story games: Postgres holds the game, and long-polls are woken across instances over the room bus.
    const storyGames = registerStoryGameRoutes(app, { bus, xp: xpService, milestones: badges, friends });
    // The multiplayer learning games: one engine and set of tables, long-polls woken over the bus, free text through the
    // chat pipeline, and `play_changed` on every change.
    const multiplayer = registerMultiplayerRoutes(app, {
      bus,
      xp: xpService,
      freeText: { moderation, trust, aiMod },
      onChange: (game, id, o) => playEvents.changed(game, id, o),
      friends,
    });

    // Shop and gifts: a gift bought in the shop or from a chat arrives as a chat message either way, so it needs both chats.
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
      // Owners of items whose art was replaced get the one-time notice and keep the item.
      refreshed: new RefreshedNotices(app.db),
    });
    // the admin's art uploads, partial edits, and delete-or-retire
    registerShopAdminRoutes(app, shop, config);
    // Pictures put in place of the built-in art: badges, emblems, frames, default avatars, event banners.
    registerArtRoutes(app, new ArtOverrideService(app.db, (key) => (app.storage ? app.storage.publicUrl(key) : null)));
    // taking Hevalo offline for a while, and the status the apps ask while it is
    registerMaintenanceRoutes(app, maintenance!);
    registerGiftRoutes(app, gifts);

    // Inviting friends to any online game, game cards in chats, and playing again: one join rule and invite flow for all.
    registerPlayRoutes(app, {
      events: playEvents,
      xp: xpService,
      friends,
      groups,
      inbox,
      chat: new ChatService(app.db, friends, { notifyUser: (uid, ev) => realtime.notifyUser(uid, ev as never) }, moderation),
      groupChat,
      stories: storyGames,
      multiplayer,
    });

    // The social rail's single read, so a poll cannot leave the badge and list disagreeing.
    registerSocialRailRoutes(app, { friends, groups, groupChat, inbox });

    // Tournaments: admin brackets with admin-entered results, shown by no client until there is a game to play.
    const tournaments = new TournamentService(app.db, new WalletService(app.db), gemService, achievements);
    registerTournamentRoutes(app, tournaments);
  }

  // crash reports from the apps, into the log; needs neither the database nor a signed-in caller
  registerClientErrorRoutes(app);

  // The platform's health check calls this every few seconds, so its request logs are kept at warn and above.
  app.get('/health', { logLevel: 'warn' }, async (_req, reply) => {
    const result = await health.run();
    // Degraded still answers 200 so load balancers keep routing while a non-critical dependency flaps.
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
  }
  interface FastifyRequest {
    /** Set by the auth middleware for valid, active sessions. */
    user?: {
      id: string;
      roles: string[];
      familyId?: string;
      emailVerified: boolean;
      /** A birth month on record, as the auth middleware read it with the account (users/age.ts `requireBirthMonth`). */
      birthMonthKnown?: boolean;
      /** a guest account (auth/guest.ts): learning only, until claimed (`requireAccount`) */
      guest?: boolean;
      /** held while a person checks whether it belongs to someone banned (moderation/restrictions.ts `requireNotHeld`) */
      held?: boolean;
    };
    /** Why authentication failed, when a credential was presented. */
    authFailure?: import('./plugins/auth.js').AuthFailure;
  }
}
