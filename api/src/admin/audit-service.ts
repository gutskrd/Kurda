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
  limit?: number;
}

export interface AuditRow {
  id: string;
  adminId: string;
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
      clauses.push(`admin_id = $${params.length}`);
    }
    if (filters.action) {
      params.push(`${filters.action}%`);
      clauses.push(`action LIKE $${params.length}`);
    }
    if (filters.targetId) {
      params.push(filters.targetId);
      clauses.push(`target_id = $${params.length}`);
    }
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    params.push(limit);
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await this.pool.query<{
      id: string; admin_id: string; action: string; target_type: string | null; target_id: string | null;
      before: unknown; after: unknown; reason: string | null; request_id: string | null; created_at: Date;
    }>(
      `SELECT id, admin_id, action, target_type, target_id, before, after, reason, request_id, created_at
       FROM admin_audit_log ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map((r) => ({
      id: r.id,
      adminId: r.admin_id,
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
