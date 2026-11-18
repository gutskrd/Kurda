import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { stripControlChars, type ChatGameRef, type ChatMessageExtras, type ChatMessageKind } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { assertUnrestricted } from '../moderation/restrictions.js';
import { giftCards } from '../gifts/cards.js';
import { gameRef, previewText, type KindColumns } from './kinds.js';
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

/** Moderation hook: masks profanity, tracks offences and enforces escalation mutes. */
export interface ChatModeration {
  isChatMuted(userId: string): Promise<boolean>;
  filter(text: string): { masked: string; flagged: boolean };
  recordOffense(userId: string): Promise<unknown>;
}

/** Badges hook: a message written to a friend moves the Name badge (badges/service.ts). */
export interface ChatBadges {
  onLetterSent(fromUserId: string, toUserId: string): Promise<void>;
}

/** A direct message. Most are text; a gift or a game card has a kind and its reference instead of a body. */
export interface DmMessage extends ChatMessageExtras {
  id: string;
  senderId: string;
  /** who wrote it, so a thread can show a name without a second lookup */
  username: string;
  /** already resolved (uploaded photo -> chosen avatar); null when unknown */
  avatarUrl: string | null;
  /** null for a gift or a game card */
  body: string | null;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
}

export interface Conversation {
  userId: string;
  username: string;
  avatarUrl: string | null;
  online: boolean;
  /** the text of the last message; for a gift or a game card, an English stand-in (chat/kinds.ts) */
  lastMessage: string;
  /** what the last message is, so the apps can write their own line for a gift or a game */
  lastKind: ChatMessageKind;
  lastAt: string;
  lastFromMe: boolean;
  unread: number;
}

/**
 * Direct messages between friends, up to 2000 characters of plain text. Live delivery, typing and receipts go over
 * the WebSocket gateway; the rows are the history and offline store. Blocks are silent: a message to someone who
 * blocked the sender is dropped, but the sender sees it as sent.
 */
export class ChatService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly friends: FriendService,
    private readonly notifier: Notifier,
    private readonly moderation?: ChatModeration,
    private readonly badges?: ChatBadges,
  ) {}

  async send(from: string, to: string, rawBody: string, publicUrl: PublicUrl = () => null): Promise<DmMessage> {
    if (from === to) throw new AppError('SELF_DM', 400, 'you cannot message yourself');
    const trimmed = stripControlChars(rawBody).trim();
    if (!trimmed || trimmed.length > MAX_MESSAGE_LEN) {
      throw new AppError('BAD_MESSAGE', 400, `message must be 1–${MAX_MESSAGE_LEN} characters`);
    }
    // The escalation mute applies everywhere.
    if (this.moderation && (await this.moderation.isChatMuted(from))) {
      throw new AppError('CHAT_MUTED', 403, 'you are muted from chat');
    }
    // one read for both rules: a block either way, then friendship
    const status = await this.friends.statusBetween(from, to);
    // silent block: pretend it sent, but drop it (never reveal the block)
    if (status === 'blocked') {
      return {
        id: randomUUID(),
        senderId: from,
        username: '',
        avatarUrl: null,
        body: trimmed,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
        kind: 'text',
        gift: null,
        game: null,
      };
    }
    if (status !== 'friends') {
      throw new AppError('NOT_FRIENDS', 403, 'you can only message friends');
    }

    // mask profanity on delivery; flagged messages feed repeat-offender escalation
    const filtered = this.moderation ? this.moderation.filter(trimmed) : { masked: trimmed, flagged: false };
    const body = filtered.masked;

    const { lo, hi } = canonicalPair(from, to);
    // The sender's name comes back with the insert so the notification can say who wrote, even for a first message
    // from someone not yet in the recipient's conversation list.
    const row = await this.pool.query<{
      id: string;
      created_at: Date;
      username: string;
      profile_photo_key: string | null;
      selected_avatar_key: string | null;
    }>(
      `WITH ins AS (
         INSERT INTO dm_messages (user_lo, user_hi, sender_id, body) VALUES ($1, $2, $3, $4)
         RETURNING id, created_at, sender_id
       )
       SELECT ins.id, ins.created_at, u.username, u.profile_photo_key, u.selected_avatar_key
         FROM ins JOIN users u ON u.id = ins.sender_id`,
      [lo, hi, from, body],
    );
    if (filtered.flagged && this.moderation) void this.moderation.recordOffense(from).catch(() => undefined);
    if (this.badges) void this.badges.onLetterSent(from, to).catch(() => undefined);
    const message: DmMessage = {
      id: row.rows[0]!.id,
      senderId: from,
      username: row.rows[0]!.username,
      avatarUrl: resolveAvatarUrl(row.rows[0]!.profile_photo_key, row.rows[0]!.selected_avatar_key, publicUrl),
      body,
      createdAt: row.rows[0]!.created_at.toISOString(),
      deliveredAt: null,
      readAt: null,
      kind: 'text',
      gift: null,
      game: null,
    };
    await this.notifier
      .notifyUser(to, {
        type: 'dm',
        from,
        fromUsername: row.rows[0]!.username,
        message,
      })
      .catch(() => undefined);
    return message;
  }

  /**
   * A game card from `from` to `to`: a message pointing at a lobby, so it can show the lobby's live state. The text
   * checks (length, profanity mask, trust and automated screening) are skipped as there is no text, but the rest
   * holds: friends only, a block drops it silently, and both the moderation mute (403 MUTED, asked here because a
   * card has no route of its own) and the escalation mute apply.
   */
  async sendCard(from: string, to: string, card: ChatGameRef, publicUrl: PublicUrl = () => null): Promise<DmMessage> {
    if (from === to) throw new AppError('SELF_DM', 400, 'you cannot message yourself');
    await assertUnrestricted(this.pool, from, 'chat');
    if (this.moderation && (await this.moderation.isChatMuted(from))) {
      throw new AppError('CHAT_MUTED', 403, 'you are muted from chat');
    }
    const status = await this.friends.statusBetween(from, to);
    if (status === 'blocked') {
      return {
        id: randomUUID(),
        senderId: from,
        username: '',
        avatarUrl: null,
        body: null,
        createdAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
        kind: 'game',
        gift: null,
        game: card,
      };
    }
    if (status !== 'friends') {
      throw new AppError('NOT_FRIENDS', 403, 'you can only message friends');
    }
    const { lo, hi } = canonicalPair(from, to);
    const row = await this.pool.query<{
      id: string;
      created_at: Date;
      username: string;
      profile_photo_key: string | null;
      selected_avatar_key: string | null;
    }>(
      `WITH ins AS (
         INSERT INTO dm_messages (user_lo, user_hi, sender_id, kind, game, game_lobby_id)
         VALUES ($1, $2, $3, 'game', $4, $5)
         RETURNING id, created_at, sender_id
       )
       SELECT ins.id, ins.created_at, u.username, u.profile_photo_key, u.selected_avatar_key
         FROM ins JOIN users u ON u.id = ins.sender_id`,
      [lo, hi, from, card.game, card.lobbyId],
    );
    const message: DmMessage = {
      id: row.rows[0]!.id,
      senderId: from,
      username: row.rows[0]!.username,
      avatarUrl: resolveAvatarUrl(row.rows[0]!.profile_photo_key, row.rows[0]!.selected_avatar_key, publicUrl),
      body: null,
      createdAt: row.rows[0]!.created_at.toISOString(),
      deliveredAt: null,
      readAt: null,
      kind: 'game',
      gift: null,
      game: card,
    };
    await this.notifier
      .notifyUser(to, { type: 'dm', from, fromUsername: row.rows[0]!.username, message })
      .catch(() => undefined);
    return message;
  }

  /** Paginated history, newest first before `before`; marks incoming messages delivered. */
  async history(
    user: string,
    other: string,
    before?: string,
    limit = 30,
    publicUrl: PublicUrl = () => null,
  ): Promise<DmMessage[]> {
    const { lo, hi } = canonicalPair(user, other);
    // An open thread polls this, so it is one statement: whether a block stands between them (then nothing is
    // returned or marked), the page, and their messages marked delivered. The page comes from the statement's
    // snapshot, before the marking; there is always one row carrying the flags.
    const result = await this.pool.query<
      Partial<KindColumns> & {
        blocked: boolean;
        delivered: number;
        id: string | null;
        sender_id: string;
        username: string;
        profile_photo_key: string | null;
        selected_avatar_key: string | null;
        body: string | null;
        created_at: Date;
        delivered_at: Date | null;
        read_at: Date | null;
      }
    >(
      `WITH flags AS (
         SELECT EXISTS (SELECT 1 FROM blocks
                         WHERE (blocker_id = $4 AND blocked_id = $5) OR (blocker_id = $5 AND blocked_id = $4)) AS blocked
       ), delivered AS (
         UPDATE dm_messages SET delivered_at = now()
          WHERE user_lo = $1 AND user_hi = $2 AND sender_id = $5 AND delivered_at IS NULL
            AND NOT (SELECT blocked FROM flags)
          RETURNING 1
       )
       SELECT f.blocked, (SELECT count(*)::int FROM delivered) AS delivered, page.*
         FROM flags f
         LEFT JOIN LATERAL (
           SELECT m.id, m.sender_id, u.username, u.profile_photo_key, u.selected_avatar_key,
                  m.body, m.created_at, m.delivered_at, m.read_at,
                  m.kind, m.gift_batch_id, m.game, m.game_lobby_id
             FROM dm_messages m JOIN users u ON u.id = m.sender_id
            WHERE m.user_lo = $1 AND m.user_hi = $2 ${before ? 'AND m.created_at < $6::timestamptz' : ''}
            ORDER BY m.created_at DESC LIMIT $3
         ) page ON NOT f.blocked
        ORDER BY page.created_at DESC`,
      before ? [lo, hi, limit, user, other, before] : [lo, hi, limit, user, other],
    );
    const head = result.rows[0]!;
    if (head.blocked) return [];
    if (head.delivered > 0) {
      await this.notifier.notifyUser(other, { type: 'dm_delivered', by: user }).catch(() => undefined);
    }
    const page = result.rows.filter((r): r is typeof r & KindColumns & { id: string } => r.id !== null);
    // the gifts on this page, as this reader sees them (theirs to open, or not)
    const cards = await giftCards(
      this.pool,
      page.flatMap((r) => (r.kind === 'gift' && r.gift_batch_id ? [r.gift_batch_id] : [])),
      { id: user, seesEveryone: true },
      publicUrl,
    );
    return page
      .map((r) => ({
        id: r.id,
        senderId: r.sender_id,
        username: r.username,
        avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
        body: r.body,
        createdAt: r.created_at.toISOString(),
        deliveredAt: r.delivered_at ? r.delivered_at.toISOString() : null,
        readAt: r.read_at ? r.read_at.toISOString() : null,
        kind: r.kind,
        gift: r.kind === 'gift' && r.gift_batch_id ? cards.get(r.gift_batch_id) ?? null : null,
        game: gameRef(r),
      }))
      .reverse(); // ascending for display
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

  /**
   * Typing indicator, between friends only, as messages are; otherwise anyone could reach any account's live
   * connection. Silent either way, so it reveals nothing about blocks or friendships.
   */
  async typing(from: string, to: string): Promise<void> {
    if (await this.friends.areBlocked(from, to)) return;
    if ((await this.friends.statusBetween(from, to)) !== 'friends') return;
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
      body: string | null;
      kind: ChatMessageKind;
      created_at: Date;
      sender_id: string;
      unread: number;
    }>(
      `WITH convo AS (
         SELECT *, row_number() OVER (PARTITION BY user_lo, user_hi ORDER BY created_at DESC) rn
           FROM dm_messages WHERE user_lo = $1 OR user_hi = $1
       )
       SELECT CASE WHEN c.user_lo = $1 THEN c.user_hi ELSE c.user_lo END AS other,
              u.username, u.profile_photo_key, u.selected_avatar_key, u.last_seen_at, c.body, c.kind, c.created_at, c.sender_id,
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
      lastMessage: previewText(r.kind, r.body),
      lastKind: r.kind,
      lastAt: r.created_at.toISOString(),
      lastFromMe: r.sender_id === user,
      unread: r.unread,
    }));
  }
}
