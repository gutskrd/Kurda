import type pg from 'pg';
import { renderEmail, type EmailLocale, type EmailTemplate } from './templates.js';
import type { EmailProvider } from './provider.js';

export type SuppressionReason = 'bounce' | 'complaint' | 'manual';

export interface SendResult {
  sent: boolean;
  /** true when the address is on the suppression list. */
  suppressed: boolean;
  messageId?: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The domain of the stand-in address given to a provider-made account whose provider confirmed none. */
export const PLACEHOLDER_EMAIL_DOMAIN = 'noemail.kurda.app';

/** An address that stands in for "none": never written to. */
export function isPlaceholderAddress(email: string): boolean {
  return email.trim().toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

/**
 * Transactional email: renders a localized template and hands it to the provider, unless the address is suppressed
 * after a bounce or complaint. Called from the queue worker, so a provider outage retries with backoff and never
 * blocks the auth flow that enqueued it.
 */
export class EmailService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly provider: EmailProvider,
  ) {}

  async isSuppressed(email: string): Promise<boolean> {
    const res = await this.pool.query(`SELECT 1 FROM email_suppressions WHERE email = $1`, [normalizeEmail(email)]);
    return (res.rowCount ?? 0) > 0;
  }

  /** Add an address to the suppression list (idempotent). */
  async suppress(email: string, reason: SuppressionReason): Promise<void> {
    await this.pool.query(
      `INSERT INTO email_suppressions (email, reason) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET reason = EXCLUDED.reason`,
      [normalizeEmail(email), reason],
    );
  }

  /** Render + send, honoring the suppression list. */
  async send(
    to: string,
    template: EmailTemplate,
    vars: Record<string, string> = {},
    locale: EmailLocale = 'en',
    opts: { idempotencyKey?: string } = {},
  ): Promise<SendResult> {
    // The stand-in address of a provider-made account (auth/oauth.ts) is nobody's mailbox, so nothing is sent.
    if (isPlaceholderAddress(to)) return { sent: false, suppressed: true };
    if (await this.isSuppressed(to)) return { sent: false, suppressed: true };
    const { subject, text, html } = renderEmail(template, locale, vars);
    const { messageId } = await this.provider.send({ to, subject, text, html, ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}) });
    return { sent: true, suppressed: false, messageId };
  }
}
