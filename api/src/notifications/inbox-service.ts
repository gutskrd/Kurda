import type pg from 'pg';
import type { Notification } from '../push/service.js';
import { notBlockedSql } from '../friends/blocked.js';
import { giftSenderShownSql } from '../gifts/cards.js';

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
  sender_hidden?: boolean;
}

/** What a gift's notice says once its sender may no longer be named to the reader. */
const UNNAMED_GIFT_BODY: Record<string, string> = {
  gift: 'A Hevalo member sent you a gift.',
  post_gift: 'A Hevalo member gave your post a gift.',
};

function toItem(row: InboxRow): InboxItem {
  const data = { ...(row.data ?? {}) };
  const hidden = row.sender_hidden === true;
  if (hidden) delete data.fromName;
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: hidden ? (UNNAMED_GIFT_BODY[String(data.kind)] ?? row.body) : row.body,
    data,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

/**
 * SQL column: a gift's notice whose sender the reader may no longer see (deleted, blocked either way, or hidden from
 * them since) loses the name. A gift in chat came from someone in that conversation, so only a post gift asks more.
 */
const SENDER_HIDDEN_SQL = `(n.data->>'kind' IN ('gift', 'post_gift') AND NOT EXISTS (
         SELECT 1 FROM users s
          WHERE s.id = (n.data->>'fromUserId')::uuid AND ${giftSenderShownSql('s', 'n.user_id', "n.data->>'kind' = 'gift'")})) AS sender_hidden`;

/**
 * Writes notifications in one statement through `executor`, the caller's transaction when a change and its
 * notifications must commit together (the push follows via `pushRecorded`). Held to the block rule of
 * `InboxService.record`.
 */
export async function recordNotifications(
  executor: Pick<pg.Pool, 'query'>,
  items: ReadonlyArray<{ userId: string; notification: Notification }>,
): Promise<void> {
  if (items.length === 0) return;
  await executor.query(
    `INSERT INTO notifications (user_id, category, title, body, data)
     SELECT t.user_id, t.category, t.title, t.body, t.data::jsonb
       FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::uuid[]) AS t(user_id, category, title, body, data, from_id)
      WHERE ${notBlockedSql('t.user_id', 't.from_id')}`,
    [
      items.map((i) => i.userId),
      items.map((i) => i.notification.category),
      items.map((i) => i.notification.title),
      items.map((i) => i.notification.body),
      items.map((i) => JSON.stringify(i.notification.data ?? {})),
      items.map((i) => i.notification.data?.fromUserId ?? null),
    ],
  );
}

/**
 * In-app notification inbox: records every produced notification, with a server-side read state shared across a
 * user's devices. Reads are capped at the latest 50, newest first.
 */
export class InboxService {
  constructor(private readonly pool: pg.Pool) {}

  /**
   * Stores a notification. One about another person's action names them in `data.fromUserId` and is not recorded when
   * a block stands between them and the recipient, in either direction (friends/blocked.ts); this covers one racing a
   * block and any kind added later.
   */
  async record(userId: string, notification: Notification): Promise<void> {
    await recordNotifications(this.pool, [{ userId, notification }]);
  }

  /** `record` for several people at once, in one statement. */
  async recordAll(items: ReadonlyArray<{ userId: string; notification: Notification }>): Promise<void> {
    await recordNotifications(this.pool, items);
  }

  /** The last 50 notifications, newest first. */
  async list(userId: string, limit = INBOX_LIMIT): Promise<InboxItem[]> {
    const res = await this.pool.query<InboxRow>(
      `SELECT n.id, n.category, n.title, n.body, n.data, n.created_at, n.read_at, ${SENDER_HIDDEN_SQL}
       FROM notifications n WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT $2`,
      [userId, Math.min(limit, INBOX_LIMIT)],
    );
    return res.rows.map(toItem);
  }

  /** The newest `limit` notifications and the unread total in one query, which the social rail polls; each row carries the count. */
  async recent(userId: string, limit: number): Promise<{ items: InboxItem[]; unread: number }> {
    const res = await this.pool.query<InboxRow & { unread: number }>(
      `SELECT n.id, n.category, n.title, n.body, n.data, n.created_at, n.read_at, ${SENDER_HIDDEN_SQL},
              (SELECT COUNT(*)::int FROM notifications WHERE user_id = $1 AND read_at IS NULL) AS unread
       FROM notifications n WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT $2`,
      [userId, Math.min(limit, INBOX_LIMIT)],
    );
    return { items: res.rows.map(toItem), unread: res.rows[0]?.unread ?? 0 };
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

  /** Removes one notification for good; false if it is not theirs or already gone. */
  async remove(userId: string, id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM notifications WHERE id = $1 AND user_id = $2`, [id, userId]);
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
