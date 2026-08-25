import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { canonicalPair } from '../friends/pair.js';
import type { FriendService } from '../friends/service.js';
import { resolveAvatarUrl } from '../cosmetics/access.js';
import type { PublicUrl } from '../cosmetics/access.js';
import { isOnline } from '../social/presence.js';

export const MAX_MESSAGE_LEN = 2000;

/** Just enough of the realtime gateway to push server→user events. */
export interface Notifier {
  notifyUser(userId: string, event: Record<string, unknown>): Promise<void>;
}

/** Moderation hook: masks profanity, tracks offenses, enforces escalation mutes (KUR-086). */
export interface ChatModeration {
  isChatMuted(userId: string): Promise<boolean>;
  filter(text: string): { masked: string; flagged: boolean };
  recordOffense(userId: string): Promise<unknown>;
}

export interface DmMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface Conversation {
  userId: string;
  username: string;
  avatarUrl: string | null;
  online: boolean;
  lastMessage: string;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

/**
 * 1:1 direct messages (KUR-083). Friends-only, ≤2000 chars, basic text. Live
 * delivery + typing + receipts go over the WebSocket gateway; the rows are the
 * paginated history and offline-delivery store. Blocks are silent: a message to
 * someone who has blocked the sender is dropped server-side but the sender sees
 * it as sent.
 */
export class ChatService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly friends: FriendService,
    private readonly notifier: Notifier,
    private readonly moderation?: ChatModeration,
  ) {}

  async send(from: string, to: string, rawBody: string): Promise<DmMessage> {
    if (from === to) throw new AppError('SELF_DM', 400, 'you cannot message yourself');
    const trimmed = stripControlChars(rawBody).trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LEN) {
      throw new AppError('BAD_MESSAGE', 400, `message must be 1–${MAX_MESSAGE_LEN} characters`);
    }
    // escalation mute (KUR-086) applies everywhere
    if (this.moderation && (await this.moderation.isChatMuted(from))) {
      throw new AppError('CHAT_MUTED', 403, 'you are muted from chat');
    }
    // silent block: pretend it sent, but drop it (never reveal the block)
    if (await this.friends.areBlocked(from, to)) {
      return { id: randomUUID(), senderId: from, body: trimmed, createdAt: new Date().toISOString(), deliveredAt: null, readAt: null };
    }
    if ((await this.friends.statusBetween(from, to)) !== 'friends') {
      throw new AppError('NOT_FRIENDS', 403, 'you can only message friends');
    }

    // mask profanity on delivery; flagged messages feed repeat-offender escalation
    const filtered = this.moderation ? this.moderation.filter(trimmed) : { masked: trimmed, flagged: false };
    const body = filtered.masked;

    const { lo, hi } = canonicalPair(from, to);
    const row = await this.pool.query<{ id: string; created_at: Date }>(
      `INSERT INTO dm_messages (user_lo, user_hi, sender_id, body) VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [lo, hi, from, body],
    );
    if (filtered.flagged && this.moderation) void this.moderation.recordOffense(from).catch(() => undefined);
    const message: DmMessage = {
      id: row.rows[0]!.id,
      senderId: from,
      body,
      createdAt: row.rows[0]!.created_at.toISOString(),
      deliveredAt: null,
      readAt: null,
    };
    await this.notifier.notifyUser(to, { type: 'dm', from, message }).catch(() => undefined);
    return message;
  }

  /** Paginated history (newest first past `before`); marks incoming delivered. */
  async history(user: string, other: string, before?: string, limit = 30): Promise<DmMessage[]> {
    if (await this.friends.areBlocked(user, other)) return [];
    const { lo, hi } = canonicalPair(user, other);
    const rows = await this.pool.query<{
      id: string;
      sender_id: string;
      body: string;
      created_at: Date;
      delivered_at: Date | null;
      read_at: Date | null;
    }>(
      `SELECT id, sender_id, body, created_at, delivered_at, read_at FROM dm_messages
        WHERE user_lo = $1 AND user_hi = $2 ${before ? 'AND created_at < $4::timestamptz' : ''}
        ORDER BY created_at DESC LIMIT $3`,
      before ? [lo, hi, limit, before] : [lo, hi, limit],
    );
    await this.markDelivered(lo, hi, user, other);
    return rows.rows
      .map((r) => ({
        id: r.id,
        senderId: r.sender_id,
        body: r.body,
        createdAt: r.created_at.toISOString(),
        deliveredAt: r.delivered_at ? r.delivered_at.toISOString() : null,
        readAt: r.read_at ? r.read_at.toISOString() : null,
      }))
      .reverse(); // ascending for display
  }

  /** Mark messages from `other` as delivered and notify the sender. */
  private async markDelivered(lo: string, hi: string, user: string, other: string): Promise<void> {
    const res = await this.pool.query(
      `UPDATE dm_messages SET delivered_at = now()
        WHERE user_lo = $1 AND user_hi = $2 AND sender_id = $3 AND delivered_at IS NULL`,
      [lo, hi, other],
    );
    if ((res.rowCount ?? 0) > 0) {
      await this.notifier.notifyUser(other, { type: 'dm_delivered', by: user }).catch(() => undefined);
    }
  }

  /** Mark all messages from `other` read; notify them (read receipt). */
  async markRead(user: string, other: string): Promise<number> {
    const { lo, hi } = canonicalPair(user, other);
    const res = await this.pool.query(
      `UPDATE dm_messages SET read_at = now()
        WHERE user_lo = $1 AND user_hi = $2 AND sender_id = $3 AND read_at IS NULL`,
      [lo, hi, other],
    );
    const n = res.rowCount ?? 0;
    if (n > 0) await this.notifier.notifyUser(other, { type: 'dm_read', by: user }).catch(() => undefined);
    return n;
  }

  /** Ephemeral typing indicator (silent under a block). */
  async typing(from: string, to: string): Promise<void> {
    if (await this.friends.areBlocked(from, to)) return;
    await this.notifier.notifyUser(to, { type: 'dm_typing', from }).catch(() => undefined);
  }

  /** Conversation list: last message + unread per correspondent (blocks hidden). */
  async conversations(user: string, publicUrl: PublicUrl = () => null): Promise<Conversation[]> {
    const rows = await this.pool.query<{
      other: string;
      username: string;
      profile_photo_key: string | null;
      selected_avatar_key: string | null;
      last_seen_at: Date | null;
      body: string;
      created_at: Date;
      sender_id: string;
      unread: number;
    }>(
      `WITH convo AS (
         SELECT *, row_number() OVER (PARTITION BY user_lo, user_hi ORDER BY created_at DESC) rn
           FROM dm_messages WHERE user_lo = $1 OR user_hi = $1
       )
       SELECT CASE WHEN c.user_lo = $1 THEN c.user_hi ELSE c.user_lo END AS other,
              u.username, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at, c.body, c.created_at, c.sender_id,
              (SELECT count(*)::int FROM dm_messages m
                WHERE m.user_lo = c.user_lo AND m.user_hi = c.user_hi
                  AND m.sender_id <> $1 AND m.read_at IS NULL) AS unread
         FROM convo c
         JOIN users u ON u.id = CASE WHEN c.user_lo = $1 THEN c.user_hi ELSE c.user_lo END
        WHERE c.rn = 1 AND u.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1)
          )
        ORDER BY c.created_at DESC`,
      [user],
    );
    const now = new Date();
    return rows.rows.map((r) => ({
      userId: r.other,
      username: r.username,
      avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
      online: isOnline(r.last_seen_at, now),
      lastMessage: r.body,
      lastAt: r.created_at.toISOString(),
      lastFromMe: r.sender_id === user,
      unread: r.unread,
    }));
  }
}
