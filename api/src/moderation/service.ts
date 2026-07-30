import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { filterText, type FilterResult } from './filter.js';

export type MessageType = 'dm' | 'group';

/** Escalation thresholds: flagged-message count → mute severity. */
export const OFFENSE_1H = 3;
export const OFFENSE_24H = 5;
export const OFFENSE_PERM = 8;

export interface OffenseResult {
  count: number;
  mutedUntil: Date | null;
  perm: boolean;
}

export interface ReportRow {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  messageType: MessageType;
  messageId: string;
  context: unknown;
  status: string;
  createdAt: Date;
}

/**
 * Chat moderation (KUR-086): profanity masking on delivery, message reporting
 * with captured context, and repeat-offender auto-mute escalation. The mute is
 * global (enforced by the DM + group chat send paths) so an escalating offender
 * is quieted everywhere.
 */
export class ModerationService {
  constructor(private readonly pool: pg.Pool) {}

  /** Mask + flag a message body (pure filter). */
  filter(text: string): FilterResult {
    return filterText(text);
  }

  /** Is the user currently under an escalation mute? */
  async isChatMuted(userId: string): Promise<boolean> {
    const r = await this.pool.query<{ perm_muted: boolean; muted_until: Date | null }>(
      `SELECT perm_muted, muted_until FROM chat_offenses WHERE user_id = $1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) return false;
    return row.perm_muted || (row.muted_until !== null && row.muted_until > new Date());
  }

  /** Record a flagged message and apply escalating auto-mute. */
  async recordOffense(userId: string): Promise<OffenseResult> {
    const inc = await this.pool.query<{ offense_count: number }>(
      `INSERT INTO chat_offenses (user_id, offense_count) VALUES ($1, 1)
       ON CONFLICT (user_id) DO UPDATE SET offense_count = chat_offenses.offense_count + 1, updated_at = now()
       RETURNING offense_count`,
      [userId],
    );
    const count = inc.rows[0]!.offense_count;

    let mutedUntil: Date | null = null;
    let perm = false;
    if (count >= OFFENSE_PERM) perm = true;
    else if (count >= OFFENSE_24H) mutedUntil = new Date(Date.now() + 24 * 3600 * 1000);
    else if (count >= OFFENSE_1H) mutedUntil = new Date(Date.now() + 3600 * 1000);

    if (perm || mutedUntil) {
      await this.pool.query(
        `UPDATE chat_offenses SET muted_until = $2, perm_muted = $3, updated_at = now() WHERE user_id = $1`,
        [userId, mutedUntil, perm],
      );
    }
    return { count, mutedUntil, perm };
  }

  /**
   * File a report on a message, snapshotting ~10 surrounding messages as
   * context for the moderation queue.
   */
  async report(reporterId: string, messageType: MessageType, messageId: string, reason?: string): Promise<{ id: string }> {
    const context = await this.contextFor(messageType, messageId);
    if (!context) throw new AppError('MESSAGE_NOT_FOUND', 404, 'no such message');
    const row = await this.pool.query<{ id: string }>(
      `INSERT INTO chat_reports (reporter_id, reported_user_id, message_type, message_id, context, reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [reporterId, context.reportedUserId, messageType, messageId, JSON.stringify(context.messages), reason ?? null],
    );
    return { id: row.rows[0]!.id };
  }

  private async contextFor(
    messageType: MessageType,
    messageId: string,
  ): Promise<{ reportedUserId: string; messages: unknown[] } | null> {
    if (messageType === 'dm') {
      const m = await this.pool.query<{ user_lo: string; user_hi: string; sender_id: string; created_at: Date }>(
        `SELECT user_lo, user_hi, sender_id, created_at FROM dm_messages WHERE id = $1`,
        [messageId],
      );
      const msg = m.rows[0];
      if (!msg) return null;
      const ctx = await this.pool.query(
        `(SELECT sender_id, body, created_at FROM dm_messages
            WHERE user_lo = $1 AND user_hi = $2 AND created_at <= $3 ORDER BY created_at DESC LIMIT 6)
         UNION ALL
         (SELECT sender_id, body, created_at FROM dm_messages
            WHERE user_lo = $1 AND user_hi = $2 AND created_at > $3 ORDER BY created_at ASC LIMIT 4)
         ORDER BY created_at`,
        [msg.user_lo, msg.user_hi, msg.created_at],
      );
      return { reportedUserId: msg.sender_id, messages: ctx.rows };
    }
    const m = await this.pool.query<{ group_id: string; sender_id: string; created_at: Date }>(
      `SELECT group_id, sender_id, created_at FROM group_messages WHERE id = $1`,
      [messageId],
    );
    const msg = m.rows[0];
    if (!msg) return null;
    const ctx = await this.pool.query(
      `(SELECT sender_id, body, created_at FROM group_messages
          WHERE group_id = $1 AND created_at <= $2 ORDER BY created_at DESC LIMIT 6)
       UNION ALL
       (SELECT sender_id, body, created_at FROM group_messages
          WHERE group_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 4)
       ORDER BY created_at`,
      [msg.group_id, msg.created_at],
    );
    return { reportedUserId: msg.sender_id, messages: ctx.rows };
  }

  /** Open reports, oldest first (admin queue). */
  async pendingReports(): Promise<ReportRow[]> {
    const rows = await this.pool.query<{
      id: string; reporter_id: string; reported_user_id: string | null; message_type: MessageType; message_id: string; context: unknown; status: string; created_at: Date;
    }>(
      `SELECT id, reporter_id, reported_user_id, message_type, message_id, context, status, created_at
         FROM chat_reports WHERE status = 'open' ORDER BY created_at`,
    );
    return rows.rows.map((r) => ({
      id: r.id, reporterId: r.reporter_id, reportedUserId: r.reported_user_id, messageType: r.message_type,
      messageId: r.message_id, context: r.context, status: r.status, createdAt: r.created_at,
    }));
  }

  /** Resolve a report; 'actioned' also records an offense against the author. */
  async resolveReport(reportId: string, action: 'actioned' | 'dismissed', adminId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query<{ reported_user_id: string | null; status: string }>(
        `SELECT reported_user_id, status FROM chat_reports WHERE id = $1 FOR UPDATE`,
        [reportId],
      );
      const report = r.rows[0];
      if (!report) throw new AppError('REPORT_NOT_FOUND', 404, 'no such report');
      if (report.status !== 'open') throw new AppError('ALREADY_RESOLVED', 409, 'report already resolved');
      await client.query(
        `UPDATE chat_reports SET status = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1`,
        [reportId, action, adminId],
      );
      await client.query('COMMIT');
      if (action === 'actioned' && report.reported_user_id) await this.recordOffense(report.reported_user_id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
