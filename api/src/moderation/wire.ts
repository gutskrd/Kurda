import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Counter, type Registry } from 'prom-client';
import type { AppConfig } from '../config/env.js';
import { createEmailProvider } from '../email/provider.js';
import { EmailService } from '../email/service.js';
import { sendEmailJob } from '../jobs/email.js';
import { ModerationAlerts, type ModerationMailer } from './alerts.js';
import { AppealsService } from './appeals-service.js';
import { CasesService } from './cases-service.js';
import { ImageModerationService } from './image-moderation-service.js';
import type { ImageScanner } from './image-scanner.js';
import { pictureScannerFor } from './picture-checker.js';
import { registerPictureRoutes } from './picture-routes.js';
import { PictureReviewService } from './pictures-service.js';
import { runQuarantine } from './quarantine.js';
import { ModerationQueueService } from './queue-service.js';
import { registerModerationQueueRoutes } from './queue-routes.js';
import { registerReportRoutes } from './report-routes.js';
import { ReportsService } from './reports-service.js';
import { SanctionsService } from './sanctions-service.js';

/** Test seams: how many moderators there are, where urgent emails go, and the picture checker (null for none). */
export interface ModerationOptions {
  moderatorCount?: () => Promise<number>;
  mailer?: ModerationMailer;
  imageScanner?: ImageScanner | null;
  /** where the picture checks' call and token counters are kept (observability/metrics.ts) */
  registry?: Registry;
}

export interface ModerationKit {
  reports: ReportsService;
  sanctions: SanctionsService;
  cases: CasesService;
  queue: ModerationQueueService;
  appeals: AppealsService;
  alerts: ModerationAlerts;
  pictures: PictureReviewService;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Every picture upload goes through it (pictures-service.ts); present when DATABASE_URL is configured. */
    pictures: PictureReviewService;
  }
}

/** How often the automated feeds are synced, lapsed approvals expired and missed alerts sent. */
export const MODERATION_SWEEP_MS = 5 * 60 * 1000;
/** When the evidence retention first runs after start (then daily). */
export const RETENTION_FIRST_RUN_MS = 10 * 60 * 1000;

/**
 * Reports, cases, sanctions, appeals and picture checks, wired once. The services share one sanctions service (so the
 * second-approval count is consistent) and one picture checker, the user and admin routes are registered, and two
 * timers run: the five-minute sweep (sync automated feeds, expire unconfirmed bans, send any missed urgent alert,
 * finish quarantine moves and picture publishing, and every ten minutes check again pictures the checker could not
 * reach) and evidence retention (after ten minutes, then daily), which also backfills the banned-address registry and
 * lets refused pictures go after their window.
 *
 * Returns the services so the older per-surface report routes write through the same report service.
 */
export function registerModeration(app: FastifyInstance, config: AppConfig, options: ModerationOptions = {}): ModerationKit {
  const mailer: ModerationMailer = options.mailer ?? {
    send: async (to, vars, locale) => {
      if (app.jobs) {
        await app.jobs.enqueue(sendEmailJob, { to, template: 'moderation-urgent', vars, locale });
      } else {
        await new EmailService(app.db, createEmailProvider(config, app.log)).send(to, 'moderation-urgent', vars, locale);
      }
    },
  };
  const alerts = new ModerationAlerts(app.db, mailer, config.ADMIN_BASE_URL);
  const sanctions = new SanctionsService(app.db, { moderatorCount: options.moderatorCount });
  // What the picture checks cost: every call by its outcome, and its tokens, so the owner can see the spend.
  const registers = options.registry ? [options.registry] : [];
  const checkCalls = new Counter({ name: 'picture_checks_total', help: 'Automatic picture checks by outcome', labelNames: ['outcome'], registers });
  const checkTokens = new Counter({ name: 'picture_check_tokens_total', help: 'Tokens the picture checks used', labelNames: ['kind'], registers });
  // The one picture checker every upload goes through, decided here once (picture-checker.ts).
  const checks = new ImageModerationService(app.db, {
    scanner: pictureScannerFor(config, app.log, options.imageScanner),
    mode: config.IMAGE_REVIEW_MODE,
    dailyLimit: config.IMAGE_SCAN_DAILY_LIMIT,
    perUserDaily: config.IMAGE_SCAN_PER_USER_DAILY,
    // counted in the app's Redis when there is one; commands fail fast when it is down, and Postgres counts instead
    counters: app.hasDecorator('redis') && app.redis ? app.redis : null,
    counterPrefix: config.NODE_ENV === 'test' ? `picture-checks-test-${randomUUID()}` : undefined,
    onCheck: ({ outcome, usage }) => {
      checkCalls.inc({ outcome });
      if (usage) {
        checkTokens.inc({ kind: 'input' }, usage.inputTokens);
        checkTokens.inc({ kind: 'output' }, usage.outputTokens);
        app.log.info({ outcome, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }, 'picture check');
      }
    },
    log: app.log,
  });
  // the bucket is looked up when needed, since a test gives the app its bucket after it is built
  const storage = () => (app.hasDecorator('storage') ? app.storage : undefined);
  const pictures = new PictureReviewService(app.db, {
    checks,
    storage,
    alerts,
    reportThreshold: config.PICTURE_REPORT_HIDE_THRESHOLD,
    log: app.log,
  });
  app.decorate('pictures', pictures);
  const reports = new ReportsService(app.db, {
    onUrgent: async (caseId) => {
      await alerts.caseUrgent(caseId).catch((err) => app.log.warn({ err, caseId }, 'urgent report alert failed; the sweep will retry'));
    },
    onFiled: async (filed) => {
      await pictures.afterReport(filed).catch((err) => app.log.warn({ err, caseId: filed.reportCaseId }, 'checking a reported picture failed'));
    },
  });
  const cases = new CasesService(app.db, sanctions, { storage, log: app.log });
  pictures.useCases(cases);
  const queue = new ModerationQueueService(app.db, { cases, sanctions, log: app.log });
  const appeals = new AppealsService(app.db, sanctions, cases);

  registerReportRoutes(app, config, { reports, sanctions, appeals, pictures });
  registerModerationQueueRoutes(app, { queue, cases, sanctions, appeals });
  registerPictureRoutes(app, { pictures, cases });

  let sweeps = 0;
  const sweep = setInterval(() => {
    void (async () => {
      await queue.sync().catch((err) => app.log.warn({ err }, 'moderation sync failed'));
      await cases.expireApprovals().catch((err) => app.log.warn({ err }, 'expiring unconfirmed bans failed'));
      await alerts.sendMissed().catch((err) => app.log.warn({ err }, 'sending missed urgent alerts failed'));
      await runQuarantine(app.db, storage(), { log: app.log });
      await pictures.sweep().catch((err) => app.log.warn({ err }, 'picture publishing sweep failed'));
      // every other sweep (ten minutes): pictures held only because the checker was down are checked again
      if (sweeps++ % 2 === 1) await pictures.recheckUnavailable().catch((err) => app.log.warn({ err }, 'checking held pictures again failed'));
    })();
  }, MODERATION_SWEEP_MS);
  // The retention sweep runs a few minutes after start as well as daily: a
  // process that restarts or sleeps more often than once a day (a free-tier
  // host idles after minutes) would otherwise never reach its first run.
  const prune = () =>
    void (async () => {
      await queue.pruneEvidence().catch((err) => app.log.warn({ err }, 'evidence retention sweep failed'));
      // refused pictures nobody asked about go once the window to ask and appeal has passed
      await pictures.expireRefused().catch((err) => app.log.warn({ err }, 'refused picture retention sweep failed'));
      // and any permanent ban the registry is missing (the ones carried over from the old columns)
      await sanctions.backfillBanRegistry().catch((err) => app.log.warn({ err }, 'ban registry backfill failed'));
    })();
  const firstPrune = setTimeout(prune, RETENTION_FIRST_RUN_MS);
  const retention = setInterval(prune, 24 * 60 * 60 * 1000);
  app.addHook('onClose', async () => {
    clearInterval(sweep);
    clearTimeout(firstPrune);
    clearInterval(retention);
  });

  return { reports, sanctions, cases, queue, appeals, alerts, pictures };
}
