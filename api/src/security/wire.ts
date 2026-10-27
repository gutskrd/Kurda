import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { createEmailProvider } from '../email/provider.js';
import { EmailService } from '../email/service.js';
import { sendEmailJob } from '../jobs/email.js';
import { SecurityAlerts, type SecurityMailer } from './alerts.js';
import { NO_SECURITY_LOG, SecurityLog, type SecurityRecorder } from './log.js';

/** How often critical alerts not emailed yet are sent (an alert also tries at once, when it is recorded). */
export const SECURITY_SWEEP_MS = 5 * 60 * 1000;
/** When the log's retention first runs after start (then daily), as the moderation evidence's does. */
export const SECURITY_PURGE_FIRST_MS = 12 * 60 * 1000;

/** Test seam: where alert emails go. */
export interface SecurityLogOptions {
  mailer?: SecurityMailer;
}

/**
 * The security log, made once and hung on the app (`app.securityLog`) before
 * any hook or route that records into it is set up: the 2FA gate, the rate
 * limiter, sign-in, the admin routes. Without a database it records nothing.
 *
 * Two timers keep it: the five-minute sweep emails any critical alert that is
 * still unsent (a send failed, or the gap between emails held it back), and
 * the daily retention (first a few minutes after start, as a host that sleeps
 * when idle may never stay up a whole day) drops what is past keeping and
 * forgets old addresses.
 */
export function setupSecurityLog(app: FastifyInstance, config: AppConfig, options: SecurityLogOptions = {}): void {
  if (!config.DATABASE_URL) {
    app.decorate('securityLog', NO_SECURITY_LOG);
    return;
  }
  const mailer: SecurityMailer = options.mailer ?? {
    send: async (to, vars, locale) => {
      if (app.jobs) {
        await app.jobs.enqueue(sendEmailJob, { to, template: 'security-alert', vars, locale });
      } else {
        await new EmailService(app.db, createEmailProvider(config, app.log)).send(to, 'security-alert', vars, locale);
      }
    },
  };
  const alerts = new SecurityAlerts(app.db, mailer, config.ADMIN_BASE_URL);
  const sendAlerts = () => void alerts.sendDue().catch((err) => app.log.warn({ err }, 'security alert email failed; the sweep will retry'));
  const log = new SecurityLog(app.db, {
    secret: config.JWT_SECRET,
    redis: app.hasDecorator('redis') ? app.redis : undefined,
    log: app.log,
    onCritical: sendAlerts,
  });
  app.decorate('securityLog', log);

  const sweep = setInterval(sendAlerts, SECURITY_SWEEP_MS);
  const purge = () =>
    void log
      .purge()
      .then((done) => {
        if (done.deleted > 0 || done.addressesForgotten > 0) app.log.info(done, 'security log retention');
      })
      .catch((err) => app.log.warn({ err }, 'security log retention failed'));
  const firstPurge = setTimeout(purge, SECURITY_PURGE_FIRST_MS);
  const daily = setInterval(purge, 24 * 60 * 60 * 1000);
  app.addHook('onClose', async () => {
    clearInterval(sweep);
    clearTimeout(firstPurge);
    clearInterval(daily);
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    /** The security log (security/log.ts); records nothing without a database. */
    securityLog: SecurityRecorder;
  }
}
