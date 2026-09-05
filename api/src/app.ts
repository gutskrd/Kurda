import Fastify, { type FastifyInstance } from 'fastify';
import { readFileSync } from 'node:fs';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import { registerAuthRoutes } from './auth/routes.js';
import { Cache } from './cache/cache.js';
import { JobQueue } from './jobs/queue.js';
import { createStorage, type MediaStorage } from './media/storage.js';
import { registerImageUploadParser } from './media/uploadParser.js';
import { mediaLimits } from './media/mediaLimits.js';
import { createRedis, redisHealthCheck } from './cache/redis.js';
import type { AppConfig } from './config/env.js';
import { createPool, dbHealthCheck } from './db/pool.js';
import { HealthRegistry, notConfigured } from './health/registry.js';
import { setupMetrics } from './observability/metrics.js';
import { setupAuth } from './plugins/auth.js';
import { setupErrorHandling } from './plugins/errors.js';
import { setupSecurityHeaders } from './plugins/security-headers.js';
import { setupCachePolicy } from './plugins/cache-policy.js';
import { setupValidation } from './plugins/validation.js';
import { setupRateLimit } from './ratelimit/plugin.js';
import { MemoryRateLimitStore, RedisRateLimitStore } from './ratelimit/store.js';
import { registerAchievementRoutes } from './achievements/routes.js';
import fastifyWebsocket from '@fastify/websocket';
import { GameEngine, type EngineOptions } from './game/engine.js';
import { MemoryMatchQueue, RedisMatchQueue } from './game/match-queue.js';
import { MatchmakingService, type MatchmakingOptions } from './game/matchmaking.js';
import { registerGameRoutes, registerMatchmakingRoutes, registerPrivateRoomRoutes } from './game/routes.js';
import { PrivateRoomService } from './game/private-room-service.js';
import { AntiCheatService } from './game/anti-cheat-service.js';
import { RematchService } from './game/rematch-service.js';
import { ChallengeService } from './game/challenge-service.js';
import { registerChallengeRoutes } from './game/challenge-routes.js';
import { RatingService } from './ranking/rating-service.js';
import { registerRatingRoutes } from './ranking/routes.js';
import { TournamentService } from './tournament/service.js';
import { registerTournamentRoutes } from './tournament/routes.js';
import { ShopService } from './shop/service.js';
import { registerShopRoutes } from './shop/routes.js';
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
import { XpService } from './xp/service.js';
import { createQueueConnection } from './jobs/queue.js';
import { LocalRoomBus, RedisRoomBus } from './realtime/bus.js';
import { RealtimeGateway, type GatewayOptions } from './realtime/gateway.js';
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
import { LeagueService } from './leagues/service.js';
import { registerLeagueRoutes } from './leagues/routes.js';
import { LeaderboardService } from './leaderboards/service.js';
import { registerLeaderboardRoutes } from './leaderboards/routes.js';
import { SeasonService } from './seasons/service.js';
import { registerSeasonRoutes } from './seasons/routes.js';
import { FriendService } from './friends/service.js';
import { registerFriendRoutes } from './friends/routes.js';
import { SocialService } from './social/service.js';
import { registerSocialRoutes } from './social/routes.js';
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
import { TrustService } from './trust/service.js';
import { AiModerationService } from './moderation/ai-service.js';
import { ImageModerationService } from './moderation/image-moderation-service.js';
import { registerAiModerationRoutes, registerImageModerationRoutes } from './moderation/ai-routes.js';
import { ModerationQueueService } from './moderation/queue-service.js';
import { registerModerationQueueRoutes } from './moderation/queue-routes.js';
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
import { installAdminGate } from './admin/admin-gate.js';
import { registerGameContentRoutes } from './admin/game-content-routes.js';
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
import { registerContentAdminRoutes } from './content/admin-routes.js';
import { UserAdminService } from './admin/user-admin-service.js';
import { registerUserAdminRoutes } from './admin/user-admin-routes.js';
import { AuditService } from './admin/audit-service.js';
import { registerAuditLog } from './admin/audit-routes.js';
import { Counter } from 'prom-client';
import { AnalyticsService } from './analytics/service.js';
import { registerAnalyticsRoutes } from './analytics/routes.js';
import { EmailService } from './email/service.js';
import { createEmailProvider } from './email/provider.js';
import pino from 'pino';
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
import { registerEmailWebhookRoutes } from './email/webhook-routes.js';
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
  /** Test seam: shrink bands/timeouts. */
  matchmaking?: MatchmakingOptions;
  /** Test seam: shrink phase timers. */
  engine?: EngineOptions;
}

export function buildApp(config: AppConfig, options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // pretty logs are a dev nicety; structured JSON everywhere else
      transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      // PII never reaches log storage (KUR-009)
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.password',
          '*.passwordHash',
          '*.token',
          '*.email',
        ],
        censor: '[redacted]',
      },
    },
    // trust an upstream-provided request id (gateway/LB) or generate one
    requestIdHeader: 'x-request-id',
  });

  setupCors(app, config);
  setupValidation(app);
  setupErrorHandling(app, config);
  setupSecurityHeaders(app);
  setupCachePolicy(app);
  const metricsRegistry = setupMetrics(app);


  const health = new HealthRegistry();
  if (config.DATABASE_URL) {
    const pool = createPool(config);
    app.decorate('db', pool);
    // reconcile the configured admin allowlist once the server is up (idempotent;
    // only grants to accounts that have confirmed their address)
    app.addHook('onReady', async () => {
      await grantBootstrapAdmins(pool, config.BOOTSTRAP_ADMIN_EMAILS, app.log).catch((err) => {
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
      const worker = createWorker(config, pino({ level: config.LOG_LEVEL, name: 'mykurda-api-worker' }));
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

  // hook order matters: authenticate → userId logging → rate limiting
  // (user-keyed limits need req.user set first)
  // shared with the admin routes further down; declared here because the 2FA
  // gate has to be installed before any route is registered
  let adminTotp: AdminTotpService | undefined;
  if (config.DATABASE_URL) {
    setupAuth(app, config);

    // Mandatory 2FA on everything under /admin: one prefix hook rather than a
    // guard on each of forty routes, so a new admin route is covered the day it
    // is written. Installed HERE, before any route is registered, because a
    // Fastify hook only applies to routes added after it — placing it further
    // down would silently leave the earlier admin routes ungated.
    adminTotp = new AdminTotpService(app.db);
    installAdminGate(app, adminTotp);
  }
  app.addHook('onRequest', async (req) => {
    if (req.user?.id) {
      req.log = req.log.child({ userId: req.user.id });
    }
  });

  // shares the app redis connection; commands fail fast when Redis is
  // down and the limiter then allows requests rather than blocking all
  setupRateLimit(app, app.redis ? new RedisRateLimitStore(app.redis) : new MemoryRateLimitStore());

  const storage = createStorage(config);
  if (storage) {
    app.decorate('storage', storage);
  }

  // auth + user endpoints need the database
  if (config.DATABASE_URL) {
    // config-driven Gem grants (KUR-068): shared by achievements, lessons, tournaments
    const gemService = new GemService(app.db, new WalletService(app.db));
    registerGemRoutes(app, gemService);

    // friend system (KUR-081) + activity feed (KUR-087): needed by producers below
    const friends = new FriendService(app.db);
    const activity = new ActivityService(app.db, friends, app.redis);

    // weekly leagues (KUR-062): lazy cohort join on XP, Sunday-night settle
    const leagues = new LeagueService(app.db, gemService, activity);
    registerLeagueRoutes(app, leagues);
    // every XP gain lazily joins this week's cohort
    const xpService = new XpService(app.db, (uid) => void leagues.onXp(uid).catch((err) => app.log.warn({ err }, 'league join failed')));
    const leagueSettle = setInterval(
      () => void leagues.settleDueWeeks().catch((err) => app.log.warn({ err }, 'league settle failed')),
      60 * 60 * 1000,
    );
    app.addHook('onClose', async () => clearInterval(leagueSettle));

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

    registerAuthRoutes(app, config);
    // optional phone (SMS) verification (KUR-297) — stub sender until a provider
    // is configured; raises trust (#295) and is exported/deleted with the account
    registerPhoneVerificationRoutes(app, new PhoneVerificationService(app.db, { sms: new StubSmsSender() }));
    // shared raw-image body parser for every through-server upload (KUR-177/290)
    registerImageUploadParser(app, mediaLimits(config).maxUploadBytes);
    registerUserRoutes(app, config);
    registerAchievementRoutes(app, gemService, activity);
    registerWalletRoutes(app);

    // friend + social + activity-feed routes
    registerFriendRoutes(app, friends);
    registerSocialRoutes(app, new SocialService(app.db, friends));
    registerActivityRoutes(app, activity);

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
    // unified moderation queue (KUR-102): reports + anti-cheat + auto-flags
    registerModerationQueueRoutes(app, new ModerationQueueService(app.db));
    // behavioral bot detection (KUR-110): scoring + CAPTCHA gating + ledger reversal
    registerAntibotRoutes(app, new BotDetectionService(app.db));
    // community library (KUR-281): stories & poems authoring + browsing;
    // text auto-screened via the AI moderation tier (KUR-285/#293)
    registerLibraryRoutes(app, undefined, aiMod, trust);
    // threaded comments on library posts (KUR-283)
    registerLibraryCommentRoutes(app, undefined, aiMod, trust);
    // community library reporting → unified moderation queue (KUR-285)
    registerLibraryReportRoutes(app);
    // community image & meme sharing (KUR-290): content model + cost-safe
    // through-server upload (KUR-291)
    registerImagePostRoutes(app, config);
    // reactions + threaded comments on image/meme posts (KUR-291), trust-gated
    // and auto-screened like library comments (#293/#295)
    registerImageInteractionRoutes(app, undefined, undefined, aiMod, trust);
    // image/meme reporting → unified moderation queue (KUR-292)
    registerImageReportRoutes(app);
    // user tags & badges (KUR-286): main-tag precedence + claimable tags
    registerTagRoutes(app);
    registerGroupRoutes(app, groups, trust);
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
    registerShopRoutes(app, new ShopService(app.db, new WalletService(app.db), app.cache));
    // Profile cosmetics: equip (server-verified access) + favorites (KUR profile)
    registerCosmeticsRoutes(app, new CosmeticsService(app.db));
    // payment fraud (KUR-073): holds suspicious purchases for admin review
    const fraudService = new FraudService(app.db, new WalletService(app.db));
    registerFraudRoutes(app, fraudService);
    const receiptVerifier = createReceiptVerifier(config);
    if (config.NODE_ENV === 'production' && config.IAP_ALLOW_STUB === 'true') {
      app.log.warn(
        'IAP is using the STUB receipt verifier in production (IAP_ALLOW_STUB=true) — ' +
          'in-app purchases are NOT cryptographically verified. Dev/testing only.',
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
    registerLessonRoutes(app, gemService, xpService);
    registerDailyGoalRoutes(app);
    registerDailyRewardRoutes(app, new DailyRewardService(app.db, new WalletService(app.db)));
    registerReviewRoutes(app);
    registerPracticeRoutes(app, xpService);
    registerWordleRoutes(app, { xp: xpService });
    // Wordle Battle multiplayer (KUR-306) — server-authoritative, poll-safe
    registerWordleBattleRoutes(app, { xp: xpService });
    registerRhymeRoutes(app, { xp: xpService });
    // typing race (solo time trial) over admin-curated texts
    registerRaceRoutes(app, { xp: xpService });
    // Rhyme 1v1 / free-for-all multiplayer (KUR-299) — server-authoritative, poll-safe
    registerRhymeMatchRoutes(app, { xp: xpService });

    // leaderboards (KUR-063): Redis sorted sets, rebuilt from Postgres
    const leaderboards = new LeaderboardService(app.db, app.redis);
    registerLeaderboardRoutes(app, leaderboards);
    const boardRebuild = setInterval(() => {
      void leaderboards.rebuild('rating').catch((err) => app.log.warn({ err }, 'rating board rebuild failed'));
      void leaderboards.rebuild('weekly_xp').catch((err) => app.log.warn({ err }, 'weekly board rebuild failed'));
    }, 5 * 60 * 1000);
    app.addHook('onClose', async () => clearInterval(boardRebuild));

    // quarterly season reset + rewards (KUR-065)
    const seasons = new SeasonService(app.db, new WalletService(app.db));
    registerSeasonRoutes(app, seasons);
    const seasonSweep = setInterval(
      () => void seasons.endDueSeasons().catch((err) => app.log.warn({ err }, 'season settle failed')),
      6 * 60 * 60 * 1000,
    );
    app.addHook('onClose', async () => clearInterval(seasonSweep));
    registerMediaRoutes(app);
    // cost-safe through-server voice-note upload (KUR-282)
    registerVoiceRoutes(app, config);
    registerPlacementRoutes(app);
    registerCourseMapRoutes(app);
    registerDictionaryRoutes(app);

    // admin RBAC + mandatory TOTP 2FA (KUR-099). adminTotp is set whenever a
    // database is configured, which this branch already requires.
    registerAdminRoutes(app, adminTotp!);
    registerGameContentRoutes(app);
    // admin content management: draft→review→publish + optimistic locking (KUR-100)
    registerContentAdminRoutes(app, new ContentAdminService(app.db), adminTotp!);
    // push infrastructure (KUR-094): device token lifecycle + queued delivery,
    // gated by per-category preferences + quiet hours at delivery time (KUR-095)
    const deviceTokens = new DeviceTokenService(app.db);
    const notificationPrefs = new NotificationPrefsService(app.db);
    const pushService = new PushService(deviceTokens, createPushProvider(config), notificationPrefs);
    const inbox = new InboxService(app.db);
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
    registerUserAdminRoutes(app, new UserAdminService(app.db, new WalletService(app.db)), adminTotp!);
    // immutable audit trail: auto-logs every admin mutation + search (KUR-104)
    registerAuditLog(app, new AuditService(app.db), adminTotp!);
    // behavioral event tracking (KUR-105): schema-validated, deduped, day-partitioned
    const droppedEvents = new Counter({
      name: 'analytics_events_dropped_total',
      help: 'Analytics events rejected on ingest, by reason',
      labelNames: ['reason'],
      registers: [metricsRegistry],
    });
    const analytics = new AnalyticsService(app.db, { onDropped: (reason) => droppedEvents.inc({ reason }) });
    registerAnalyticsRoutes(app, analytics);
    // transactional email (KUR-098): bounce/complaint webhook feeds suppression;
    // sends themselves run in the worker's send-email job
    registerEmailWebhookRoutes(
      app,
      new EmailService(app.db, createEmailProvider(config, app.log)),
      config.EMAIL_WEBHOOK_SECRET,
    );

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
    app.register(fastifyWebsocket);
    app.register(async (scoped) => {
      realtime.registerRoutes(scoped);
    });

    // chat moderation (KUR-086): profanity filter + reports + escalation mutes
    const moderation = new ModerationService(app.db);
    registerModerationRoutes(app, moderation);

    // 1:1 direct messages (KUR-083): HTTP send, WS push + receipts
    registerChatRoutes(
      app,
      new ChatService(app.db, friends, { notifyUser: (uid, ev) => realtime.notifyUser(uid, ev as never) }, moderation),
      trust,
      aiMod,
    );

    // group chat (KUR-085): per-group room fan-out over the bus + moderation
    registerGroupChatRoutes(
      app,
      new GroupChatService(
        app.db,
        groups,
        { publish: (r, ev) => realtime.publish(r, ev as never), invite: (r, uid, ttl) => realtime.invite(r, uid, ttl) },
        moderation,
      ),
    );

    // matchmaking (KUR-050): atomic queue + widening sweeper
    const matchQueue = app.redis
      ? new RedisMatchQueue(app.redis, options.matchmaking?.queueKeyPrefix)
      : new MemoryMatchQueue();
    const matchmaking = new MatchmakingService(app.db, matchQueue, kv, realtime, options.matchmaking);
    app.decorate('matchmaking', matchmaking);
    registerMatchmakingRoutes(app, matchmaking);

    // challenge a friend (KUR-088): direct unranked 1v1 invites over the KV + gateway
    registerChallengeRoutes(
      app,
      new ChallengeService(kv, matchmaking, { notifyUser: (uid, ev) => realtime.notifyUser(uid, ev as never) }, friends),
    );
    const sweeper = setInterval(
      () => void matchmaking.sweep().catch((err) => app.log.warn({ err }, 'matchmaking sweep failed')),
      matchmaking.sweepIntervalMs,
    );
    app.addHook('onClose', async () => clearInterval(sweeper));

    // anti-cheat pipeline (KUR-058): accumulate + flag server-measured behaviour
    const antiCheat = new AntiCheatService(app.db);
    const gameXpService = xpService; // shared: game XP also joins the weekly league
    // skill rating (KUR-061): applied atomically on ranked game finish
    const ratingService = new RatingService(app.db);

    // game sessions (KUR-051): the match-making node owns the session
    const engine = new GameEngine(realtime, bus, {
      // per-game RTT metrics for tuning + anomaly flags (KUR-057/058)
      onGameMetrics: (m) => app.log.info({ event: 'game_rtt', ...m }, 'game rtt metrics'),
      onGameEnd: (evidence) => {
        for (const player of evidence.players) {
          void antiCheat.recordGame(evidence.roomId, player).then((verdict) => {
            if (verdict.shadow) app.log.warn({ event: 'cheat_shadow_flag', roomId: evidence.roomId, userId: player.userId, flags: verdict.flags }, 'shadow-flagged for review');
          }).catch((err) => app.log.warn({ err }, 'anti-cheat record failed'));
        }
      },
      // post-game XP, idempotent per (game, player) (KUR-059)
      onReward: (roomId, rewards) => {
        for (const r of rewards) {
          void gameXpService
            .award({ userId: r.userId, source: 'game', amount: r.xp, refId: `${roomId}:${r.userId}` })
            .catch((err) => app.log.warn({ err }, 'game xp award failed'));
        }
      },
      // ranked ELO applied atomically before results publish (KUR-061)
      onRating: (input) => ratingService.apply(input),
      ...options.engine,
    });
    app.decorate('gameEngine', engine);
    matchmaking.onMatch((record) => engine.startSession(record));

    // rematch coordination (KUR-059): same roster, new room on unanimous accept
    const rematch = new RematchService(kv, matchmaking);
    registerGameRoutes(app, engine, rematch);
    app.addHook('onClose', async () => engine.stopAll());

    // private host-controlled rooms (KUR-056)
    const privateRooms = new PrivateRoomService(kv, app.db, matchmaking);
    registerPrivateRoomRoutes(app, privateRooms);

    // skill-rating reads (KUR-061)
    registerRatingRoutes(app, ratingService);

    // tournaments (KUR-060): admin brackets + no-show forfeits
    const tournaments = new TournamentService(app.db, new WalletService(app.db), gemService);
    registerTournamentRoutes(app, tournaments);
    const noShowSweeper = setInterval(
      () => void tournaments.sweepNoShows().catch((err) => app.log.warn({ err }, 'tournament sweep failed')),
      30_000,
    );
    app.addHook('onClose', async () => clearInterval(noShowSweeper));
  }

  app.get('/health', async (_req, reply) => {
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
    /** Present when DATABASE_URL is configured. */
    matchmaking: MatchmakingService;
    /** Present when DATABASE_URL is configured. */
    gameEngine: GameEngine;
  }
  interface FastifyRequest {
    /** Set by the auth middleware (KUR-016) for valid, active sessions. */
    user?: { id: string; roles: string[]; familyId?: string };
    /** Why authentication failed, when a credential was presented. */
    authFailure?: import('./plugins/auth.js').AuthFailure;
  }
}
