import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { createEmailProvider } from '../email/provider.js';
import { EmailService } from '../email/service.js';
import { sendEmailJob } from '../jobs/email.js';
import { ModerationAlerts, type ModerationMailer } from './alerts.js';
import { AppealsService } from './appeals-service.js';
import { CasesService } from './cases-service.js';
import { ModerationQueueService } from './queue-service.js';
import { registerModerationQueueRoutes } from './queue-routes.js';
import { registerReportRoutes } from './report-routes.js';
import { ReportsService } from './reports-service.js';
import { SanctionsService } from './sanctions-service.js';

/** Test seams: how many moderators there are, and where urgent emails go. */
export interface ModerationOptions {
  moderatorCount?: () => Promise<number>;
  mailer?: ModerationMailer;
}

export interface ModerationKit {
  reports: ReportsService;
  sanctions: SanctionsService;
  cases: CasesService;
  queue: ModerationQueueService;
  appeals: AppealsService;
  alerts: ModerationAlerts;
}

/** How often the automated feeds are synced, lapsed approvals expired and missed alerts sent. */
export const MODERATION_SWEEP_MS = 5 * 60 * 1000;
/** When the evidence retention first runs after start (then daily). */
export const RETENTION_FIRST_RUN_MS = 10 * 60 * 1000;

/**
 * Reports, cases, sanctions and appeals, wired once: the services share one
 * sanctions service (so the second-approval count is the same everywhere), the
 * user and admin routes are registered, and two timers run — the five-minute
 * sweep (sync the automated feeds, expire unconfirmed bans, send any urgent
 * alert that did not go) and the evidence retention (first after ten minutes,
 * then daily).
 *
 * Returns the services, so the older per-surface report routes can write
 * through the same report service.
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
  const reports = new ReportsService(app.db, {
    onUrgent: async (caseId) => {
      await alerts.caseUrgent(caseId).catch((err) => app.log.warn({ err, caseId }, 'urgent report alert failed; the sweep will retry'));
    },
  });
  const cases = new CasesService(app.db, sanctions, { storage: app.storage });
  const queue = new ModerationQueueService(app.db, { cases, sanctions, log: app.log });
  const appeals = new AppealsService(app.db, sanctions, cases);

  registerReportRoutes(app, config, { reports, sanctions, appeals });
  registerModerationQueueRoutes(app, { queue, cases, sanctions, appeals });

  const sweep = setInterval(() => {
    void (async () => {
      await queue.sync().catch((err) => app.log.warn({ err }, 'moderation sync failed'));
      await cases.expireApprovals().catch((err) => app.log.warn({ err }, 'expiring unconfirmed bans failed'));
      await alerts.sendMissed().catch((err) => app.log.warn({ err }, 'sending missed urgent alerts failed'));
    })();
  }, MODERATION_SWEEP_MS);
  // The retention sweep runs a few minutes after start as well as daily: a
  // process that restarts or sleeps more often than once a day (a free-tier
  // host idles after minutes) would otherwise never reach its first run.
  const prune = () => void queue.pruneEvidence().catch((err) => app.log.warn({ err }, 'evidence retention sweep failed'));
  const firstPrune = setTimeout(prune, RETENTION_FIRST_RUN_MS);
  const retention = setInterval(prune, 24 * 60 * 60 * 1000);
  app.addHook('onClose', async () => {
    clearInterval(sweep);
    clearTimeout(firstPrune);
    clearInterval(retention);
  });

  return { reports, sanctions, cases, queue, appeals, alerts };
}
