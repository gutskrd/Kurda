import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config/env.js';

/**
 * Email delivery providers: a thin seam so templating, suppression and queued retries stay provider-agnostic.
 * `createEmailProvider` picks one from configuration; the stub needs no credentials.
 */

export interface EmailPayload {
  to: string;
  subject: string;
  /** always sent — the fallback for clients that refuse HTML */
  text: string;
  /** sent alongside `text` as multipart when the template defines one */
  html?: string;
  /** who it is from, when not the provider's own address (the support inbox answers as support) */
  from?: string;
  /** where an answer goes, when not the provider's own reply-to */
  replyTo?: string;
  /** Extra headers: `In-Reply-To` and `References`, so an answer threads under the mail it answers. */
  headers?: Record<string, string>;
  /**
   * The same on every retry of one send and on no other, so a provider that honours it sends once however often it
   * is asked. Never an email header; SMTP ignores it.
   */
  idempotencyKey?: string;
}

export interface EmailProvider {
  send(payload: EmailPayload): Promise<{ messageId: string }>;
}

/** In-memory provider that records what it was asked to send. */
export class StubEmailProvider implements EmailProvider {
  readonly sent: EmailPayload[] = [];

  async send(payload: EmailPayload): Promise<{ messageId: string }> {
    this.sent.push(payload);
    return { messageId: `stub-${this.sent.length}` };
  }
}

/**
 * The most sends a second this process starts. The account allows ten requests a second across all its keys; eight
 * leaves room for support answers and for two processes sending at once.
 */
export const RESEND_SENDS_PER_SECOND = 8;
/** How often one send retries inside the call when told "too fast", before the job's own retries take over. */
const TOO_FAST_TRIES = 3;
/** The longest such wait; longer waits are left to the job's retries rather than holding a worker. */
const TOO_FAST_WAIT_MAX_MS = 10_000;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resend over its HTTP API with plain fetch. Needs an API key and a verified sending domain; a non-2xx response
 * throws so the send-email job retries with backoff. Sends take turns a fixed step apart, since the queue can hand
 * them over faster than the account may call, and one still told "too fast" waits as long as the answer says and
 * holds the others back too. The job's idempotency key keeps a repeated send to one email.
 */
export class ResendEmailProvider implements EmailProvider {
  /** when the next send may start */
  private nextTurn = 0;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  /** Waits for this send's turn: one every 1000 / RESEND_SENDS_PER_SECOND ms, in order. */
  private async turn(): Promise<void> {
    const now = Date.now();
    const at = Math.max(now, this.nextTurn);
    this.nextTurn = at + 1000 / RESEND_SENDS_PER_SECOND;
    if (at > now) await wait(at - now);
  }

  async send({ to, subject, text, html, from, replyTo, headers, idempotencyKey }: EmailPayload): Promise<{ messageId: string }> {
    const answerTo = replyTo ?? this.replyTo;
    // `text` always goes too, so a client refusing HTML still gets the message
    const body = JSON.stringify({
      from: from ?? this.from,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(answerTo ? { reply_to: answerTo } : {}),
      ...(headers ? { headers } : {}),
    });
    for (let attempt = 1; ; attempt++) {
      await this.turn();
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body,
      });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        return { messageId: data.id ?? 'resend' };
      }
      const detail = await res.text().catch(() => '');
      // "Too fast" passes in a second; a used-up quota (also a 429) does not, and waiting would only hold a worker.
      const tooFast = res.status === 429 && !/quota/i.test(detail);
      if (!tooFast || attempt >= TOO_FAST_TRIES) throw new Error(`Resend send failed (${res.status}): ${detail}`.trim());
      const asked = Number(res.headers.get('retry-after'));
      const pause = Math.min(TOO_FAST_WAIT_MAX_MS, Number.isFinite(asked) && asked > 0 ? asked * 1000 : 1000);
      // Everything queued behind this send waits too, since retrying at once is what was just refused.
      this.nextTurn = Math.max(this.nextTurn, Date.now() + pause);
    }
  }
}

/**
 * SMTP via nodemailer, configured by a single `SMTP_URL` or by host, port, user and password. A failed send throws
 * so the job retries.
 */
export class SmtpEmailProvider implements EmailProvider {
  private readonly transport: Transporter;

  constructor(
    config: AppConfig,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {
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

  async send({ to, subject, text, html, from, replyTo, headers }: EmailPayload): Promise<{ messageId: string }> {
    const answerTo = replyTo ?? this.replyTo;
    const info = await this.transport.sendMail({
      from: from ?? this.from,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      ...(answerTo ? { replyTo: answerTo } : {}),
      ...(headers ? { headers } : {}),
    });
    return { messageId: info.messageId };
  }
}

/**
 * Picks the provider from configuration: Resend if RESEND_API_KEY is set, else SMTP if SMTP_URL or SMTP_HOST is,
 * else the stub, so an unconfigured deploy still boots and email is never a hard startup dependency.
 */
export function createEmailProvider(
  config: AppConfig,
  log?: { warn: (obj: Record<string, unknown>, msg: string) => void },
): EmailProvider {
  if (config.RESEND_API_KEY) {
    return new ResendEmailProvider(config.RESEND_API_KEY, config.EMAIL_FROM, config.EMAIL_REPLY_TO);
  }
  if (config.SMTP_URL || config.SMTP_HOST) {
    return new SmtpEmailProvider(config, config.EMAIL_FROM, config.EMAIL_REPLY_TO);
  }
  // The stub delivers nothing, which in production strands everyone waiting for a sign-up code or a reset link,
  // so say so loudly.
  if (config.NODE_ENV === 'production') {
    const msg =
      'EMAIL IS NOT CONFIGURED: set RESEND_API_KEY (or SMTP_URL / SMTP_HOST). Verification and password-reset emails will NOT be delivered, so new accounts cannot finish signing up.';
    if (log) log.warn({ provider: 'stub' }, msg);
    else console.warn(msg);
  }
  return new StubEmailProvider();
}
