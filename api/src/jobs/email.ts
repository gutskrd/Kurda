import { z } from 'zod';
import { defineJob, type JobDefinition } from './registry.js';
import type { EmailService } from '../email/service.js';
import type { EmailTemplate, EmailLocale } from '../email/templates.js';

export const SEND_EMAIL_JOB_NAME = 'send-email';

const payloadSchema = z.object({
  to: z.email(),
  template: z.enum([
    'verify-email',
    'verify-email-code',
    'password-reset',
    'password-changed',
    'oauth-no-password',
    'deletion-notice',
  ]),
  vars: z.record(z.string(), z.string()).default({}),
  /** Recipient language; omitted → English (KUR-098). */
  locale: z.enum(['en', 'ku']).optional(),
});

export type SendEmailPayload = z.infer<typeof payloadSchema>;

/**
 * Stub email job — the fallback handler when no database is configured (so the
 * queue still has a valid consumer). Also the definition every enqueue site uses
 * (name + schema); the worker swaps in `makeSendEmailJob` for the real,
 * DB-backed handler when a database is available.
 */
export const sendEmailJob = defineJob({
  name: SEND_EMAIL_JOB_NAME,
  schema: payloadSchema,
  handler: async (payload, ctx) => {
    ctx.log.info(
      { to: payload.to, template: payload.template, locale: payload.locale, attempt: ctx.attempt },
      'email send skipped (no email service configured)',
    );
  },
});

/**
 * The real send job (KUR-098): renders the localized template and sends via the
 * provider, honoring the suppression list. A provider failure throws so BullMQ
 * retries with backoff (the auth flow that enqueued this already returned, so it
 * never blocks on the send).
 */
export function makeSendEmailJob(email: EmailService): JobDefinition<SendEmailPayload> {
  return defineJob({
    name: SEND_EMAIL_JOB_NAME,
    schema: payloadSchema,
    handler: async (payload, ctx) => {
      const result = await email.send(
        payload.to,
        payload.template as EmailTemplate,
        payload.vars,
        (payload.locale ?? 'en') as EmailLocale,
      );
      ctx.log.info(
        { to: payload.to, template: payload.template, ...result },
        result.suppressed ? 'email suppressed' : 'email sent',
      );
    },
  });
}
