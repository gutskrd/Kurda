import type pg from 'pg';
import { SECURITY_SEVERITIES, type SecurityCategory, type SecuritySeverity } from '@kurda/shared';
import { escapeLike } from '../db/like.js';
import { unseal } from './at-rest.js';
import { ADDRESS_PURPOSE, type SecurityRecorder } from './log.js';

export interface SecurityEventFilters {
  /** this serious or more */
  severity?: SecuritySeverity;
  category?: SecurityCategory;
  /** one kind, or every kind in an area when it ends with a dot (`console.`) */
  kind?: string;
  userId?: string;
  /** a network's keyed hash, as the events show it */
  network?: string;
  /** only the events still waiting on the "Needs attention" list */
  open?: boolean;
  since?: Date;
  until?: Date;
  /** the last event of the page before, for the next page (newest first) */
  beforeId?: string;
  limit?: number;
}

interface Person {
  id: string;
  username: string | null;
}

export interface SecurityEventRow {
  id: string;
  occurredAt: Date;
  kind: string;
  severity: SecuritySeverity;
  category: string;
  /** the account it is about */
  user: Person | null;
  /** who was signed in when it happened, when that is someone else (an admin acting on an account) or the same */
  actor: Person | null;
  network: string | null;
  country: string | null;
  device: string | null;
  requestId: string | null;
  details: Record<string, unknown>;
  /** whether the address is still kept, so it can be revealed */
  hasAddress: boolean;
  /** its place on the "Needs attention" list, for a warning or worse */
  alert: { reviewedAt: Date | null; reviewedBy: string | null; note: string | null; emailedAt: Date | null } | null;
}

type Counts = Record<SecuritySeverity, number> & { total: number };

export interface SecuritySummary {
  /** the last 24 hours, and the 24 before them to compare with */
  window: { from: Date; to: Date };
  counts: Counts;
  previous: Counts;
  /** wrong passwords and refused sign-ins, the clearest sign of someone trying */
  failedSignIns: { now: number; before: number };
  /** requests stopped: locks, risk blocks, rate limits, refused sign-ups */
  blocked: { now: number; before: number };
  /** events per hour, oldest first, by how serious */
  hourly: Array<{ hour: Date } & Record<SecuritySeverity, number>>;
  /** the networks behind the most trouble in the window */
  networks: Array<{ network: string; events: number; failures: number; serious: number; accounts: number; country: string | null; lastAt: Date }>;
  open: { warning: number; critical: number };
  lastConsoleSignIn: { at: Date; device: string | null; country: string | null } | null;
}

const FAILED_SIGN_INS = ['signin.failed', 'console.signin_failed', 'console.signin_refused', 'console.2fa_failed'];
const BLOCKED = [
  'signin.locked',
  'network.locked',
  'signin.risk_blocked',
  'request.rate_limited',
  'signup.rejected',
  'console.2fa_locked',
  'console.probe',
  'request.probe',
  'network.scanner_blocked',
];

function counts(row: Record<string, number | string | null> | undefined, prefix: string): Counts {
  const n = (k: string) => Number(row?.[`${prefix}${k}`] ?? 0);
  return { total: n('total'), info: n('info'), notice: n('notice'), warning: n('warning'), critical: n('critical') };
}

/**
 * Reading the security log for the admin console, and the two things a
 * superadmin does with it: mark what they have looked at as reviewed, and,
 * giving a reason that is itself recorded, see the address an event came from.
 */
export class SecurityLogReader {
  constructor(
    private readonly pool: pg.Pool,
    private readonly secret: string,
    private readonly log: SecurityRecorder,
  ) {}

  async search(filters: SecurityEventFilters = {}): Promise<SecurityEventRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (filters.severity) where.push(`e.severity = ANY(${add(SECURITY_SEVERITIES.slice(SECURITY_SEVERITIES.indexOf(filters.severity)))})`);
    if (filters.category) where.push(`e.category = ${add(filters.category)}`);
    if (filters.kind) {
      where.push(filters.kind.endsWith('.') ? `e.kind LIKE ${add(`${escapeLike(filters.kind)}%`)}` : `e.kind = ${add(filters.kind)}`);
    }
    if (filters.userId) where.push(`e.user_id = ${add(filters.userId)}`);
    if (filters.network) where.push(`e.network_hash = ${add(filters.network)}`);
    if (filters.open) where.push(`a.event_id IS NOT NULL AND a.reviewed_at IS NULL`);
    if (filters.since) where.push(`e.occurred_at >= ${add(filters.since)}`);
    if (filters.until) where.push(`e.occurred_at < ${add(filters.until)}`);
    if (filters.beforeId) {
      // an id that is not in the log compares as null: nothing older to show
      where.push(`(e.occurred_at, e.id) < (SELECT occurred_at, id FROM security_events WHERE id = ${add(filters.beforeId)})`);
    }
    const limit = add(Math.min(Math.max(filters.limit ?? 50, 1), 200));
    const res = await this.pool.query<{
      id: string; occurred_at: Date; kind: string; severity: SecuritySeverity; category: string;
      user_id: string | null; user_name: string | null; actor_id: string | null; actor_name: string | null;
      network_hash: string | null; country: string | null; device: string | null; request_id: string | null;
      details: Record<string, unknown>; has_address: boolean;
      alerted: boolean; reviewed_at: Date | null; reviewer: string | null; review_note: string | null; emailed_at: Date | null;
    }>(
      `SELECT e.id, e.occurred_at, e.kind, e.severity, e.category,
              e.user_id, u.username AS user_name, e.actor_id, ac.username AS actor_name,
              e.network_hash, e.country, e.device, e.request_id, e.details, e.ip_sealed IS NOT NULL AS has_address,
              a.event_id IS NOT NULL AS alerted, a.reviewed_at, r.username AS reviewer, a.review_note, a.emailed_at
         FROM security_events e
         LEFT JOIN security_alerts a ON a.event_id = e.id
         LEFT JOIN users u ON u.id = e.user_id
         LEFT JOIN users ac ON ac.id = e.actor_id
         LEFT JOIN users r ON r.id = a.reviewed_by
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT ${limit}`,
      params,
    );
    return res.rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurred_at,
      kind: r.kind,
      severity: r.severity,
      category: r.category,
      user: r.user_id ? { id: r.user_id, username: r.user_name } : null,
      actor: r.actor_id ? { id: r.actor_id, username: r.actor_name } : null,
      network: r.network_hash,
      country: r.country,
      device: r.device,
      requestId: r.request_id,
      details: r.details,
      hasAddress: r.has_address,
      alert: r.alerted ? { reviewedAt: r.reviewed_at, reviewedBy: r.reviewer, note: r.review_note, emailedAt: r.emailed_at } : null,
    }));
  }

  async summary(now: Date = new Date()): Promise<SecuritySummary> {
    const to = now;
    const from = new Date(now.getTime() - 24 * 3_600_000);
    const before = new Date(from.getTime() - 24 * 3_600_000);
    const bySeverity = (when: string, prefix: string) =>
      [
        `count(*) FILTER (WHERE ${when}) AS ${prefix}total`,
        ...SECURITY_SEVERITIES.map((s) => `count(*) FILTER (WHERE ${when} AND severity = '${s}') AS ${prefix}${s}`),
      ].join(', ');
    const nowWindow = 'occurred_at >= $2';
    const beforeWindow = 'occurred_at < $2';
    const [totals, hourly, networks, open, consoleSignIn] = await Promise.all([
      this.pool.query<Record<string, string>>(
        `SELECT ${bySeverity(nowWindow, 'n_')}, ${bySeverity(beforeWindow, 'p_')},
                count(*) FILTER (WHERE ${nowWindow} AND kind = ANY($4)) AS failed_now,
                count(*) FILTER (WHERE ${beforeWindow} AND kind = ANY($4)) AS failed_before,
                count(*) FILTER (WHERE ${nowWindow} AND kind = ANY($5)) AS blocked_now,
                count(*) FILTER (WHERE ${beforeWindow} AND kind = ANY($5)) AS blocked_before
           FROM security_events WHERE occurred_at >= $1 AND occurred_at < $3`,
        [before, from, to, FAILED_SIGN_INS, BLOCKED],
      ),
      this.pool.query<{ hour: Date } & Record<SecuritySeverity, string>>(
        `SELECT h.hour, ${SECURITY_SEVERITIES.map((s) => `count(e.id) FILTER (WHERE e.severity = '${s}') AS ${s}`).join(', ')}
           FROM generate_series(date_trunc('hour', $1::timestamptz), date_trunc('hour', $2::timestamptz), interval '1 hour') AS h(hour)
           LEFT JOIN security_events e ON e.occurred_at >= h.hour AND e.occurred_at < h.hour + interval '1 hour' AND e.occurred_at >= $1
          GROUP BY h.hour ORDER BY h.hour`,
        [from, to],
      ),
      this.pool.query<{ network_hash: string; events: string; failures: string; serious: string; accounts: string; country: string | null; last_at: Date }>(
        `SELECT network_hash, count(*) AS events,
                count(*) FILTER (WHERE kind = ANY($2)) AS failures,
                count(*) FILTER (WHERE severity IN ('warning','critical')) AS serious,
                count(DISTINCT user_id) AS accounts, max(country) AS country, max(occurred_at) AS last_at
           FROM security_events
          WHERE occurred_at >= $1 AND network_hash IS NOT NULL
          GROUP BY network_hash
         HAVING count(*) FILTER (WHERE kind = ANY($2)) > 0 OR count(*) FILTER (WHERE severity IN ('warning','critical')) > 0
          ORDER BY serious DESC, failures DESC, events DESC
          LIMIT 5`,
        [from, [...FAILED_SIGN_INS, ...BLOCKED]],
      ),
      this.pool.query<{ warning: string; critical: string }>(
        `SELECT count(*) FILTER (WHERE severity = 'warning') AS warning, count(*) FILTER (WHERE severity = 'critical') AS critical
           FROM security_alerts WHERE reviewed_at IS NULL`,
      ),
      this.pool.query<{ occurred_at: Date; device: string | null; country: string | null }>(
        `SELECT occurred_at, device, country FROM security_events
          WHERE kind IN ('console.signin', 'console.signin_new_device')
          ORDER BY occurred_at DESC LIMIT 1`,
      ),
    ]);
    const t = totals.rows[0];
    const last = consoleSignIn.rows[0];
    return {
      window: { from, to },
      counts: counts(t, 'n_'),
      previous: counts(t, 'p_'),
      failedSignIns: { now: Number(t?.failed_now ?? 0), before: Number(t?.failed_before ?? 0) },
      blocked: { now: Number(t?.blocked_now ?? 0), before: Number(t?.blocked_before ?? 0) },
      hourly: hourly.rows.map((r) => ({
        hour: r.hour,
        info: Number(r.info),
        notice: Number(r.notice),
        warning: Number(r.warning),
        critical: Number(r.critical),
      })),
      networks: networks.rows.map((r) => ({
        network: r.network_hash,
        events: Number(r.events),
        failures: Number(r.failures),
        serious: Number(r.serious),
        accounts: Number(r.accounts),
        country: r.country,
        lastAt: r.last_at,
      })),
      open: { warning: Number(open.rows[0]?.warning ?? 0), critical: Number(open.rows[0]?.critical ?? 0) },
      lastConsoleSignIn: last ? { at: last.occurred_at, device: last.device, country: last.country } : null,
    };
  }

  /**
   * Mark alerts reviewed: the ones listed, every open one of a kind, or every
   * open one. Returns how many were still open.
   */
  async review(adminId: string, which: { eventIds?: string[]; kind?: string; all?: boolean }, note: string | null): Promise<number> {
    const clauses = ['reviewed_at IS NULL'];
    const params: unknown[] = [adminId, note];
    if (which.eventIds) {
      params.push(which.eventIds);
      clauses.push(`event_id = ANY($${params.length}::uuid[])`);
    } else if (which.kind) {
      params.push(which.kind);
      clauses.push(`kind = $${params.length}`);
    } else if (!which.all) {
      return 0;
    }
    const res = await this.pool.query(
      `UPDATE security_alerts SET reviewed_at = now(), reviewed_by = $1, review_note = $2 WHERE ${clauses.join(' AND ')}`,
      params,
    );
    return res.rowCount ?? 0;
  }

  /**
   * The address an event came from, for a superadmin who says why; the reveal
   * is itself an event in the log. Null once the address has been forgotten
   * (SECURITY_ADDRESS_DAYS) or when the server secret it was sealed under has
   * changed; undefined when there is no such event.
   */
  async revealAddress(eventId: string, reason: string): Promise<string | null | undefined> {
    const found = await this.pool.query<{ ip_sealed: string | null; user_id: string | null }>(
      `SELECT ip_sealed, user_id FROM security_events WHERE id = $1`,
      [eventId],
    );
    const row = found.rows[0];
    if (!row) return undefined;
    const address = row.ip_sealed ? unseal(this.secret, ADDRESS_PURPOSE, row.ip_sealed) : null;
    await this.log.record('console.ip_revealed', { userId: row.user_id, details: { eventId, reason, found: address !== null } });
    return address;
  }
}
