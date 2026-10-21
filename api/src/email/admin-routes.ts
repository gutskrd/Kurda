import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { AppConfig } from '../config/env.js';
import { SEND_EMAIL_JOB_NAME } from '../jobs/email.js';
import type { EmailProvider } from './provider.js';
import type { SupportInbox } from './support-inbox.js';

/** Who sees how email is set up, and may send the test: the people who run the place. */
export const EMAIL_ADMINS = ['superadmin', 'admin'] as const;
/** Who reads and answers the support inbox: those, and support. */
export const SUPPORT_READERS = ['superadmin', 'admin', 'support'] as const;

/** How far back the panel looks for emails that could not be sent. */
const FAILURE_WINDOW_MS = 7 * 24 * 3_600_000;

/** The address part of "Name <address>". */
const addressOf = (from: string): string => /<([^<>]+)>/.exec(from)?.[1] ?? from.trim();

const listQuery = z.object({
  archived: z.enum(['true', 'false']).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const idParams = z.object({ id: z.uuid() });
const replyBody = z.object({ body: z.string().trim().min(1).max(20_000) });
const flagBody = z.object({ value: z.boolean() });
/** Opening a mail needs nothing but its id. */
const noBody = z.object({}).nullish();

/**
 * Email in the admin panel: how it is set up and whether it is getting out,
 * a test send to yourself, and the support inbox.
 *
 * The status exists because sending broke without anyone seeing it: the
 * sending domain moved to hevalo.app while the API key could only send for
 * the old one, and every verification and reset email was refused for days,
 * visible only in the server's logs. Now the panel says what the From is,
 * which provider sends it, and how many sends failed this week and why.
 */
export function registerEmailAdminRoutes(
  app: FastifyInstance,
  deps: { config: AppConfig; provider: EmailProvider; inbox: SupportInbox },
): void {
  const { config, provider, inbox } = deps;
  const admins = requireRoles(...EMAIL_ADMINS);
  const readers = requireRoles(...SUPPORT_READERS);

  app.get('/admin/email/status', { config: { skipValidation: true }, preHandler: admins }, async () => {
    let failures: { count: number; lastError: string | null; lastAt: string | null } | null = null;
    if (app.jobs) {
      // the queue keeps a send that ran out of retries (its dead-letter set); a week of them, newest first
      const failed = await app.jobs.raw.getFailed(0, 499);
      const since = Date.now() - FAILURE_WINDOW_MS;
      const sends = failed
        .filter((job) => job.name === SEND_EMAIL_JOB_NAME && (job.finishedOn ?? 0) >= since)
        .sort((a, b) => (b.finishedOn ?? 0) - (a.finishedOn ?? 0));
      const last = sends[0];
      failures = {
        count: sends.length,
        lastError: last?.failedReason ?? null,
        lastAt: last?.finishedOn ? new Date(last.finishedOn).toISOString() : null,
      };
    }
    return {
      provider: config.RESEND_API_KEY ? 'resend' : config.SMTP_URL || config.SMTP_HOST ? 'smtp' : 'none',
      from: config.EMAIL_FROM,
      replyTo: config.EMAIL_REPLY_TO || null,
      supportFrom: config.SUPPORT_EMAIL_FROM,
      inbox: {
        webhook: Boolean(config.RESEND_WEBHOOK_SECRET),
        canReadBodies: inbox.canReadBodies,
        unread: await inbox.unread(),
      },
      failures,
    };
  });

  /**
   * Send a test email to yourself — the address on your own account, never
   * one typed in, so this cannot be used to send mail to anybody. Sent at
   * once rather than queued, so the answer is what the provider said.
   */
  app.post(
    '/admin/email/test',
    { config: { skipValidation: true, rateLimit: { max: 5, windowMs: 10 * 60_000 } }, preHandler: admins },
    async (req) => {
      const { rows } = await app.db.query<{ email: string | null }>(`SELECT email FROM users WHERE id = $1`, [req.user!.id]);
      const to = rows[0]?.email;
      if (!to) throw new AppError('NO_EMAIL', 409, 'your account has no email address to send the test to');
      if (!config.RESEND_API_KEY && !config.SMTP_URL && !config.SMTP_HOST) {
        throw new AppError('EMAIL_NOT_CONFIGURED', 409, 'no email provider is set up: set RESEND_API_KEY (or SMTP_URL / SMTP_HOST)');
      }
      try {
        const { messageId } = await provider.send({
          to,
          subject: 'Hevalo: test email',
          text: `This is a test from the Hevalo admin panel.\n\nIf you are reading it, email from ${addressOf(config.EMAIL_FROM)} is getting through.${
            config.EMAIL_REPLY_TO ? `\nAnswers to it go to ${config.EMAIL_REPLY_TO}.` : ''
          }\n\n— Hevalo`,
        });
        return { sent: true, to, messageId };
      } catch (err) {
        throw new AppError('EMAIL_NOT_SENT', 502, err instanceof Error ? err.message : String(err));
      }
    },
  );

  app.get('/admin/support/emails', { schema: { querystring: listQuery }, preHandler: readers }, async (req) => {
    const q = req.query as z.infer<typeof listQuery>;
    return inbox.list({ archived: q.archived === 'true', limit: q.limit, before: q.before });
  });

  /** Opening a mail marks it read. A POST, because it changes something — and is audited as a read of support mail. */
  app.post('/admin/support/emails/:id/open', { schema: { params: idParams, body: noBody }, preHandler: readers }, async (req) =>
    inbox.open((req.params as z.infer<typeof idParams>).id),
  );

  app.post('/admin/support/emails/:id/read', { schema: { params: idParams, body: flagBody }, preHandler: readers }, async (req) => {
    await inbox.setRead((req.params as z.infer<typeof idParams>).id, (req.body as z.infer<typeof flagBody>).value);
    return { ok: true };
  });

  app.post('/admin/support/emails/:id/archive', { schema: { params: idParams, body: flagBody }, preHandler: readers }, async (req) => {
    await inbox.setArchived((req.params as z.infer<typeof idParams>).id, (req.body as z.infer<typeof flagBody>).value);
    return { ok: true };
  });

  app.post(
    '/admin/support/emails/:id/reply',
    {
      schema: { params: idParams, body: replyBody },
      config: { rateLimit: { max: 60, windowMs: 60 * 60_000 } },
      preHandler: readers,
    },
    async (req) =>
      inbox.reply((req.params as z.infer<typeof idParams>).id, req.user!.id, (req.body as z.infer<typeof replyBody>).body),
  );
}
