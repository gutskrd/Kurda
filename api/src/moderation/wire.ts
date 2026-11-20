import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Counter, type Registry } from 'prom-client';
import type { AppConfig } from '../config/env.js';
import { createEmailProvider } from '../email/provider.js';
import { EmailService } from '../email/service.js';
import { sendEmailJob } from '../jobs/email.js';
import { ModerationAlerts, type ModerationMailer } from './alerts.js';
import { AppealsService } from './appeals-service.js';
import { ACCOUNT_CHANGED } from '@kurda/shared';
import { banMailer, type SendEmail } from './ban-email.js';
import { pruneRegistry, rekeyRegistry } from './ban-registry.js';
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
import { closeReturnsOf, PossibleReturnsService, returnsToClose } from './returns.js';
import { SanctionsService } from './sanctions-service.js';
import { purgeDue, settleTakedowns, takedownsToSettle } from './takedown.js';
import { inTransaction } from './tx.js';
import { isTrustedNetwork, registerTrustedNetworkRoutes, TrustedNetworksService } from '../net/trusted-networks.js';

/** Test seams: how many moderators there are, where urgent emails go, and the picture checker (null for none). */
export interface ModerationOptions {
  moderatorCount?: () => Promise<number>;
  mailer?: ModerationMailer;
  imageScanner?: ImageScanner | null;
  /** where the picture checks' call and token counters are kept (observability/metrics.ts) */
  registry?: Registry;
  /** where the emailed statements of reasons go (ban-email.ts) */
  banEmails?: SendEmail;
  /** told of every "account changed" ping as well as the realtime channel */
  accountChanged?: (userId: string) => Promise<void>;
}

export interface ModerationKit {
  reports: ReportsService;
  sanctions: SanctionsService;
  cases: CasesService;
  queue: ModerationQueueService;
  appeals: AppealsService;
  alerts: ModerationAlerts;
  pictures: PictureReviewService;
  returns: PossibleReturnsService;
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Every picture upload goes through it (pictures-service.ts); present when DATABASE_URL is configured. */
    pictures: PictureReviewService;
    /** Checks accounts against banned ones at sign-up and sign-in (returns.ts); present when DATABASE_URL is configured. */
    returns: PossibleReturnsService;
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
  // the bucket is looked up when needed, since a test gives the app its bucket after it is built
  const storage = () => (app.hasDecorator('storage') ? app.storage : undefined);
  const sanctions = new SanctionsService(app.db, {
    moderatorCount: options.moderatorCount,
    storage,
    log: app.log,
    // a restriction given or lifted (a hold among them): the person's open apps read their account again
    accountChanged: async (userId) => {
      await options.accountChanged?.(userId);
      if (app.hasDecorator('realtime')) await app.realtime.notifyUser(userId, { type: ACCOUNT_CHANGED });
    },
    // a banned person leaves the games they are in, as a closed account does (gdpr/service.ts)
    afterBan: async (userId) => {
      if (app.hasDecorator('storyGames')) await app.storyGames.leaveAll(userId);
      if (app.hasDecorator('multiplayer')) await app.multiplayer.leaveAll(userId);
    },
    mailer: banMailer(
      app.db,
      options.banEmails ??
        (async (to, template, vars, locale) => {
          if (app.jobs) await app.jobs.enqueue(sendEmailJob, { to, template, vars, locale });
          else await new EmailService(app.db, createEmailProvider(config, app.log)).send(to, template, vars, locale);
        }),
      config.APP_BASE_URL,
    ),
  });
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
  const cases = new CasesService(app.db, sanctions, { storage, log: app.log, afterRelease: () => pictures.afterRelease() });
  pictures.useCases(cases);
  const queue = new ModerationQueueService(app.db, { cases, sanctions, log: app.log });
  const appeals = new AppealsService(app.db, sanctions, cases);
  const returns = new PossibleReturnsService(app.db, {
    sanctions,
    isTrusted: isTrustedNetwork,
    log: app.log,
    // "Same person" bans the account under the user page's rules (second admin, typed username)
    banner: async (adminId, userId, input) => {
      const out = await cases.sanctionUser(adminId, userId, input, { auditAction: 'linked_ban' });
      return { sanctionIds: out.sanctions.map((s) => s.id), pendingApproval: out.pendingApproval };
    },
  });
  app.decorate('returns', returns);

  registerReportRoutes(app, config, { reports, sanctions, appeals, pictures });
  registerModerationQueueRoutes(app, { queue, cases, sanctions, appeals, returns });
  registerPictureRoutes(app, { pictures, cases });
  registerTrustedNetworkRoutes(app, new TrustedNetworksService(app.db));

  /** Takedowns whose ban was lifted or whose Hide suspension ended come back, one person at a time. */
  const settleEnded = async () => {
    for (const userId of await takedownsToSettle(app.db)) {
      await inTransaction(app.db, async (client) => {
        await sanctions.lockPerson(client, userId);
        await settleTakedowns(client, userId);
      });
    }
    // a suspension that simply ran out ends the holds it caused, as lifting it would
    for (const bannedId of await returnsToClose(app.db)) {
      await inTransaction(app.db, (client) => closeReturnsOf(client, sanctions, bannedId));
    }
  };

  let sweeps = 0;
  const sweep = setInterval(() => {
    void (async () => {
      await queue.sync().catch((err) => app.log.warn({ err }, 'moderation sync failed'));
      await cases.expireApprovals().catch((err) => app.log.warn({ err }, 'expiring unconfirmed bans failed'));
      await alerts.sendMissed().catch((err) => app.log.warn({ err }, 'sending missed urgent alerts failed'));
      // statements of reasons whose first send failed, and content an ended suspension gives back
      await sanctions.sendNoticeEmails().catch((err) => app.log.warn({ err }, 'emailing statements of reasons failed'));
      await settleEnded().catch((err) => app.log.warn({ err }, 'putting back content of ended bans failed'));
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
      // and any ban the registry is missing (the ones carried over from the old columns), rows of ended ones, and
      // rows written under an older key, re-keyed while the person can still be read
      await sanctions.backfillBanRegistry().catch((err) => app.log.warn({ err }, 'ban registry backfill failed'));
      await pruneRegistry(app.db).catch((err) => app.log.warn({ err }, 'ban registry prune failed'));
      await rekeyRegistry(app.db).catch((err) => app.log.warn({ err }, 'ban registry re-key failed'));
      // removals past their appeal window are deleted for good
      await purgeDue(app.db).catch((err) => app.log.warn({ err }, 'deleting removed content past its window failed'));
      // accounts that keep turning up on a banned person's network
      await returns.sweepRepeated().catch((err) => app.log.warn({ err }, 'possible returns sweep failed'));
    })();
  const firstPrune = setTimeout(prune, RETENTION_FIRST_RUN_MS);
  const retention = setInterval(prune, 24 * 60 * 60 * 1000);
  app.addHook('onClose', async () => {
    clearInterval(sweep);
    clearTimeout(firstPrune);
    clearInterval(retention);
  });

  return { reports, sanctions, cases, queue, appeals, alerts, pictures, returns };
}
