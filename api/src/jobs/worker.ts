import { Worker } from 'bullmq';
import type pino from 'pino';
import type { AppConfig } from '../config/env.js';
import { createPool } from '../db/pool.js';
import { GdprService } from '../gdpr/service.js';
import { createRedis } from '../cache/redis.js';
import { standaloneStoryGames } from '../story-games/standalone.js';
import { MediaService } from '../media/service.js';
import { createStorage } from '../media/storage.js';
import { makeCleanupOrphansJob } from './cleanup-orphans.js';
import { makeAnonymizeJob, makeExportJob } from './gdpr-jobs.js';
import { makePushSendJob } from './push-jobs.js';
import { PushService } from '../push/service.js';
import { DeviceTokenService } from '../push/tokens-service.js';
import { createPushProvider } from '../push/provider.js';
import { NotificationPrefsService } from '../notifications/prefs-service.js';
import { InboxService } from '../notifications/inbox-service.js';
import { sendEmailJob, makeSendEmailJob } from './email.js';
import { EmailService } from '../email/service.js';
import { createEmailProvider } from '../email/provider.js';
import { DashboardService } from '../analytics/dashboard-service.js';
import { EconomyService } from '../economy/service.js';
import { makeAnalyticsRollupJob, makeEconomyRollupJob } from './rollup-jobs.js';
import { JobQueue, QUEUE_NAME, createQueueConnection } from './queue.js';
import { makeLeagueMergeJob, makeLeagueSettleJob } from './league-jobs.js';
import { createProgression } from '../badges/progression.js';
import { badgeNotices, makeBadgePushJob, makeBadgeRarityJob } from './badge-jobs.js';
import { RedisRoomPublisher } from '../realtime/bus.js';
import { GemService } from '../gems/service.js';
import { WalletService } from '../wallet/service.js';
import { ActivityService } from '../activity/service.js';
import { FriendService } from '../friends/service.js';
import { progressNotices } from '../notifications/progress-notices.js';
import { JobRegistry } from './registry.js';

export function buildRegistry(config?: AppConfig, log?: pino.Logger): JobRegistry {
  const registry = new JobRegistry();
  if (config?.DATABASE_URL) {
    const pool = createPool(config);
    // real, suppression-aware email sender (KUR-098); stub only without a DB
    registry.register(makeSendEmailJob(new EmailService(pool, createEmailProvider(config))));
    const storage = createStorage(config);
    if (storage) {
      registry.register(makeCleanupOrphansJob(new MediaService(pool, storage)));
    }
    // A closing account leaves its story games, which can finish one for the
    // others: paid as the API pays them, and the API instances told over
    // Redis, so their players' screens move on at once.
    const storyGames = standaloneStoryGames(pool, { redis: config.REDIS_URL ? createRedis(config) : null, log });
    const gdpr = new GdprService(pool, { storage, storyGames, log });
    registry.register(makeAnonymizeJob(gdpr));
    if (storage) {
      registry.register(makeExportJob(gdpr));
    }
    // queued push fan-out (KUR-094) gated by preferences at delivery time (KUR-095)
    const push = new PushService(
      new DeviceTokenService(pool),
      createPushProvider(config),
      new NotificationPrefsService(pool),
    );
    registry.register(makePushSendJob(push, new InboxService(pool)));
    // the league week (Monday's settle, Wednesday's merge) and the badges'
    // nightly rarity and daily push. Promotion news goes back through the
    // queue as ordinary pushes; a badge a settle unlocks is celebrated on the
    // API instances, told over the room bus
    const redis = config.REDIS_URL ? createRedis(config) : undefined;
    const queue = config.REDIS_URL ? JobQueue.create(config) : null;
    const inbox = new InboxService(pool);
    const bus = redis ? new RedisRoomPublisher(redis) : null;
    const { leagues, badges } = createProgression(pool, {
      gems: new GemService(pool, new WalletService(pool)),
      activity: new ActivityService(pool, new FriendService(pool), redis),
      notices: progressNotices({ inbox, push, jobs: queue }),
      badgeNotices: (badgeService) =>
        badgeNotices({
          inbox,
          realtime: async (userId, event) => {
            await bus?.publish(`user:${userId}`, event);
          },
          badges: badgeService,
          push,
          jobs: queue,
        }),
      weeklyGoalXp: config.LEAGUE_WEEKLY_GOAL_XP,
      log,
    });
    registry.register(makeLeagueSettleJob(leagues));
    registry.register(makeLeagueMergeJob(leagues));
    registry.register(makeBadgeRarityJob(badges));
    registry.register(makeBadgePushJob(badges, push));
    // the dashboards read pre-aggregated tables; without these they stay empty
    registry.register(makeAnalyticsRollupJob(new DashboardService(pool)));
    registry.register(makeEconomyRollupJob(new EconomyService(pool)));
  } else {
    registry.register(sendEmailJob);
  }
  return registry;
}

export function createWorker(
  config: AppConfig,
  log: pino.Logger,
  registry: JobRegistry = buildRegistry(config, log),
): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const def = registry.get(job.name);
      if (!def) {
        // unknown job names are permanent failures — retrying can't help
        throw new Error(`no handler registered for job "${job.name}"`);
      }
      const parsed = def.schema.safeParse(job.data);
      if (!parsed.success) {
        throw new Error(`payload for "${job.name}" failed schema validation`);
      }
      await def.handler(parsed.data, {
        log: log.child({ jobId: job.id, jobName: job.name }),
        attempt: job.attemptsMade + 1,
      });
    },
    {
      connection: createQueueConnection(config),
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    if (!job) return;
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    if (exhausted) {
      // ALERT: job is now in the DLQ (BullMQ failed set) and will not retry
      log.error(
        { jobId: job.id, jobName: job.name, attempts: job.attemptsMade, err: err.message },
        'job exhausted retries — moved to DLQ',
      );
    } else {
      log.warn(
        { jobId: job.id, jobName: job.name, attempt: job.attemptsMade, err: err.message },
        'job failed; will retry with backoff',
      );
    }
  });

  return worker;
}
