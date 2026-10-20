import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import type { EmailProvider } from './provider.js';

/** A file that came with a support email: what it is, never its bytes (those stay in Resend). */
export interface SupportAttachment {
  id: string | null;
  filename: string | null;
  contentType: string | null;
  size: number | null;
}

/** One mail in the support inbox, as the list shows it. */
export interface SupportEmailSummary {
  id: string;
  from: { address: string; name: string | null };
  to: string[];
  subject: string;
  /** the start of the text, for the list; null until the body has been read */
  preview: string | null;
  receivedAt: string;
  readAt: string | null;
  archivedAt: string | null;
  replies: number;
  attachments: number;
}

/** One mail, whole: the list's row, its body, its files and what was answered. */
export interface SupportEmail extends SupportEmailSummary {
  cc: string[];
  text: string | null;
  html: string | null;
  attachmentList: SupportAttachment[];
  /** false while the body has not been read from Resend (no key that may, or Resend was down) */
  bodyAvailable: boolean;
  answers: Array<{ id: string; body: string; sentAt: string; admin: { id: string; username: string } | null }>;
}

/** What the webhook knows about a received mail. */
export interface ReceivedMail {
  providerId: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  messageId: string | null;
  attachments: SupportAttachment[];
  receivedAt: string;
}

/** A received mail's body, as Resend gives it. */
export interface ReceivedBody {
  text: string | null;
  html: string | null;
  messageId: string | null;
}

/** Reads a received mail's body from Resend. */
export interface ReceivedMailReader {
  read(providerId: string): Promise<ReceivedBody>;
}

/** The longest body kept. A support mail is a few paragraphs; a megabyte of HTML is not one. */
const BODY_MAX = 200_000;

/**
 * "Rojda Kurd <rojda@example.com>" → its address and its name; a bare address
 * has no name. What does not look like either is kept whole as the address, so
 * nothing that arrived is lost.
 */
export function parseMailbox(raw: string): { address: string; name: string | null } {
  const trimmed = raw.trim();
  const angled = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(trimmed);
  if (angled) {
    const name = angled[1]!.trim().replace(/^"(.*)"$/, '$1').trim();
    return { address: angled[2]!.toLowerCase(), name: name || null };
  }
  return { address: trimmed.toLowerCase(), name: null };
}

/**
 * The text of an HTML body, for the list's preview when a mail came with no plain text.
 *
 * Anyone can send the support address a mail, and this runs on every mail each
 * time the inbox is listed, so it has to take time in proportion to the mail's
 * length whatever the mail contains. The regular expressions it used before
 * did not: a body of nothing but `<style>` repeated, with no closing tag, made
 * each one scan to the end of the body again, and 200 KB of it held the server
 * for seconds per mail. Each pattern here stops at the next `<` or `>`, and a
 * block with no end is looked for once.
 */
export function htmlToPreviewText(html: string): string {
  return dropHiddenBlocks(html)
    .replace(/<[^<>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `<script>`, `<style>` and `<head>` with what is inside them: nothing a reader sees. */
function dropHiddenBlocks(html: string): string {
  const lower = html.toLowerCase();
  const open = /<(script|style|head)\b[^<>]*>/gi;
  const unclosed = new Set<string>();
  let out = '';
  let from = 0;
  for (let m = open.exec(html); m; m = open.exec(html)) {
    const name = m[1]!.toLowerCase();
    if (unclosed.has(name)) continue;
    const close = lower.indexOf(`</${name}`, open.lastIndex);
    if (close === -1) {
      // no end anywhere after this one, so none after any later one either
      unclosed.add(name);
      continue;
    }
    const end = lower.indexOf('>', close);
    out += `${html.slice(from, m.index)} `;
    from = end === -1 ? html.length : end + 1;
    open.lastIndex = from;
  }
  return out + html.slice(from);
}

/**
 * Resend's received-mail API (`GET /emails/receiving/:id`). The key must be
 * one that may read received mail — a full-access key; a send-only key is
 * refused, and the refusal says so rather than a bare 403.
 */
export class ResendMailReader implements ReceivedMailReader {
  constructor(private readonly apiKey: string) {}

  async read(providerId: string): Promise<ReceivedBody> {
    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(providerId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) {
      throw new AppError('INBOX_KEY_REFUSED', 502, 'the Resend key for the support inbox may not read received mail (it needs full access)');
    }
    if (!res.ok) throw new AppError('INBOX_UNREACHABLE', 502, `Resend answered ${res.status} for a received email`);
    const data = (await res.json().catch(() => ({}))) as { text?: unknown; html?: unknown; message_id?: unknown };
    const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v.slice(0, BODY_MAX) : null);
    return { text: str(data.text), html: str(data.html), messageId: str(data.message_id) };
  }
}

interface Row {
  id: string;
  from_address: string;
  from_name: string | null;
  to_addresses: string[];
  cc_addresses: string[];
  subject: string;
  message_id: string | null;
  text_body: string | null;
  html_body: string | null;
  attachments: SupportAttachment[];
  body_fetched_at: Date | null;
  received_at: Date;
  read_at: Date | null;
  archived_at: Date | null;
  replies: number;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

function preview(row: Pick<Row, 'text_body' | 'html_body'>): string | null {
  const text = row.text_body ?? (row.html_body ? htmlToPreviewText(row.html_body) : null);
  return text === null ? null : text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function summary(row: Row): SupportEmailSummary {
  return {
    id: row.id,
    from: { address: row.from_address, name: row.from_name },
    to: row.to_addresses,
    subject: row.subject,
    preview: preview(row),
    receivedAt: row.received_at.toISOString(),
    readAt: iso(row.read_at),
    archivedAt: iso(row.archived_at),
    replies: Number(row.replies),
    attachments: row.attachments.length,
  };
}

/** "Re: " once, however many times the conversation has gone back and forth. */
export function replySubject(subject: string): string {
  const bare = subject.trim();
  return /^re:/i.test(bare) ? bare : `Re: ${bare || '(no subject)'}`;
}

/**
 * The support inbox: mail received at the support address, kept so admins can
 * read it in the panel and answer it from there.
 *
 * The body is read from Resend once and kept — opening a mail should not need
 * Resend to be up, and reading it again would cost a call every time. An
 * answer goes out from the support address, threaded under the mail it answers
 * (In-Reply-To / References), with the mail it answers quoted under it.
 */
export class SupportInbox {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: { reader: ReceivedMailReader | null; provider: EmailProvider; from: string },
  ) {}

  /** Whether bodies can be read (a key that may read received mail is set). */
  get canReadBodies(): boolean {
    return this.deps.reader !== null;
  }

  /** Keep a received mail. Its id, or null when it was already kept (a webhook delivered twice). */
  async record(mail: ReceivedMail): Promise<string | null> {
    const from = parseMailbox(mail.from);
    const { rows } = await this.pool.query<{ id: string }>(
      `INSERT INTO support_emails
         (provider_id, from_address, from_name, to_addresses, cc_addresses, subject, message_id, attachments, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (provider_id) DO NOTHING
       RETURNING id`,
      [
        mail.providerId,
        from.address,
        from.name,
        mail.to.map((t) => parseMailbox(t).address),
        mail.cc.map((c) => parseMailbox(c).address),
        mail.subject.slice(0, 1000),
        mail.messageId,
        JSON.stringify(mail.attachments),
        mail.receivedAt,
      ],
    );
    return rows[0]?.id ?? null;
  }

  /** Read a kept mail's body from Resend, once. False when there is no key that may. */
  async fetchBody(id: string): Promise<boolean> {
    if (!this.deps.reader) return false;
    const { rows } = await this.pool.query<{ provider_id: string; body_fetched_at: Date | null }>(
      `SELECT provider_id, body_fetched_at FROM support_emails WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, 'no such email');
    if (row.body_fetched_at) return true;
    const body = await this.deps.reader.read(row.provider_id);
    await this.pool.query(
      `UPDATE support_emails
          SET text_body = $2, html_body = $3, message_id = COALESCE(message_id, $4), body_fetched_at = now()
        WHERE id = $1`,
      [id, body.text, body.html, body.messageId],
    );
    return true;
  }

  /** The inbox, newest first: what is open, or what was archived. */
  async list(opts: { archived: boolean; limit: number; before?: string }): Promise<{ emails: SupportEmailSummary[]; unread: number }> {
    const { rows } = await this.pool.query<Row>(
      `SELECT e.*, (SELECT count(*) FROM support_email_replies r WHERE r.email_id = e.id) AS replies
         FROM support_emails e
        WHERE (e.archived_at IS NOT NULL) = $1
          AND ($2::timestamptz IS NULL OR e.received_at < $2)
        ORDER BY e.received_at DESC
        LIMIT $3`,
      [opts.archived, opts.before ?? null, opts.limit],
    );
    return { emails: rows.map(summary), unread: await this.unread() };
  }

  /** How many open mails nobody has read yet. */
  async unread(): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM support_emails WHERE archived_at IS NULL AND read_at IS NULL`,
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** One mail, whole — reading its body from Resend first if that has not happened yet. Opening it marks it read. */
  async open(id: string): Promise<SupportEmail> {
    // a body that could not be read before may be readable now; a failure here still shows the mail
    await this.fetchBody(id).catch(() => false);
    const { rows } = await this.pool.query<Row>(
      `UPDATE support_emails SET read_at = COALESCE(read_at, now()) WHERE id = $1
       RETURNING *, (SELECT count(*) FROM support_email_replies r WHERE r.email_id = support_emails.id) AS replies`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new AppError('NOT_FOUND', 404, 'no such email');
    const answers = await this.pool.query<{ id: string; body: string; sent_at: Date; admin_id: string | null; username: string | null }>(
      `SELECT r.id, r.body, r.sent_at, r.admin_id, u.username
         FROM support_email_replies r LEFT JOIN users u ON u.id = r.admin_id
        WHERE r.email_id = $1 ORDER BY r.sent_at`,
      [id],
    );
    return {
      ...summary(row),
      cc: row.cc_addresses,
      text: row.text_body,
      html: row.html_body,
      attachmentList: row.attachments,
      bodyAvailable: row.body_fetched_at !== null,
      answers: answers.rows.map((a) => ({
        id: a.id,
        body: a.body,
        sentAt: a.sent_at.toISOString(),
        admin: a.admin_id && a.username ? { id: a.admin_id, username: a.username } : null,
      })),
    };
  }

  /** Mark read or unread. */
  async setRead(id: string, read: boolean): Promise<void> {
    const res = await this.pool.query(`UPDATE support_emails SET read_at = CASE WHEN $2 THEN COALESCE(read_at, now()) END WHERE id = $1`, [
      id,
      read,
    ]);
    if (res.rowCount === 0) throw new AppError('NOT_FOUND', 404, 'no such email');
  }

  /** Archive (done with it) or bring back to the inbox. */
  async setArchived(id: string, archived: boolean): Promise<void> {
    const res = await this.pool.query(
      `UPDATE support_emails SET archived_at = CASE WHEN $2 THEN COALESCE(archived_at, now()) END WHERE id = $1`,
      [id, archived],
    );
    if (res.rowCount === 0) throw new AppError('NOT_FOUND', 404, 'no such email');
  }

  /**
   * Answer a mail from the support address. Sent at once, not queued: the
   * admin is waiting to hear whether it went, and a failure says why.
   */
  async reply(id: string, adminId: string, body: string): Promise<{ id: string; sentAt: string }> {
    const { rows } = await this.pool.query<Row>(`SELECT *, 0 AS replies FROM support_emails WHERE id = $1`, [id]);
    const mail = rows[0];
    if (!mail) throw new AppError('NOT_FOUND', 404, 'no such email');
    const quoted = (mail.text_body ?? (mail.html_body ? htmlToPreviewText(mail.html_body) : ''))
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const when = mail.received_at.toUTCString();
    const who = mail.from_name ? `${mail.from_name} <${mail.from_address}>` : mail.from_address;
    const text = quoted ? `${body}\n\nOn ${when}, ${who} wrote:\n${quoted}` : body;
    const threadId = mail.message_id ? (mail.message_id.startsWith('<') ? mail.message_id : `<${mail.message_id}>`) : null;
    let messageId: string;
    try {
      ({ messageId } = await this.deps.provider.send({
        to: mail.from_address,
        subject: replySubject(mail.subject),
        text,
        from: this.deps.from,
        replyTo: this.deps.from,
        ...(threadId ? { headers: { 'In-Reply-To': threadId, References: threadId } } : {}),
      }));
    } catch (err) {
      throw new AppError('REPLY_NOT_SENT', 502, `the answer was not sent: ${err instanceof Error ? err.message : String(err)}`);
    }
    const saved = await this.pool.query<{ id: string; sent_at: Date }>(
      `INSERT INTO support_email_replies (email_id, admin_id, body, provider_message_id) VALUES ($1, $2, $3, $4) RETURNING id, sent_at`,
      [id, adminId, body, messageId],
    );
    // an answered mail has been read
    await this.pool.query(`UPDATE support_emails SET read_at = COALESCE(read_at, now()) WHERE id = $1`, [id]);
    return { id: saved.rows[0]!.id, sentAt: saved.rows[0]!.sent_at.toISOString() };
  }
}
