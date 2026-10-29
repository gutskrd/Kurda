import type pg from 'pg';
import { stripControlChars, type ChatGameRef, type ChatMessageExtras } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { assertUnrestricted } from '../moderation/restrictions.js';
import { gameRef, type KindColumns } from '../chat/kinds.js';
import { giftCards } from '../gifts/cards.js';
import { openGroupsAdultsOnly, type GroupService } from './service.js';
import { birthDateRequired, minorSql, writtenForSql } from '../users/age.js';
import { canManage, canModerateGroup, isRole, type GroupChatCleared, type Role } from '@kurda/shared';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { notBlockedSql } from '../friends/blocked.js';

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

/**
 * SQL: the moment before which a member sees nothing of the group's chat —
 * the later of the group's clear for everyone (`g`) and the member's own
 * (`me`, their membership) — or -infinity when neither has cleared it. Every
 * read of a group's messages for a member goes through it: the history and
 * the unread counts. Worked out in the database, at its own precision.
 */
const CLEARED_BEFORE = `COALESCE(GREATEST(g.chat_cleared_at, me.chat_cleared_at), '-infinity'::timestamptz)`;

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
 *
 * Two members with a block between them, whichever placed it, both stay in the
 * group — a block is between two people, not between a person and a group —
 * but neither sees the other's messages: not in the history, not in the
 * unread count, and not live (`hiddenFrom`).
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
  private async requireMember(groupId: string, userId: string): Promise<Role> {
    return (await this.member(groupId, userId)).role;
  }

  /**
   * `requireMember` in one read: the membership, the group's privacy and the
   * member's age, whether they are muted in the group right now (which only
   * posting asks), and what their view of the chat has had cleared (which
   * only the history answers with). Someone not in the group is told
   * GROUP_BANNED, with until when, when that is why — so a thread left open
   * as they were banned can say so — and NOT_A_MEMBER otherwise.
   */
  private async member(groupId: string, userId: string): Promise<{ role: Role; muted: boolean; username: string; cleared: GroupChatCleared }> {
    const r = await this.pool.query<{
      role: string | null; privacy: string; minor: boolean; known: boolean; muted: boolean; username: string;
      banned: boolean; until: Date | null; group_cleared_at: Date | null; group_cleared_by: string | null; my_cleared_at: Date | null;
    }>(
      `SELECT me.role, g.privacy, ${minorSql('u')} AS minor, u.birth_year IS NOT NULL AS known, u.username,
              EXISTS (SELECT 1 FROM group_mutes gm WHERE gm.group_id = g.id AND gm.user_id = u.id
                         AND (gm.muted_until IS NULL OR gm.muted_until > now())) AS muted,
              b.user_id IS NOT NULL AS banned, b.until,
              g.chat_cleared_at AS group_cleared_at, c.username AS group_cleared_by, me.chat_cleared_at AS my_cleared_at
         FROM groups g
         JOIN users u ON u.id = $2
         LEFT JOIN group_members me ON me.group_id = g.id AND me.user_id = u.id
         LEFT JOIN users c ON c.id = g.chat_cleared_by
         LEFT JOIN group_bans b ON b.group_id = g.id AND b.user_id = u.id AND (b.until IS NULL OR b.until > now())
        WHERE g.id = $1`,
      [groupId, userId],
    );
    const row = r.rows[0];
    if (!row?.role || !isRole(row.role)) {
      if (row?.banned) throw new AppError('GROUP_BANNED', 403, 'you are banned from this group', { until: row.until ? row.until.toISOString() : null });
      throw new AppError('NOT_A_MEMBER', 403, 'you are not in this group');
    }
    if (row.privacy === 'open') {
      if (row.minor) throw openGroupsAdultsOnly();
      if (!row.known) throw birthDateRequired();
    }
    const cleared: GroupChatCleared = {
      forEveryone: row.group_cleared_at ? { at: row.group_cleared_at.toISOString(), by: row.group_cleared_by } : null,
      forMe: row.my_cleared_at ? row.my_cleared_at.toISOString() : null,
    };
    return { role: row.role, muted: row.muted, username: row.username, cleared };
  }

  /**
   * Whether this person may post to the group's channel right now — not
   * restricted from chat by moderation (403 MUTED with until when, the answer
   * the message route's preHandler gives), a member who may use its chat, not
   * muted in the group, not under the escalation mute — or the refusal that
   * says why not. Text goes through it, and so does anything else posted to
   * the channel (a gift, a game card), so the rules cannot drift apart.
   */
  async assertCanPost(groupId: string, userId: string): Promise<void> {
    await assertUnrestricted(this.pool, userId, 'chat');
    if ((await this.member(groupId, userId)).muted) throw new AppError('MUTED', 403, 'you are muted in this group');
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

  /** `canRead` for each of `userIds`, in their order, in one query (the recipients of a gift). */
  async canReadEach(groupId: string, userIds: readonly string[]): Promise<boolean[]> {
    if (userIds.length === 0) return [];
    const r = await this.pool.query<{ n: number; role: string | null; privacy: string | null; minor: boolean | null; known: boolean | null }>(
      `SELECT t.n::int AS n, m.role, g.privacy, ${minorSql('u')} AS minor, u.birth_year IS NOT NULL AS known
         FROM unnest($2::uuid[]) WITH ORDINALITY AS t(id, n)
         LEFT JOIN group_members m ON m.group_id = $1 AND m.user_id = t.id
         LEFT JOIN groups g ON g.id = m.group_id
         LEFT JOIN users u ON u.id = m.user_id`,
      [groupId, userIds],
    );
    const can = userIds.map(() => false);
    for (const row of r.rows) {
      can[row.n - 1] = row.role !== null && isRole(row.role) && (row.privacy !== 'open' || (!row.minor && row.known === true));
    }
    return can;
  }

  /**
   * The members who have blocked `authorId`, or whom `authorId` has blocked:
   * whoever must not be sent what `authorId` posts to the room. The room
   * itself is everyone in the group, so the event carries these ids and the
   * gateway leaves their connections out (realtime/gateway.ts `hiddenFrom`).
   * Asked per message rather than kept anywhere, so a block or an unblock
   * counts from the next message on.
   */
  async hiddenFrom(groupId: string, authorId: string): Promise<string[]> {
    const rows = await this.pool.query<{ user_id: string }>(
      `SELECT m.user_id FROM group_members m
        WHERE m.group_id = $1 AND NOT ${notBlockedSql('m.user_id', '$2::uuid')}`,
      [groupId, authorId],
    );
    return rows.rows.map((r) => r.user_id);
  }

  /** Publish something `authorId` posted, to everyone in the room a block does not stand between. */
  private async publishFrom(groupId: string, authorId: string, event: Record<string, unknown>): Promise<void> {
    const hidden = await this.hiddenFrom(groupId, authorId);
    await this.hub.publish(room(groupId), hidden.length > 0 ? { ...event, hiddenFrom: hidden } : event);
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
    await this.publishFrom(groupId, userId, { type: 'group_msg', groupId, message }).catch(() => undefined);
    return message;
  }

  /**
   * A game card posted to the group (contract §B3): the host shared a lobby
   * here. No text, so the text pipeline is skipped; a moderation chat mute,
   * membership, the group's own mutes and an escalation mute apply exactly as
   * to a message (`assertCanPost`), and it is published to the room like one.
   */
  async sendCard(
    userId: string,
    groupId: string,
    card: ChatGameRef,
    publicUrl: PublicUrl = () => null,
  ): Promise<GroupMessage> {
    await this.assertCanPost(groupId, userId);
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
    await this.publishFrom(groupId, userId, { type: 'group_msg', groupId, message }).catch(() => undefined);
    return message;
  }

  /**
   * History — membership re-checked here, so removal revokes access at once —
   * and what this member's view has had cleared. Nothing from before the
   * later of the two clears is in it (`CLEARED_BEFORE`).
   */
  async history(
    userId: string,
    groupId: string,
    before?: string,
    limit = 30,
    publicUrl: PublicUrl = () => null,
  ): Promise<{ messages: GroupMessage[]; cleared: GroupChatCleared }> {
    const { cleared } = await this.member(groupId, userId);
    // grant this member access to the live room for the WS join
    await this.hub.invite(room(groupId), userId, ROOM_TTL).catch(() => undefined);
    // An open group is strangers. Anything a minor said in one before their
    // age was known (they are taken out when it is recorded) is shown to their
    // friends only, as their posts are (users/age.ts `writtenForSql`); in an
    // invite-only group everybody was put there by somebody they chose.
    // Nothing from somebody with a block between them and the reader, in any
    // group (friends/blocked.ts).
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
         LEFT JOIN group_members me ON me.group_id = m.group_id AND me.user_id = $3
        WHERE m.group_id = $1 AND m.created_at > ${CLEARED_BEFORE}
          AND (g.privacy <> 'open' OR ${writtenForSql('m.sender_id', '$3::uuid')})
          AND ${notBlockedSql('m.sender_id', '$3::uuid')}
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
    const messages = rows.rows
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
    return { messages, cleared };
  }

  /**
   * Clear the chat. For `me`, any member: the messages so far leave their own
   * view, and the chat is read. For `everyone`, the owner or an admin only:
   * the messages so far are deleted for every member, the chat keeps when and
   * by whom, and the room is told (`group_chat_cleared`) so every open view
   * clears at once.
   */
  async clear(userId: string, groupId: string, scope: 'me' | 'everyone'): Promise<GroupChatCleared> {
    const { role, username, cleared } = await this.member(groupId, userId);
    if (scope === 'me') {
      const r = await this.pool.query<{ at: Date }>(
        `WITH marked AS (
           INSERT INTO group_reads (group_id, user_id, last_read_at) VALUES ($1, $2, now())
           ON CONFLICT (group_id, user_id) DO UPDATE SET last_read_at = now()
         )
         UPDATE group_members SET chat_cleared_at = now() WHERE group_id = $1 AND user_id = $2 RETURNING chat_cleared_at AS at`,
        [groupId, userId],
      );
      return { ...cleared, forMe: r.rows[0]!.at.toISOString() };
    }
    if (!canModerateGroup(role)) throw new AppError('NOT_GROUP_ADMIN', 403, 'only the owner and admins can clear the chat for everyone');
    // one statement, so the messages deleted are exactly those from before the moment kept
    const r = await this.pool.query<{ at: Date }>(
      `WITH gone AS (
         UPDATE group_messages SET deleted_at = now() WHERE group_id = $1 AND created_at <= now() AND deleted_at IS NULL
       )
       UPDATE groups SET chat_cleared_at = now(), chat_cleared_by = $2 WHERE id = $1 RETURNING chat_cleared_at AS at`,
      [groupId, userId],
    );
    const at = r.rows[0]!.at.toISOString();
    await this.hub.publish(room(groupId), { type: 'group_chat_cleared', groupId, at, by: username }).catch(() => undefined);
    return { ...cleared, forEveryone: { at, by: username } };
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
    const { username } = await this.member(groupId, userId);
    if (!username) return;
    await this.publishFrom(groupId, userId, { type: 'group_typing', groupId, userId, username }).catch(() => undefined);
  }

  /**
   * Per-group unread counts for the caller's groups. A message the history
   * would not show them — from somebody with a block between them, or from
   * before a clear (`CLEARED_BEFORE`) — is not counted, or the badge would
   * announce messages that never appear.
   */
  async unread(userId: string): Promise<Array<{ groupId: string; unread: number }>> {
    const rows = await this.pool.query<{ group_id: string; unread: number }>(
      `SELECT me.group_id,
              count(gm.id) FILTER (
                WHERE gm.deleted_at IS NULL AND gm.sender_id <> $1
                  AND ${notBlockedSql('gm.sender_id', '$1::uuid')}
              )::int AS unread
         FROM group_members me
         JOIN groups g ON g.id = me.group_id
         LEFT JOIN group_reads r ON r.group_id = me.group_id AND r.user_id = $1
         LEFT JOIN group_messages gm ON gm.group_id = me.group_id
               AND gm.created_at > GREATEST(${CLEARED_BEFORE}, r.last_read_at)
        WHERE me.user_id = $1
        GROUP BY me.group_id`,
      [userId],
    );
    return rows.rows.map((r) => ({ groupId: r.group_id, unread: r.unread }));
  }
}
