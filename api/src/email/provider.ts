import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config/env.js';

/**
 * Email delivery provider (KUR-098). A thin seam over the actual sender so the
 * templating / suppression / queued-retry pipeline stays provider-agnostic.
 * Selection is config-driven (see `createEmailProvider`); the stub keeps dev/test
 * fully exercisable without credentials.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  /** always sent — the fallback for clients that refuse HTML */
  text: string;
  /** sent alongside `text` as multipart when the template defines one */
  html?: string;
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<{ messageId: string }>;
}

/** In-memory provider: records what it was asked to send (dev/test). */
export class StubEmailProvider implements EmailProvider {
  readonly sent: EmailPayload[] = [];

  async send(payload: EmailPayload): Promise<{ messageId: string }> {
    this.sent.push(payload);
    return { messageId: `stub-${this.sent.length}` };
  }
}

/**
 * Resend (https://resend.com) over its HTTP API — no SDK, just fetch. Needs an
 * API key and a verified sending domain for the From address. A non-2xx
 * response throws so the send-email job retries with backoff.
 */
export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send({ to, subject, text, html }: EmailPayload): Promise<{ messageId: string }> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      // `text` always goes too, so a client refusing HTML still gets the message
      body: JSON.stringify({ from: this.from, to, subject, text, ...(html ? { html } : {}) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend send failed (${res.status}): ${detail}`.trim());
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { messageId: data.id ?? 'resend' };
  }
}

/**
 * SMTP via nodemailer — works with any SMTP provider (Amazon SES, Postmark,
 * Mailgun, Gmail, …). Configure either a single `SMTP_URL` connection string or
 * discrete host/port/user/pass. A send failure throws so the job retries.
 */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;

  constructor(config: AppConfig, private readonly from: string) {
    this.transport = config.SMTP_URL
      ? nodemailer.createTransport(config.SMTP_URL)
      : nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: config.SMTP_PORT ?? 587,
          // implicit TLS on 465; STARTTLS on 587/others
          secure: config.SMTP_SECURE === 'true' || config.SMTP_PORT === 465,
          auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' } : undefined,
        });
  }

  async send({ to, subject, text, html }: EmailPayload): Promise<{ messageId: string }> {
    const info = await this.transport.sendMail({ from: this.from, to, subject, text, ...(html ? { html } : {}) });
    return { messageId: info.messageId };
  }
}

/**
 * Picks the delivery provider from configuration, in precedence order:
 * Resend (if RESEND_API_KEY) → SMTP (if SMTP_URL or SMTP_HOST) → stub. The stub
 * means an unconfigured deploy still boots and queues sends (they're logged, not
 * delivered), so email is never a hard startup dependency.
 */
export function createEmailProvider(
  config: AppConfig,
  log?: { warn: (obj: Record<string, unknown>, msg: string) => void },
): EmailProvider {
  if (config.RESEND_API_KEY) {
    return new ResendEmailProvider(config.RESEND_API_KEY, config.EMAIL_FROM);
  }
  if (config.SMTP_URL || config.SMTP_HOST) {
    return new SmtpEmailProvider(config, config.EMAIL_FROM);
  }
  // Nothing configured: the stub records sends in memory and delivers nothing.
  // That is fine in dev/test, but in production it silently strands everyone who
  // needs a verification or password-reset mail — and signup now REQUIRES the
  // emailed code — so make a misconfigured deploy loud rather than mysterious.
  if (config.NODE_ENV === 'production') {
    const msg =
      'EMAIL IS NOT CONFIGURED: set RESEND_API_KEY (or SMTP_URL / SMTP_HOST). Verification and password-reset emails will NOT be delivered, so new accounts cannot finish signing up.';
    if (log) log.warn({ provider: 'stub' }, msg);
    else console.warn(msg);
  }
  return new StubEmailProvider();
}
