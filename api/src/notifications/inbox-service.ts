import type pg from 'pg';
import type { Notification } from '../push/service.js';
import { notBlockedSql } from '../friends/blocked.js';

export const INBOX_LIMIT = 50;

export interface InboxItem {
  id: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  createdAt: Date;
  readAt: Date | null;
}

interface InboxRow {
  id: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  created_at: Date;
  read_at: Date | null;
}

function toItem(row: InboxRow): InboxItem {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    data: row.data ?? {},
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/**
 * In-app notification inbox (KUR-097). Records every produced notification and
 * exposes the catch-up list + a server-side read state that's shared across a
 * user's devices (read on phone → read on tablet). Reads are capped at the last
 * 50, newest first.
 */
export class InboxService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Persist a notification to the inbox (called from the delivery pipeline).
   *
   * A notification about something another person did names them in
   * `data.fromUserId`, and is not recorded when there is a block between them
   * and the recipient, whichever placed it (friends/blocked.ts): the blocker
   * hears nothing more of them. Everything of that kind today comes from a
   * friend, which a block ends, so this is what holds for one that races a
   * block and for whatever kind is added next.
   */
  async record(userId: string, notification: Notification): Promise<void> {
    await this.pool.query(
      `INSERT INTO notifications (user_id, category, title, body, data)
       SELECT $1::uuid, $2::text, $3::text, $4::text, $5::jsonb
        WHERE ${notBlockedSql('$1::uuid', '$6::uuid')}`,
      [
        userId,
        notification.category,
        notification.title,
        notification.body,
        JSON.stringify(notification.data ?? {}),
        notification.data?.fromUserId ?? null,
      ],
    );
  }

  /** The last 50 notifications, newest first. */
  async list(userId: string, limit = INBOX_LIMIT): Promise<InboxItem[]> {
    const res = await this.pool.query<InboxRow>(
      `SELECT id, category, title, body, data, created_at, read_at
       FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, Math.min(limit, INBOX_LIMIT)],
    );
    return res.rows.map(toItem);
  }

  async unreadCount(userId: string): Promise<number> {
    const res = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  /** Mark one notification read; returns false if it isn't the user's / already read. */
  async markRead(userId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE notifications SET read_at = now()
       WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
      [id, userId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Mark every unread notification read; returns how many changed. */
  async markAllRead(userId: string): Promise<number> {
    const res = await this.pool.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return res.rowCount ?? 0;
  }
}
