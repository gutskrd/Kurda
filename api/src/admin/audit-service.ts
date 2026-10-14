import type pg from 'pg';

/** A pg executor: the pool (own transaction) or a client (caller's transaction). */
export interface Executor {
  query: pg.Pool['query'];
}

export interface AuditEntry {
  adminId: string;
  /** Dotted verb, e.g. 'user.ban', 'content.publish', 'wallet.adjust'. */
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
}

export interface AuditFilters {
  adminId?: string;
  action?: string;
  targetId?: string;
  /**
   * Only the entries after this one, newest first: the last row of the page
   * before, for paging. An id rather than a time, because rows share a time
   * (pg answers to the millisecond, the table holds microseconds) and a time
   * cursor skipped the rest of a millisecond's rows.
   */
  beforeId?: string;
  limit?: number;
}

export interface AuditRow {
  id: string;
  adminId: string;
  /** who the admin is, so the trail reads as names; null once the account is gone */
  adminUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  requestId: string | null;
  createdAt: Date;
}

/**
 * Immutable admin audit trail (KUR-104). `record` takes any executor, so a
 * service can pass its own transaction client to make the audit write part of
 * the same transaction as the mutation — if the audit insert fails, the whole
 * action rolls back (the issue's edge case). The DB trigger makes rows
 * append-only, so the log can't be edited or deleted afterward.
 */
export class AuditService {
  constructor(private readonly pool: pg.Pool) {}

  async record(executor: Executor, entry: AuditEntry): Promise<void> {
    await executor.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, before, after, reason, request_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        entry.adminId,
        entry.action,
        entry.targetType ?? null,
        entry.targetId ?? null,
        entry.before === undefined ? null : JSON.stringify(entry.before),
        entry.after === undefined ? null : JSON.stringify(entry.after),
        entry.reason ?? null,
        entry.requestId ?? null,
      ],
    );
  }

  /** Search the trail, newest first, filtered by admin / action prefix / target. */
  async search(filters: AuditFilters = {}): Promise<AuditRow[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filters.adminId) {
      params.push(filters.adminId);
      clauses.push(`a.admin_id = $${params.length}`);
    }
    if (filters.action) {
      params.push(`${filters.action}%`);
      clauses.push(`a.action LIKE $${params.length}`);
    }
    if (filters.targetId) {
      params.push(filters.targetId);
      clauses.push(`a.target_id = $${params.length}`);
    }
    if (filters.beforeId) {
      params.push(filters.beforeId);
      // an id that is not in the trail compares as null: nothing older to show
      clauses.push(`(a.created_at, a.id) < (SELECT created_at, id FROM admin_audit_log WHERE id = $${params.length})`);
    }
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    params.push(limit);
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await this.pool.query<{
      id: string; admin_id: string; admin_username: string | null; action: string; target_type: string | null; target_id: string | null;
      before: unknown; after: unknown; reason: string | null; request_id: string | null; created_at: Date;
    }>(
      `SELECT a.id, a.admin_id, u.username AS admin_username, a.action, a.target_type, a.target_id, a.before, a.after,
              a.reason, a.request_id, a.created_at
       FROM admin_audit_log a LEFT JOIN users u ON u.id = a.admin_id
       ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map((r) => ({
      id: r.id,
      adminId: r.admin_id,
      adminUsername: r.admin_username,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      before: r.before,
      after: r.after,
      reason: r.reason,
      requestId: r.request_id,
      createdAt: r.created_at,
    }));
  }
}
