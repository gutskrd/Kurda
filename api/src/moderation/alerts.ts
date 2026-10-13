import type pg from 'pg';
import { emailLocaleFor, type EmailLocale } from '../email/templates.js';

/**
 * Telling the moderators when something cannot wait.
 *
 * Nothing used to alert anyone: the queue only filled when somebody happened to
 * open the page. A P0 case — a child at risk, someone who may hurt themselves,
 * a threat — now emails every moderation admin through the existing provider
 * (Resend in production), once per case: the claim on `alert_sent_at` is one
 * atomic update, so two reports arriving together send one email, and a round
 * that reached nobody releases the claim for the five-minute sweep to try again
 * (one that reached some moderators keeps it: at most one email each).
 *
 * The email never contains the content, the people or the category — only that
 * an urgent report is waiting and a link to the admin panel. Email is not a safe
 * place for what a report holds.
 */

export interface ModerationMailer {
  send(to: string, vars: { link: string }, locale: EmailLocale): Promise<void>;
}

export class ModerationAlerts {
  constructor(
    private readonly pool: pg.Pool,
    private readonly mailer: ModerationMailer,
    /** the admin panel's origin, when known; the email says where to go either way */
    private readonly adminBaseUrl: string | undefined,
  ) {}

  /** Alert about one case if it is P0, open and not alerted yet. Returns how many emails went. */
  async caseUrgent(caseId: string): Promise<number> {
    const claimed = await this.pool.query<{ id: string }>(
      `UPDATE moderation_cases SET alert_sent_at = now()
        WHERE id = $1 AND priority = 0 AND alert_sent_at IS NULL
          AND status IN ('open','in_review','needs_second_approval','escalated')
        RETURNING id`,
      [caseId],
    );
    if (!claimed.rowCount) return 0;
    let sent = 0;
    let failure: unknown = null;
    try {
      const admins = await this.pool.query<{ email: string; locale: string }>(
        `SELECT email, locale FROM users
          WHERE deleted_at IS NULL AND email_verified_at IS NOT NULL
            AND roles && ARRAY['moderator','superadmin','admin']::text[]
            AND NOT (banned_at IS NOT NULL AND (banned_until IS NULL OR banned_until > now()))`,
      );
      const link = this.adminBaseUrl
        ? `${this.adminBaseUrl.replace(/\/$/, '')}/#/moderation/${caseId}`
        : 'the Moderation page of the Hevalo admin panel';
      for (const admin of admins.rows) {
        // one address failing never keeps the others from being told
        try {
          await this.mailer.send(admin.email, { link }, emailLocaleFor(admin.locale));
          sent++;
        } catch (err) {
          failure ??= err;
        }
      }
    } catch (err) {
      failure ??= err;
    }
    // Nobody was told: give the claim back so the sweep tries again — a P0 is
    // never left unannounced. Someone was: keep it, so nobody gets it twice.
    if (failure !== null && sent === 0) {
      await this.pool.query(`UPDATE moderation_cases SET alert_sent_at = NULL WHERE id = $1`, [caseId]).catch(() => undefined);
      throw failure;
    }
    return sent;
  }

  /** The sweep's half: any open P0 case nobody was told about yet. */
  async sendMissed(): Promise<number> {
    const due = await this.pool.query<{ id: string }>(
      `SELECT id FROM moderation_cases
        WHERE priority = 0 AND alert_sent_at IS NULL
          AND status IN ('open','in_review','needs_second_approval','escalated')
        ORDER BY first_reported_at LIMIT 50`,
    );
    let sent = 0;
    for (const { id } of due.rows) sent += await this.caseUrgent(id).catch(() => 0);
    return sent;
  }
}
