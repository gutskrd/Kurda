import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env.js';
import { createEmailProvider } from '../email/provider.js';
import { EmailService } from '../email/service.js';
import { sendEmailJob } from '../jobs/email.js';
import { MODERATION_SWEEP_MS } from '../moderation/wire.js';
import { providerPlaceholderWarnings } from './provider-check.js';
import { registerCopyrightRoutes } from './routes.js';
import { CopyrightService, type CopyrightMailer } from './service.js';

/** Test seam: where copyright emails go. */
export interface CopyrightWireOptions {
  mailer?: CopyrightMailer;
}

/**
 * Copyright notices, wired once: the routes, and the sweep that emails each
 * notifier the decision on their notice (as often as the moderation sweep).
 * Email goes through the job queue when there is one, like every other
 * transactional email, and straight to the provider when there is not.
 */
export function registerCopyright(app: FastifyInstance, config: AppConfig, options: CopyrightWireOptions = {}): CopyrightService {
  const mailer: CopyrightMailer = options.mailer ?? {
    send: async (to, template, vars, locale) => {
      if (app.jobs) await app.jobs.enqueue(sendEmailJob, { to, template, vars, locale });
      else await new EmailService(app.db, createEmailProvider(config, app.log)).send(to, template, vars, locale);
    },
  };
  // said on every boot until it is fixed: these addresses go to real rights holders
  for (const warning of providerPlaceholderWarnings(config.NODE_ENV)) app.log.error(warning);
  const copyright = new CopyrightService(app.db, { mailer, webBaseUrl: config.APP_BASE_URL, log: app.log });
  registerCopyrightRoutes(app, copyright);

  const sweep = setInterval(() => {
    void copyright.sendOutcomes().catch((err) => app.log.warn({ err }, 'sending copyright outcomes failed'));
  }, MODERATION_SWEEP_MS);
  app.addHook('onClose', async () => clearInterval(sweep));
  return copyright;
}
