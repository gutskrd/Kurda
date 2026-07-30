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

/**
 * Transactional email (KUR-098): render a localized template and hand it to the
 * provider — unless the address is suppressed (a prior bounce/complaint), in
 * which case the send is skipped. Called from the queue worker, so a provider
 * outage retries with backoff and never blocks the auth flow that enqueued it.
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
  ): Promise<SendResult> {
    if (await this.isSuppressed(to)) return { sent: false, suppressed: true };
    const { subject, text } = renderEmail(template, locale, vars);
    const { messageId } = await this.provider.send({ to, subject, text });
    return { sent: true, suppressed: false, messageId };
  }
}
