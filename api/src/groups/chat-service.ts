import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import type { GroupService } from './service.js';
import { canManage } from './roles.js';

export const MAX_GROUP_MESSAGE_LEN = 2000;
export type MuteDuration = '1h' | '24h' | 'perm';

/** Room fan-out over the KUR-049 bus (Redis pub/sub) + membership invites. */
export interface RoomHub {
  publish(room: string, event: Record<string, unknown>): Promise<void>;
  invite(room: string, userId: string, ttlSeconds?: number): Promise<void>;
}

/** Moderation hook (KUR-086): mask, track offenses, enforce escalation mutes. */
export interface ChatModeration {
  isChatMuted(userId: string): Promise<boolean>;
  filter(text: string): { masked: string; flagged: boolean };
  recordOffense(userId: string): Promise<unknown>;
}

export interface GroupMessage {
  id: string;
  senderId: string;
  username: string;
  body: string;
  createdAt: string;
  deleted: boolean;
}

const room = (groupId: string): string => `group:${groupId}`;
const ROOM_TTL = 7 * 24 * 60 * 60; // a week

/**
 * Group chat (KUR-085). Reuses the DM message shape over a per-group room fanned
 * out via Redis pub/sub. **Authorization is checked on every fetch** (not just
 * send), so a removed member loses history access immediately. Moderators can
 * delete messages and mute members (1h / 24h / permanent); unread counts come
 * from a per-member last-read marker.
 */
export class GroupChatService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly groups: GroupService,
    private readonly hub: RoomHub,
    private readonly moderation?: ChatModeration,
  ) {}

  private async requireMember(groupId: string, userId: string): Promise<'owner' | 'moderator' | 'member'> {
    const role = await this.groups.memberRole(groupId, userId);
    if (!role) throw new AppError('NOT_A_MEMBER', 403, 'you are not in this group');
    return role;
  }

  private async isMuted(groupId: string, userId: string): Promise<boolean> {
    const r = await this.pool.query(
      `SELECT 1 FROM group_mutes WHERE group_id = $1 AND user_id = $2
         AND (muted_until IS NULL OR muted_until > now()) LIMIT 1`,
      [groupId, userId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async send(userId: string, groupId: string, rawBody: string): Promise<GroupMessage> {
    await this.requireMember(groupId, userId);
    if (await this.isMuted(groupId, userId)) throw new AppError('MUTED', 403, 'you are muted in this group');
    if (this.moderation && (await this.moderation.isChatMuted(userId))) {
      throw new AppError('CHAT_MUTED', 403, 'you are muted from chat');
    }
    const trimmed = rawBody.trim();
    if (!trimmed || trimmed.length > MAX_GROUP_MESSAGE_LEN) {
      throw new AppError('BAD_MESSAGE', 400, `message must be 1–${MAX_GROUP_MESSAGE_LEN} characters`);
    }
    // mask profanity on delivery; flagged messages escalate repeat offenders
    const filtered = this.moderation ? this.moderation.filter(trimmed) : { masked: trimmed, flagged: false };
    const body = filtered.masked;
    const row = await this.pool.query<{ id: string; created_at: Date; username: string }>(
      `WITH ins AS (
         INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, $3)
         RETURNING id, sender_id, created_at
       )
       SELECT ins.id, ins.created_at, u.username FROM ins JOIN users u ON u.id = ins.sender_id`,
      [groupId, userId, body],
    );
    if (filtered.flagged && this.moderation) void this.moderation.recordOffense(userId).catch(() => undefined);
    const message: GroupMessage = {
      id: row.rows[0]!.id,
      senderId: userId,
      username: row.rows[0]!.username,
      body,
      createdAt: row.rows[0]!.created_at.toISOString(),
      deleted: false,
    };
    await this.hub.publish(room(groupId), { type: 'group_msg', groupId, message }).catch(() => undefined);
    return message;
  }

  /** History — membership re-checked here, so removal revokes access at once. */
  async history(userId: string, groupId: string, before?: string, limit = 30): Promise<GroupMessage[]> {
    await this.requireMember(groupId, userId);
    // grant this member access to the live room for the WS join
    await this.hub.invite(room(groupId), userId, ROOM_TTL).catch(() => undefined);
    const rows = await this.pool.query<{
      id: string; sender_id: string; username: string; body: string; created_at: Date; deleted_at: Date | null;
    }>(
      `SELECT m.id, m.sender_id, u.username, m.body, m.created_at, m.deleted_at
         FROM group_messages m JOIN users u ON u.id = m.sender_id
        WHERE m.group_id = $1 ${before ? 'AND m.created_at < $3::timestamptz' : ''}
        ORDER BY m.created_at DESC LIMIT $2`,
      before ? [groupId, limit, before] : [groupId, limit],
    );
    return rows.rows
      .map((r) => ({
        id: r.id,
        senderId: r.sender_id,
        username: r.username,
        body: r.deleted_at ? '' : r.body,
        createdAt: r.created_at.toISOString(),
        deleted: r.deleted_at !== null,
      }))
      .reverse();
  }

  /** Delete a message: a moderator/owner (any message) or the author (own). */
  async deleteMessage(actorId: string, groupId: string, messageId: string): Promise<void> {
    const role = await this.requireMember(groupId, actorId);
    const msg = await this.pool.query<{ sender_id: string }>(
      `SELECT sender_id FROM group_messages WHERE id = $1 AND group_id = $2`,
      [messageId, groupId],
    );
    const sender = msg.rows[0]?.sender_id;
    if (!sender) throw new AppError('MESSAGE_NOT_FOUND', 404, 'no such message');
    const isStaff = role === 'owner' || role === 'moderator';
    if (!isStaff && sender !== actorId) throw new AppError('FORBIDDEN', 403, 'cannot delete that message');
    await this.pool.query(`UPDATE group_messages SET deleted_at = now() WHERE id = $1`, [messageId]);
    await this.hub.publish(room(groupId), { type: 'group_msg_deleted', groupId, id: messageId }).catch(() => undefined);
  }

  async mute(actorId: string, groupId: string, targetId: string, duration: MuteDuration): Promise<void> {
    const actorRole = await this.requireMember(groupId, actorId);
    const targetRole = await this.groups.memberRole(groupId, targetId);
    if (!targetRole) throw new AppError('BAD_TARGET', 404, 'not a member');
    if (!canManage(actorRole, targetRole)) throw new AppError('FORBIDDEN', 403, 'not allowed to mute that member');
    const until = duration === 'perm' ? null : new Date(Date.now() + (duration === '1h' ? 3600 : 86_400) * 1000);
    await this.pool.query(
      `INSERT INTO group_mutes (group_id, user_id, muted_until) VALUES ($1, $2, $3)
       ON CONFLICT (group_id, user_id) DO UPDATE SET muted_until = EXCLUDED.muted_until, created_at = now()`,
      [groupId, targetId, until],
    );
  }

  async unmute(actorId: string, groupId: string, targetId: string): Promise<void> {
    const role = await this.requireMember(groupId, actorId);
    if (role !== 'owner' && role !== 'moderator') throw new AppError('FORBIDDEN', 403, 'only staff can unmute');
    await this.pool.query(`DELETE FROM group_mutes WHERE group_id = $1 AND user_id = $2`, [groupId, targetId]);
  }

  /** Mark a group's messages read up to now. */
  async markRead(userId: string, groupId: string): Promise<void> {
    await this.requireMember(groupId, userId);
    await this.pool.query(
      `INSERT INTO group_reads (group_id, user_id, last_read_at) VALUES ($1, $2, now())
       ON CONFLICT (group_id, user_id) DO UPDATE SET last_read_at = now()`,
      [groupId, userId],
    );
  }

  /** Per-group unread counts for the caller's groups. */
  async unread(userId: string): Promise<Array<{ groupId: string; unread: number }>> {
    const rows = await this.pool.query<{ group_id: string; unread: number }>(
      `SELECT m.group_id,
              count(gm.id) FILTER (
                WHERE gm.deleted_at IS NULL AND gm.sender_id <> $1
                  AND gm.created_at > COALESCE(r.last_read_at, '-infinity'::timestamptz)
              )::int AS unread
         FROM group_members m
         LEFT JOIN group_reads r ON r.group_id = m.group_id AND r.user_id = $1
         LEFT JOIN group_messages gm ON gm.group_id = m.group_id
        WHERE m.user_id = $1
        GROUP BY m.group_id`,
      [userId],
    );
    return rows.rows.map((r) => ({ groupId: r.group_id, unread: r.unread }));
  }
}
