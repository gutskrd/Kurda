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
  /** who it is from, when not the provider's own address (the support inbox answers as support) */
  from?: string;
  /** where an answer goes, when not the provider's own reply-to */
  replyTo?: string;
  /** extra headers — `In-Reply-To` and `References`, so an answer threads under the mail it answers */
  headers?: Record<string, string>;
  /**
   * The same on every retry of one send, and on no other: a provider that
   * honours it sends the message once however often it is asked (Resend keeps
   * one for a day). Never an email header; SMTP has no such thing and ignores it.
   */
  idempotencyKey?: string;
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
 * How many sends a second this process starts at most. The account is allowed
 * ten requests a second, shared by everything that uses its keys; eight
 * leaves room for the support desk's answers and for the moments two
 * processes are sending at once.
 */
export const RESEND_SENDS_PER_SECOND = 8;
/** How often one send waits and asks again inside the call when it is told "too fast", before the job's own retries take over. */
const TOO_FAST_TRIES = 3;
/** The longest one such wait is: a provider asking for longer is not having a busy second, and the job's retries wait better than a held worker does. */
const TOO_FAST_WAIT_MAX_MS = 10_000;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Resend (https://resend.com) over its HTTP API — no SDK, just fetch. Needs an
 * API key and a verified sending domain for the From address. A non-2xx
 * response throws so the send-email job retries with backoff.
 *
 * Sends are paced. When many people sign up in the same minute the queue
 * hands over their codes as fast as its workers run, which is faster than
 * the account may ask; unpaced, the surplus is refused and each refusal
 * costs a retry. So sends take turns, a fixed step apart, and one that is
 * still told "too fast" waits as long as the answer says and asks again,
 * holding the others back for that long too. With the job's idempotency key
 * a send asked for twice is still one email.
 */
export class ResendEmailProvider implements EmailProvider {
  /** when the next send may start */
  private nextTurn = 0;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string,
  ) {}

  /** Waits for this send's turn: one every 1000 / RESEND_SENDS_PER_SECOND ms, in the order they asked. */
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
      // "too fast" passes in a second; a used-up allowance (also a 429) does not, and waiting here would only hold a worker
      const tooFast = res.status === 429 && !/quota/i.test(detail);
      if (!tooFast || attempt >= TOO_FAST_TRIES) throw new Error(`Resend send failed (${res.status}): ${detail}`.trim());
      const asked = Number(res.headers.get('retry-after'));
      const pause = Math.min(TOO_FAST_WAIT_MAX_MS, Number.isFinite(asked) && asked > 0 ? asked * 1000 : 1000);
      // everything waiting behind this send waits too: asking again at once is what was just refused
      this.nextTurn = Math.max(this.nextTurn, Date.now() + pause);
    }
  }
}

/**
 * SMTP via nodemailer — works with any SMTP provider (Amazon SES, Postmark,
 * Mailgun, Gmail, …). Configure either a single `SMTP_URL` connection string or
 * discrete host/port/user/pass. A send failure throws so the job retries.
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
    return new ResendEmailProvider(config.RESEND_API_KEY, config.EMAIL_FROM, config.EMAIL_REPLY_TO);
  }
  if (config.SMTP_URL || config.SMTP_HOST) {
    return new SmtpEmailProvider(config, config.EMAIL_FROM, config.EMAIL_REPLY_TO);
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
