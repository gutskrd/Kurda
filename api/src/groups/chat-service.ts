import type pg from 'pg';
import { stripControlChars, type ChatGameRef, type ChatMessageExtras } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { gameRef, type KindColumns } from '../chat/kinds.js';
import { giftCards } from '../gifts/cards.js';
import { openGroupsAdultsOnly, type GroupService } from './service.js';
import { birthDateRequired, minorSql, writtenForSql } from '../users/age.js';
import { canManage } from '@kurda/shared';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';

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

/**
 * A message in a group's channel: text, or a gift or a game card (shared
 * `ChatMessageExtras`) with no body. A deleted message carries nothing.
 */
export interface GroupMessage extends ChatMessageExtras {
  id: string;
  senderId: string;
  username: string;
  /** already resolved (uploaded photo -> chosen avatar); null when unknown */
  avatarUrl: string | null;
  /** null for a gift or a game card; '' once deleted */
  body: string | null;
  createdAt: string;
  deleted: boolean;
}

/** The realtime room a group's chat fans out to. */
export const groupRoom = (groupId: string): string => `group:${groupId}`;
const room = groupRoom;
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

  /**
   * Membership, and for anyone not known to be an adult an invite-only group.
   * A minor is taken out of open groups when their age is recorded; one still
   * in one (an older membership) can leave but can neither read nor write its
   * chat. An account whose age is not on record yet is asked for it first.
   */
  private async requireMember(groupId: string, userId: string): Promise<'owner' | 'moderator' | 'member'> {
    const role = await this.groups.memberRole(groupId, userId);
    if (!role) throw new AppError('NOT_A_MEMBER', 403, 'you are not in this group');
    const g = await this.pool.query<{ privacy: string; minor: boolean; known: boolean }>(
      `SELECT g.privacy, ${minorSql('u')} AS minor, u.birth_year IS NOT NULL AS known
         FROM groups g, users u WHERE g.id = $1 AND u.id = $2`,
      [groupId, userId],
    );
    const row = g.rows[0];
    if (row?.privacy === 'open') {
      if (row.minor) throw openGroupsAdultsOnly();
      if (!row.known) throw birthDateRequired();
    }
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

  /**
   * Whether this person may post to the group's channel right now — a member
   * who may use its chat, not muted in the group, not muted from chat — or
   * the refusal that says why not. Text goes through it, and so does anything
   * else posted to the channel (a gift), so the rules cannot drift apart.
   */
  async assertCanPost(groupId: string, userId: string): Promise<void> {
    await this.requireMember(groupId, userId);
    if (await this.isMuted(groupId, userId)) throw new AppError('MUTED', 403, 'you are muted in this group');
    if (this.moderation && (await this.moderation.isChatMuted(userId))) {
      throw new AppError('CHAT_MUTED', 403, 'you are muted from chat');
    }
  }

  /**
   * Whether this person may read the group's channel right now: a member, and
   * in an open group a known adult. Who a gift in the channel can go to.
   */
  async canRead(groupId: string, userId: string): Promise<boolean> {
    try {
      await this.requireMember(groupId, userId);
      return true;
    } catch (err) {
      if (err instanceof AppError) return false;
      throw err;
    }
  }

  async send(
    userId: string,
    groupId: string,
    rawBody: string,
    publicUrl: PublicUrl = () => null,
  ): Promise<GroupMessage> {
    await this.assertCanPost(groupId, userId);
    const trimmed = stripControlChars(rawBody).trim();
    if (!trimmed || trimmed.length > MAX_GROUP_MESSAGE_LEN) {
      throw new AppError('BAD_MESSAGE', 400, `message must be 1–${MAX_GROUP_MESSAGE_LEN} characters`);
    }
    // mask profanity on delivery; flagged messages escalate repeat offenders
    const filtered = this.moderation ? this.moderation.filter(trimmed) : { masked: trimmed, flagged: false };
    const body = filtered.masked;
    const row = await this.pool.query<{
      id: string; created_at: Date; username: string;
      profile_photo_key: string | null; selected_avatar_key: string | null;
    }>(
      `WITH ins AS (
         INSERT INTO group_messages (group_id, sender_id, body) VALUES ($1, $2, $3)
         RETURNING id, sender_id, created_at
       )
       SELECT ins.id, ins.created_at, u.username, u.profile_photo_key, u.selected_avatar_key
         FROM ins JOIN users u ON u.id = ins.sender_id`,
      [groupId, userId, body],
    );
    if (filtered.flagged && this.moderation) void this.moderation.recordOffense(userId).catch(() => undefined);
    const message: GroupMessage = {
      id: row.rows[0]!.id,
      senderId: userId,
      username: row.rows[0]!.username,
      avatarUrl: resolveAvatarUrl(row.rows[0]!.profile_photo_key, row.rows[0]!.selected_avatar_key, publicUrl),
      body,
      createdAt: row.rows[0]!.created_at.toISOString(),
      deleted: false,
      kind: 'text',
      gift: null,
      game: null,
    };
    await this.hub.publish(room(groupId), { type: 'group_msg', groupId, message }).catch(() => undefined);
    return message;
  }

  /**
   * A game card posted to the group (contract §B3): the host shared a lobby
   * here. No text, so the text pipeline is skipped; membership, the group's
   * own mutes and an escalation mute apply exactly as to a message, and it is
   * published to the room like one.
   */
  async sendCard(
    userId: string,
    groupId: string,
    card: ChatGameRef,
    publicUrl: PublicUrl = () => null,
  ): Promise<GroupMessage> {
    await this.requireMember(groupId, userId);
    if (await this.isMuted(groupId, userId)) throw new AppError('MUTED', 403, 'you are muted in this group');
    if (this.moderation && (await this.moderation.isChatMuted(userId))) {
      throw new AppError('CHAT_MUTED', 403, 'you are muted from chat');
    }
    const row = await this.pool.query<{
      id: string; created_at: Date; username: string;
      profile_photo_key: string | null; selected_avatar_key: string | null;
    }>(
      `WITH ins AS (
         INSERT INTO group_messages (group_id, sender_id, kind, game, game_lobby_id)
         VALUES ($1, $2, 'game', $3, $4)
         RETURNING id, sender_id, created_at
       )
       SELECT ins.id, ins.created_at, u.username, u.profile_photo_key, u.selected_avatar_key
         FROM ins JOIN users u ON u.id = ins.sender_id`,
      [groupId, userId, card.game, card.lobbyId],
    );
    const message: GroupMessage = {
      id: row.rows[0]!.id,
      senderId: userId,
      username: row.rows[0]!.username,
      avatarUrl: resolveAvatarUrl(row.rows[0]!.profile_photo_key, row.rows[0]!.selected_avatar_key, publicUrl),
      body: null,
      createdAt: row.rows[0]!.created_at.toISOString(),
      deleted: false,
      kind: 'game',
      gift: null,
      game: card,
    };
    await this.hub.publish(room(groupId), { type: 'group_msg', groupId, message }).catch(() => undefined);
    return message;
  }

  /** History — membership re-checked here, so removal revokes access at once. */
  async history(
    userId: string,
    groupId: string,
    before?: string,
    limit = 30,
    publicUrl: PublicUrl = () => null,
  ): Promise<GroupMessage[]> {
    await this.requireMember(groupId, userId);
    // grant this member access to the live room for the WS join
    await this.hub.invite(room(groupId), userId, ROOM_TTL).catch(() => undefined);
    // An open group is strangers. Anything a minor said in one before their
    // age was known (they are taken out when it is recorded) is shown to their
    // friends only, as their posts are (users/age.ts `writtenForSql`); in an
    // invite-only group everybody was put there by somebody they chose.
    const rows = await this.pool.query<
      KindColumns & {
        id: string; sender_id: string; username: string; profile_photo_key: string | null;
        selected_avatar_key: string | null; body: string | null; created_at: Date; deleted_at: Date | null;
        privacy: string;
      }
    >(
      `SELECT m.id, m.sender_id, u.username, u.profile_photo_key, u.selected_avatar_key,
              m.body, m.created_at, m.deleted_at, m.kind, m.gift_batch_id, m.game, m.game_lobby_id, g.privacy
         FROM group_messages m JOIN users u ON u.id = m.sender_id JOIN groups g ON g.id = m.group_id
        WHERE m.group_id = $1
          AND (g.privacy <> 'open' OR ${writtenForSql('m.sender_id', '$3::uuid')})
          ${before ? 'AND m.created_at < $4::timestamptz' : ''}
        ORDER BY m.created_at DESC LIMIT $2`,
      before ? [groupId, limit, userId, before] : [groupId, limit, userId],
    );
    // The gifts on this page as this member sees them: their own to open, and
    // the other recipients named by the roster's rule — everyone, to a member
    // of an invite-only group (the reader is one: checked above).
    const cards = await giftCards(
      this.pool,
      rows.rows.flatMap((r) => (r.kind === 'gift' && r.gift_batch_id && !r.deleted_at ? [r.gift_batch_id] : [])),
      { id: userId, seesEveryone: rows.rows[0]?.privacy === 'invite' },
      publicUrl,
    );
    return rows.rows
      .map((r) => {
        const live = r.deleted_at === null;
        return {
          id: r.id,
          senderId: r.sender_id,
          username: r.username,
          avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
          body: live ? r.body : '',
          createdAt: r.created_at.toISOString(),
          deleted: !live,
          kind: r.kind,
          gift: live && r.kind === 'gift' && r.gift_batch_id ? cards.get(r.gift_batch_id) ?? null : null,
          game: live ? gameRef(r) : null,
        };
      })
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

  /**
   * Announce that someone is typing in the channel.
   *
   * Ephemeral: nothing is stored, it is published to the room and forgotten, so a
   * missed ping costs nothing and there is no state to clean up. Membership is
   * re-checked so a removed member cannot keep pinging a group they left.
   *
   * The username rides along because receivers need a name to show and the
   * event is not worth a lookup per keystroke on the client.
   */
  async typing(userId: string, groupId: string): Promise<void> {
    await this.requireMember(groupId, userId);
    const who = await this.pool.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [userId]);
    const username = who.rows[0]?.username;
    if (!username) return;
    await this.hub
      .publish(room(groupId), { type: 'group_typing', groupId, userId, username })
      .catch(() => undefined);
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
