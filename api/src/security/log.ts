import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { Redis } from 'ioredis';
import {
  SECURITY_ADDRESS_DAYS,
  SECURITY_EVENTS,
  needsAttention,
  securitySeverity,
  type SecurityEventInfo,
  type SecurityEventKind,
} from '@kurda/shared';
import { isPrivileged } from '../admin/roles.js';
import { sessionNameFromAgent } from '../auth/session-name.js';
import { networkHashOf } from '../net/network-key.js';
import { cameThroughCloudflare } from '../plugins/client-ip.js';
import { seal } from './at-rest.js';
import { currentRequest } from './context.js';

/** What an address is sealed for (security/at-rest.ts), so no other sealed value can pass for one. */
export const ADDRESS_PURPOSE = 'security-log-address';

export interface SecurityEventInput {
  /** the account it is about: the one signed in to, failed on, locked, changed */
  userId?: string | null;
  /** whether that account is staff, when the caller already knows; looked up when it matters otherwise */
  staff?: boolean;
  /** anything else worth seeing — never a password, a token, a code or an email address */
  details?: Record<string, unknown>;
  /** the address it came from, when it is not the request being served */
  ip?: string | null;
  /** more of what makes two events the same, for the kinds recorded once in a while */
  dedupe?: string;
}

/** What services are handed: they record, and never wait on or fail over the log. */
export interface SecurityRecorder {
  record(kind: SecurityEventKind, input?: SecurityEventInput): Promise<void>;
}

/** For an app with no database: nothing to keep events in. */
export const NO_SECURITY_LOG: SecurityRecorder = { record: async () => undefined };

interface Logger {
  error: (obj: unknown, msg: string) => void;
}

/** A country as Cloudflare names it, or null; `XX` and `T1` (unknown, Tor) are kept, they say something too. */
function countryOf(header: unknown): string | null {
  return typeof header === 'string' && /^[A-Z0-9]{2}$/.test(header) ? header : null;
}

/**
 * The security log (migration 1751000200000): every sign-in, failure, lockout,
 * refusal and change of access, kept so the owner can see whether someone is
 * trying to get in, and how far they got.
 *
 * `record` takes everything about where an event came from from the request
 * being served (security/context.ts): the network as its keyed hash, the
 * address sealed so only a superadmin can read it and only by giving a reason,
 * the country when a trusted Cloudflare edge said it, the device as its
 * browser and system, the request id. Callers say only what happened and to
 * whom.
 *
 * It never throws and never slows the request it is recording much: a write
 * that fails is logged and dropped, never the sign-in that caused it. A
 * warning or worse also goes on the "Needs attention" list, and a critical one
 * is handed to `onCritical` (the alert emails, security/alerts.ts).
 */
export class SecurityLog implements SecurityRecorder {
  /** recently recorded keys of the once-in-a-while kinds, when there is no Redis to share them in */
  private readonly recent = new Map<string, number>();

  constructor(
    private readonly pool: pg.Pool,
    private readonly options: {
      /** the server secret addresses are sealed under (the JWT secret, as every at-rest value is) */
      secret: string;
      redis?: Redis;
      log?: Logger;
      onCritical?: () => void;
    },
  ) {}

  async record(kind: SecurityEventKind, input: SecurityEventInput = {}): Promise<void> {
    try {
      await this.write(kind, input);
    } catch (err) {
      this.options.log?.error({ err, kind }, 'security log write failed');
    }
  }

  private async write(kind: SecurityEventKind, input: SecurityEventInput): Promise<void> {
    const info: SecurityEventInfo = SECURITY_EVENTS[kind];
    const req = currentRequest();
    const ip = input.ip !== undefined ? input.ip : (req?.ip ?? null);
    const network = networkHashOf(ip);
    const route = req?.routeOptions?.url ?? null;
    if (info.dedupeSeconds) {
      const by = info.dedupeBy ?? ['account', 'network', 'route'];
      const parts = [kind, by.includes('account') ? input.userId : null, by.includes('network') ? network : null, by.includes('route') ? route : null, input.dedupe];
      if (!(await this.firstIn(info.dedupeSeconds, parts))) return;
    }

    const staff = input.staff ?? (info.staffEscalates && input.userId ? await this.isStaff(input.userId) : false);
    const severity = securitySeverity(kind, staff);
    const details: Record<string, unknown> = { ...input.details };
    if (staff) details.staff = true;
    if (req && route) details.route = `${req.method} ${route}`;

    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO security_events (kind, severity, category, user_id, actor_id, network_hash, ip_sealed, country, device, request_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       RETURNING id`,
      [
        kind,
        severity,
        info.category,
        input.userId ?? null,
        req?.user?.id ?? null,
        network,
        ip && network ? seal(this.options.secret, ADDRESS_PURPOSE, ip) : null,
        req && cameThroughCloudflare(req) ? countryOf(req.headers['cf-ipcountry']) : null,
        req ? (sessionNameFromAgent(req.headers['user-agent']) ?? null) : null,
        req ? String(req.id) : null,
        JSON.stringify(details),
      ],
    );
    if (!needsAttention(severity)) return;
    await this.pool.query(`INSERT INTO security_alerts (event_id, kind, severity) VALUES ($1, $2, $3)`, [inserted.rows[0]!.id, kind, severity]);
    if (severity === 'critical') this.options.onCritical?.();
  }

  /** Whether this is the first event with these parts in `seconds`: shared through Redis when there is one. */
  private async firstIn(seconds: number, parts: ReadonlyArray<string | null | undefined>): Promise<boolean> {
    const key = `security-log:once:${createHash('sha256').update(parts.map((p) => p ?? '').join('\n')).digest('hex').slice(0, 32)}`;
    if (this.options.redis) {
      try {
        return (await this.options.redis.set(key, '1', 'EX', seconds, 'NX')) === 'OK';
      } catch {
        // Redis out of reach: fall through to this process's own memory
      }
    }
    const now = Date.now();
    const until = this.recent.get(key);
    if (until !== undefined && until > now) return false;
    if (this.recent.size > 10_000) {
      for (const [k, t] of this.recent) if (t <= now) this.recent.delete(k);
    }
    this.recent.set(key, now + seconds * 1000);
    return true;
  }

  private async isStaff(userId: string): Promise<boolean> {
    const found = await this.pool.query<{ roles: string[] }>(`SELECT roles FROM users WHERE id = $1`, [userId]);
    return isPrivileged(found.rows[0]?.roles ?? []);
  }

  /**
   * The daily clean-up, within what the table itself allows: events past their
   * retention go (90 days, a year for warnings and worse; the trigger refuses
   * anything younger), and the sealed address of every event older than
   * SECURITY_ADDRESS_DAYS is forgotten. In batches, so a large backlog never
   * holds one long lock.
   */
  async purge(): Promise<{ deleted: number; addressesForgotten: number }> {
    let deleted = 0;
    for (;;) {
      const res = await this.pool.query(
        `DELETE FROM security_events WHERE id IN (
           SELECT id FROM security_events
            WHERE occurred_at < now() - CASE WHEN severity IN ('info','notice') THEN interval '90 days' ELSE interval '365 days' END
            LIMIT 5000)`,
      );
      deleted += res.rowCount ?? 0;
      if ((res.rowCount ?? 0) < 5000) break;
    }
    const forgotten = await this.pool.query(
      `UPDATE security_events SET ip_sealed = NULL
        WHERE ip_sealed IS NOT NULL AND occurred_at < now() - make_interval(days => $1)`,
      [SECURITY_ADDRESS_DAYS],
    );
    return { deleted, addressesForgotten: forgotten.rowCount ?? 0 };
  }
}

