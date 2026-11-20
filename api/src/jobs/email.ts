import { z } from 'zod';
import { defineJob, type JobDefinition } from './registry.js';
import type { EmailService } from '../email/service.js';
import { maskEmail } from '../observability/redact.js';
import { EMAIL_PATTERN } from '../auth/email-address.js';
import type { EmailTemplate, EmailLocale } from '../email/templates.js';

export const SEND_EMAIL_JOB_NAME = 'send-email';

/**
 * An email is tried eight times with waits doubling from two seconds, a little over four minutes in all. The queue's
 * default tries end within seconds, shorter than a rush of sign-ups during which the provider answers "too fast".
 */
export const SEND_EMAIL_RETRY = { attempts: 8, backoffDelayMs: 2_000 } as const;

const payloadSchema = z.object({
  // the same pattern the forms accept, or an address we let sign up gets no mail
  to: z.email({ pattern: EMAIL_PATTERN }),
  template: z.enum([
    'verify-email',
    'verify-email-code',
    'password-reset',
    'password-changed',
    'username-changed',
    'oauth-no-password',
    'deletion-notice',
    'moderation-urgent',
    'copyright-received',
    'copyright-removed',
    'copyright-upheld',
    'copyright-kept',
    'copyright-counter-notice',
    'new-sign-in',
    'sign-in-attempts',
    'security-alert',
    'account-suspended',
    'account-closed',
  ]),
  vars: z.record(z.string(), z.string()).default({}),
  /** Recipient language; English when omitted. */
  locale: z.enum(['en', 'ku']).optional(),
});

export type SendEmailPayload = z.infer<typeof payloadSchema>;

/**
 * The stub email job: the consumer when no database is configured, and the definition (name and schema) every
 * enqueue uses. With a database the worker registers `makeSendEmailJob` instead.
 */
export const sendEmailJob = defineJob({
  name: SEND_EMAIL_JOB_NAME,
  schema: payloadSchema,
  retry: SEND_EMAIL_RETRY,
  handler: async (payload, ctx) => {
    ctx.log.info(
      { to: maskEmail(payload.to), template: payload.template, locale: payload.locale, attempt: ctx.attempt },
      'email send skipped (no email service configured)',
    );
  },
});

/**
 * The real send job: renders the localized template and sends it through the provider, honouring the suppression
 * list. A provider failure throws so the queue retries with backoff; the enqueuing auth flow has already returned.
 */
export function makeSendEmailJob(email: EmailService): JobDefinition<SendEmailPayload> {
  return defineJob({
    name: SEND_EMAIL_JOB_NAME,
    schema: payloadSchema,
    retry: SEND_EMAIL_RETRY,
    handler: async (payload, ctx) => {
      // With the job's key, a retry after a send whose answer was lost is answered as the first by the provider instead of
      // sending a second email.
      const result = await email.send(
        payload.to,
        payload.template as EmailTemplate,
        payload.vars,
        (payload.locale ?? 'en') as EmailLocale,
        ctx.key ? { idempotencyKey: `${SEND_EMAIL_JOB_NAME}/${ctx.key}` } : {},
      );
      ctx.log.info(
        { to: maskEmail(payload.to), template: payload.template, ...result },
        result.suppressed ? 'email suppressed' : 'email sent',
      );
    },
  });
}
