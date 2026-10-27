import type pg from 'pg';
import { securityEventInfo } from '@kurda/shared';
import { emailLocaleFor, type EmailLocale } from '../email/templates.js';

/** The fewest minutes between two alert emails: a burst of critical events is one email, not fifty. */
export const ALERT_EMAIL_GAP_MINUTES = 15;

export interface SecurityMailer {
  send(to: string, vars: { headline: string; list: string; link: string }, locale: EmailLocale): Promise<void>;
}

/**
 * Telling the superadmins when something critical happens: an admin console
 * sign-in from somewhere new, two-step codes locked, a sign-in surge, a lock on
 * a staff account.
 *
 * Every critical alert not emailed yet goes in one email, and the next email
 * waits at least ALERT_EMAIL_GAP_MINUTES, so an attack sends a few emails, not
 * hundreds. The claim on `emailed_at` is one update, so two sweeps never send
 * the same alert twice; when nobody could be reached the claim is given back
 * for the next sweep. An alert already marked reviewed is not sent.
 *
 * The email says what kind of thing happened and how many times, and where to
 * look. It never holds an address, an account or anything else from the log.
 */
export class SecurityAlerts {
  constructor(
    private readonly pool: pg.Pool,
    private readonly mailer: SecurityMailer,
    /** the admin panel's origin, when known */
    private readonly adminBaseUrl: string | undefined,
  ) {}

  async sendDue(): Promise<number> {
    const claimed = await this.pool.query<{ event_id: string; kind: string }>(
      `UPDATE security_alerts SET emailed_at = now()
        WHERE severity = 'critical' AND emailed_at IS NULL AND reviewed_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM security_alerts s WHERE s.emailed_at > now() - make_interval(mins => $1))
        RETURNING event_id, kind`,
      [ALERT_EMAIL_GAP_MINUTES],
    );
    if (!claimed.rowCount) return 0;
    const tally = new Map<string, number>();
    for (const row of claimed.rows) tally.set(row.kind, (tally.get(row.kind) ?? 0) + 1);
    const lines = [...tally].sort((a, b) => b[1] - a[1]).map(([kind, n]) => `• ${securityEventInfo(kind).title}${n > 1 ? ` (${n} times)` : ''}`);
    const headline = securityEventInfo(claimed.rows[0]!.kind).title;
    const link = this.adminBaseUrl ? `${this.adminBaseUrl.replace(/\/$/, '')}/#/security-log` : 'the Security log page of the Hevalo admin panel';

    let sent = 0;
    let failure: unknown = null;
    try {
      const admins = await this.pool.query<{ email: string; locale: string }>(
        `SELECT email, locale FROM users
          WHERE deleted_at IS NULL AND email_verified_at IS NOT NULL
            AND roles && ARRAY['superadmin']::text[]
            AND NOT (banned_at IS NOT NULL AND (banned_until IS NULL OR banned_until > now()))`,
      );
      for (const admin of admins.rows) {
        // one address failing never keeps the others from being told
        try {
          await this.mailer.send(admin.email, { headline: tally.size > 1 ? `${claimed.rowCount} alerts` : headline, list: lines.join('\n'), link }, emailLocaleFor(admin.locale));
          sent++;
        } catch (err) {
          failure ??= err;
        }
      }
    } catch (err) {
      failure ??= err;
    }
    if (sent === 0) {
      // nobody was told: the next sweep tries again
      await this.pool
        .query(`UPDATE security_alerts SET emailed_at = NULL WHERE event_id = ANY($1::uuid[])`, [claimed.rows.map((r) => r.event_id)])
        .catch(() => undefined);
      if (failure !== null) throw failure;
    }
    return sent;
  }
}
