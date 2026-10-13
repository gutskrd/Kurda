import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  GIFT_MIN_FRIENDSHIP_HOURS,
  GIFTS_PER_DAY,
  GIFTS_PER_FRIEND_PER_DAY,
  MAX_GIFT_RECIPIENTS,
  giftTierFor,
  type EquippableCategory,
  type GiftCard,
  type GiftCatalogItem,
  type GiftChatRef,
  type GiftUserEvent,
  type SendGiftResult,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { assertUnrestricted } from '../moderation/restrictions.js';
import { canonicalPair } from '../friends/pair.js';
import type { FriendService } from '../friends/service.js';
import { cosmeticAssetUrl, resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { isPurchasable, lockEntitlement, type ItemRow, type ShopService } from '../shop/service.js';
import type { Currency, WalletService } from '../wallet/service.js';
import type { DmMessage } from '../chat/service.js';
import { groupRoom, type GroupChatService, type GroupMessage } from '../groups/chat-service.js';
import type { Notification } from '../push/service.js';
import { notKnownAdultSql } from '../users/age.js';
import { batchChat, giftCards, type BatchChat, type CardViewer } from './cards.js';

export type SkipReason = SendGiftResult['skipped'][number]['reason'];

export interface SendGiftInput {
  fromId: string;
  toIds: readonly string[];
  sku: string;
  /**
   * Where the gift is posted: the direct message with its one recipient, or a
   * group's channel. Null from the shop, where it goes to the direct message
   * with its one recipient too — every gift lives in a chat.
   */
  chat: GiftChatRef | null;
  /** the request's retry key; each recipient's gift is keyed `${key}:${recipient}` */
  idempotencyKey: string;
  /** the price the sender was shown; refused if it has changed */
  expectedPrice?: number;
}

export interface SendGiftOutcome extends SendGiftResult {
  /** nothing happened this time: every recipient already had this request's gift */
  duplicate: boolean;
  item: { sku: string; name: string; price: number; currency: Currency };
  /** the gift message as the sender sees it, when this call posted one */
  message: DmMessage | GroupMessage | null;
}

/** Just enough of the realtime gateway: a user's own channel, and a group's room. */
export interface GiftRealtime {
  notifyUser(userId: string, event: Record<string, unknown> & { type: string }): Promise<void>;
  publish(room: string, event: Record<string, unknown> & { type: string }): Promise<void>;
}

export interface GiftDeps {
  wallet: WalletService;
  shop: ShopService;
  friends: FriendService;
  groupChat: GroupChatService;
  realtime: GiftRealtime;
  inbox?: { record(userId: string, notification: Notification): Promise<void> };
  /** the escalation mute (KUR-086), which a gift answers to as a message does */
  moderation?: { isChatMuted(userId: string): Promise<boolean> };
  log?: { warn: (obj: unknown, msg: string) => void };
}

/** The per-recipient key a gift row is stored under: one request, one gift each. */
export const recipientKey = (key: string, toId: string): string => `${key}:${toId}`;

interface Sender {
  username: string;
  avatarUrl: string;
}

interface Posted {
  id: string;
  createdAt: Date;
}

/** What one send settled, inside its transaction, for the work after it. */
interface Settled {
  /** every recipient already had this request's gift: nothing was done */
  replay: boolean;
  batchId: string;
  item: SendGiftOutcome['item'];
  /** recipients who have this request's gift, in the order asked — the earlier attempts' too */
  sent: string[];
  /** recipients given it by this call, with their gift's id */
  given: Array<{ toId: string; giftId: string }>;
  skipped: SendGiftResult['skipped'];
  posted: Posted | null;
}

/**
 * Gifts: an item from the shop, bought for friends, that arrives in a chat as
 * a wrapped present (shared `gifts.ts` for what this is careful about).
 *
 * One way to send for every door — the shop's gift button, and the gift
 * button in a direct message or a group — so there is one set of rules:
 *
 * - **Friends only.** Anyone else is refused outright, as a direct message is.
 * - **A day of friendship first**, between anyone who is not a known adult:
 *   the "add, gift, groom" pattern is the one a fresh friendship allows. The
 *   minor rules mean every such friendship is one the minor started, which
 *   is why it is a wait rather than a refusal.
 * - **A daily cap**, per sender and per pair, over the last 24 hours rather
 *   than since midnight — midnight is the sender's, and the cap is for the
 *   recipient. A gift is a present, not a stream.
 * - **Not something they own already** (a unique item), decided under a lock
 *   (`lockEntitlement`) so two friends gifting it at once cannot both win.
 * - **Never free.** A price-0 item cannot be gifted: it would be a way to put
 *   a notification in front of someone at no cost and without limit.
 * - **Not while muted from chat.** A gift is a message in the chat, so a chat
 *   mute stops it as it stops text, with the same answer (403 MUTED and until
 *   when, then the escalation mute's CHAT_MUTED) — otherwise someone muted for
 *   harassing a person could keep putting things in front of them.
 *
 * A friend a rule turns away is skipped, and the answer says which and why
 * (they are friends of the sender, so saying is safe); the rest still get it.
 * Everything that changes — the debits, the items, the gift rows, the chat
 * message — is one transaction: a gift happens completely or not at all.
 * Telling people (realtime, the inbox) happens after it commits, and a
 * failure there never undoes a present.
 */
export class GiftService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: GiftDeps,
    private readonly publicUrl: PublicUrl = () => null,
  ) {}

  async send(input: SendGiftInput, now: Date = new Date()): Promise<SendGiftOutcome> {
    const { fromId, chat } = input;
    const toIds = [...new Set(input.toIds)];
    if (toIds.includes(fromId)) throw new AppError('GIFT_TO_SELF', 400, 'you cannot gift to yourself');
    if (toIds.length === 0 || toIds.length > MAX_GIFT_RECIPIENTS) {
      throw new AppError('BAD_RECIPIENTS', 400, `a gift goes to 1–${MAX_GIFT_RECIPIENTS} friends`);
    }
    // a direct message has one other person in it; the shop gifts one friend
    if (chat?.kind !== 'group' && (toIds.length !== 1 || (chat?.kind === 'dm' && chat.userId !== toIds[0]))) {
      throw new AppError('BAD_RECIPIENTS', 400, 'a gift here goes to the one friend you are talking to');
    }
    // muted from chat: refused as a message would be (a group's own rules,
    // the escalation mute among them, are asked by assertCanPost below)
    await assertUnrestricted(this.pool, fromId, 'chat');
    if (chat?.kind !== 'group' && this.deps.moderation && (await this.deps.moderation.isChatMuted(fromId))) {
      throw new AppError('CHAT_MUTED', 403, 'you are muted from chat');
    }

    const statuses = await Promise.all(toIds.map((to) => this.deps.friends.statusBetween(fromId, to)));
    if (statuses.some((s) => s !== 'friends')) {
      throw new AppError('NOT_FRIENDS', 403, 'you can only send gifts to friends');
    }

    // In a group the gift is a message in its channel: the sender must be able
    // to post there, and each recipient must be someone who reads it.
    let groupPrivacy: string | null = null;
    const outsideGroup = new Set<string>();
    if (chat?.kind === 'group') {
      await this.deps.groupChat.assertCanPost(chat.groupId, fromId);
      const readers = await Promise.all(toIds.map((to) => this.deps.groupChat.canRead(chat.groupId, to)));
      toIds.forEach((to, i) => {
        if (!readers[i]) outsideGroup.add(to);
      });
      groupPrivacy =
        (await this.pool.query<{ privacy: string }>(`SELECT privacy FROM groups WHERE id = $1`, [chat.groupId])).rows[0]
          ?.privacy ?? null;
    }

    const settled = await this.settle(input, toIds, outsideGroup, now);

    // Telling people comes straight after the commit, and on its own. The
    // gift has happened, and a retry of this request replays it without
    // telling anyone, so nothing the sender's answer needs (their balance,
    // their view of the message) may fail first and leave the friends never
    // told of a present that is theirs.
    if (settled.given.length > 0) {
      await this.deliver(settled, input, groupPrivacy).catch((err) =>
        this.deps.log?.warn({ err, batchId: settled.batchId }, 'a gift was given but telling people failed'),
      );
    }

    const balance = await this.deps.wallet.balances(fromId);
    const message = settled.posted ? await this.senderView(settled, input, groupPrivacy) : null;

    return {
      batchId: settled.batchId,
      sent: settled.sent,
      skipped: settled.skipped,
      balance,
      duplicate: settled.replay,
      item: settled.item,
      message,
    };
  }

  /** The transaction: every rule, every debit and grant, and the message. */
  private async settle(
    input: SendGiftInput,
    toIds: string[],
    outsideGroup: ReadonlySet<string>,
    now: Date,
  ): Promise<Settled> {
    const { fromId, sku, chat, idempotencyKey, expectedPrice } = input;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // One send at a time per sender. The daily cap is a count, and two sends
      // counted side by side would both fit under it; a retry arriving while
      // its first attempt is still running waits here, then finds that
      // attempt's gifts below instead of failing on them.
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`gift-send:${fromId}`]);

      // Before anything else: which of these recipients already have this
      // request's gift? A retry must be recognised first, or the owns-it check
      // would report that a friend owns the very item the first try gave them.
      const prior = await client.query<{ to_user_id: string; batch_id: string; sku: string }>(
        `SELECT to_user_id, batch_id, sku FROM gifts
          WHERE from_user_id = $1 AND idempotency_key = ANY($2::text[])`,
        [fromId, toIds.map((to) => recipientKey(idempotencyKey, to))],
      );
      // A retry is the same request: the same item, one gift it made, and the
      // same chat. A key matched on its own would let a send in one chat add
      // friends to a gift posted in another — listed on a card in a chat they
      // are not in, to people who may not see their name, and told of a gift
      // in a chat that never got its message.
      const reused = () => new AppError('IDEMPOTENCY_REUSED', 409, 'that request key was already used');
      if (prior.rows.some((r) => r.sku !== sku)) throw reused();
      if (new Set(prior.rows.map((r) => r.batch_id)).size > 1) throw reused();
      if (prior.rows.length > 0 && !postedIn(await batchChat(client, prior.rows[0]!.batch_id), chat, fromId, toIds[0]!)) {
        throw reused();
      }
      const had = new Set(prior.rows.map((r) => r.to_user_id));
      const batchId = prior.rows[0]?.batch_id ?? randomUUID();

      const item = (await client.query<ItemRow>(`SELECT * FROM shop_items WHERE sku = $1`, [sku])).rows[0];
      if (!item) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
      const summary = { sku: item.sku, name: item.name, price: item.price, currency: item.currency };

      // a full replay: the stored result, whatever the catalog says now
      if (toIds.every((to) => had.has(to))) {
        await client.query('COMMIT');
        return { replay: true, batchId, item: summary, sent: toIds, given: [], skipped: [], posted: null };
      }

      if (!isPurchasable(item, now)) throw new AppError('ITEM_UNAVAILABLE', 409, 'item is not available');
      if (item.price <= 0) throw new AppError('NOT_GIFTABLE', 409, 'this item cannot be given as a gift');
      if (expectedPrice != null && item.price !== expectedPrice) {
        throw new AppError('PRICE_CHANGED', 409, 'the price changed; please review and try again');
      }

      const skipped: SendGiftResult['skipped'] = [];
      const skip = (userId: string, reason: SkipReason) => skipped.push({ userId, reason });
      let candidates = toIds.filter((to) => !had.has(to));

      // a member of the group the gift is posted in, and a friendship old enough
      const notYet = await this.notYetAllowed(client, fromId, candidates);
      candidates = candidates.filter((to) => {
        const allowed = !outsideGroup.has(to) && !notYet.has(to);
        if (!allowed) skip(to, 'not_allowed');
        return allowed;
      });

      // Each recipient's item is changed under its lock, all of them taken
      // here and in one order (by id). For something there is only one of,
      // that is what makes "they own it already" true when it is decided. For
      // anything else it is what keeps two people giving the same thing to
      // the same friends, listed the other way round, from each holding one
      // friend's item while waiting for the other's: a deadlock, and a gift
      // that fails. The grants below can then go in the order asked.
      for (const to of [...candidates].sort()) await lockEntitlement(client, to, sku);

      // something there is only one of, which they own already
      if (item.is_unique && candidates.length > 0) {
        const owned = await client.query<{ user_id: string }>(
          `SELECT user_id FROM user_entitlements WHERE sku = $1 AND user_id = ANY($2::uuid[])`,
          [sku, candidates],
        );
        const owners = new Set(owned.rows.map((r) => r.user_id));
        candidates = candidates.filter((to) => {
          if (owners.has(to)) skip(to, 'already_owned');
          return !owners.has(to);
        });
      }

      // the caps, over the last 24 hours, counting each recipient as one gift
      const recent = await client.query<{ to_user_id: string; n: number }>(
        `SELECT to_user_id, count(*)::int AS n FROM gifts
          WHERE from_user_id = $1 AND created_at > now() - interval '24 hours'
          GROUP BY to_user_id`,
        [fromId],
      );
      const perFriend = new Map(recent.rows.map((r) => [r.to_user_id, r.n]));
      let today = recent.rows.reduce((n, r) => n + r.n, 0);
      candidates = candidates.filter((to) => {
        const theirs = perFriend.get(to) ?? 0;
        if (today >= GIFTS_PER_DAY || theirs >= GIFTS_PER_FRIEND_PER_DAY) {
          skip(to, 'daily_limit');
          return false;
        }
        today += 1;
        perFriend.set(to, theirs + 1);
        return true;
      });

      const given: Settled['given'] = [];
      for (const to of candidates) {
        const giftId = randomUUID();
        // the ledger says 'gift', so gifts can be told from purchases; one
        // debit per recipient, each with its own key, so a retry pays nothing
        const debit = await this.deps.wallet.debitWithin(client, {
          userId: fromId,
          currency: item.currency,
          amount: item.price,
          reason: 'gift',
          refId: giftId,
          idempotencyKey: `gift:${fromId}:${recipientKey(idempotencyKey, to)}`,
        });
        if (debit.duplicate) throw reused();
        await client.query(
          `INSERT INTO user_entitlements (user_id, sku, source)
           VALUES ($1, $2, 'gift')
           ON CONFLICT (user_id, sku) DO UPDATE SET quantity = user_entitlements.quantity + 1`,
          [to, sku],
        );
        // clock_timestamp, not now(): the recipients of one gift keep the order
        // they were given it in, which is the order its card lists them in
        await client.query(
          `INSERT INTO gifts (id, from_user_id, to_user_id, sku, price, currency, idempotency_key, batch_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp())`,
          [giftId, fromId, to, sku, item.price, item.currency, recipientKey(idempotencyKey, to), batchId],
        );
        given.push({ toId: to, giftId });
      }

      // One message for the whole send, when this call is the one that made the
      // batch. A retry that reaches a friend the first attempt skipped adds
      // them to the batch, and the message already there shows them.
      let posted: Posted | null = null;
      if (given.length > 0 && prior.rows.length === 0) posted = await this.post(client, fromId, given[0]!.toId, chat, batchId);

      await client.query('COMMIT');
      const sentSet = new Set([...had, ...given.map((g) => g.toId)]);
      return {
        replay: false,
        batchId,
        item: summary,
        sent: toIds.filter((to) => sentSet.has(to)),
        given,
        skipped,
        posted,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Of these friends, the ones a gift cannot pass to yet: the friendship is
   * younger than `GIFT_MIN_FRIENDSHIP_HOURS` and the sender or the friend is
   * not a known adult (a minor, or someone whose age is not on record) —
   * measured from when it was accepted, or made if that was never recorded.
   * And, read here inside the transaction, any who stopped being a friend
   * since the check at the door.
   */
  private async notYetAllowed(client: pg.PoolClient, fromId: string, toIds: string[]): Promise<Set<string>> {
    if (toIds.length === 0) return new Set();
    const rows = await client.query<{ id: string; waits: boolean }>(
      `SELECT u.id,
              f.user_lo IS NULL
              OR ((${notKnownAdultSql('u')} OR ${notKnownAdultSql('s')})
                  AND COALESCE(f.responded_at, f.created_at) > now() - make_interval(hours => $3)) AS waits
         FROM users u
         JOIN users s ON s.id = $1
         LEFT JOIN friendships f ON f.status = 'accepted'
          AND f.user_lo = LEAST(u.id, s.id) AND f.user_hi = GREATEST(u.id, s.id)
        WHERE u.id = ANY($2::uuid[])`,
      [fromId, toIds, GIFT_MIN_FRIENDSHIP_HOURS],
    );
    return new Set(rows.rows.filter((r) => r.waits).map((r) => r.id));
  }

  /** The gift's one chat message, in the send's transaction. */
  private async post(
    client: pg.PoolClient,
    fromId: string,
    firstTo: string,
    chat: GiftChatRef | null,
    batchId: string,
  ): Promise<Posted> {
    let row: pg.QueryResult<{ id: string; created_at: Date }>;
    if (chat?.kind === 'group') {
      row = await client.query(
        `INSERT INTO group_messages (group_id, sender_id, kind, gift_batch_id)
         VALUES ($1, $2, 'gift', $3) RETURNING id, created_at`,
        [chat.groupId, fromId, batchId],
      );
    } else {
      const { lo, hi } = canonicalPair(fromId, firstTo);
      row = await client.query(
        `INSERT INTO dm_messages (user_lo, user_hi, sender_id, kind, gift_batch_id)
         VALUES ($1, $2, $3, 'gift', $4) RETURNING id, created_at`,
        [lo, hi, fromId, batchId],
      );
    }
    return { id: row.rows[0]!.id, createdAt: row.rows[0]!.created_at };
  }

  private async sender(userId: string): Promise<Sender> {
    const r = await this.pool.query<{ username: string; profile_photo_key: string | null; selected_avatar_key: string | null }>(
      `SELECT username, profile_photo_key, selected_avatar_key FROM users WHERE id = $1`,
      [userId],
    );
    const u = r.rows[0];
    return {
      username: u?.username ?? '',
      avatarUrl: resolveAvatarUrl(u?.profile_photo_key ?? null, u?.selected_avatar_key ?? null, this.publicUrl),
    };
  }

  /** One viewer's card for a batch (`seesEveryone`: see `CardViewer`). */
  private async card(batchId: string, viewer: CardViewer): Promise<GiftCard | null> {
    return (await giftCards(this.pool, [batchId], viewer, this.publicUrl)).get(batchId) ?? null;
  }

  /** The chat message as one viewer sees it. */
  private message(
    posted: Posted,
    fromId: string,
    sender: Sender,
    card: GiftCard | null,
    chat: 'dm' | 'group',
  ): DmMessage | GroupMessage {
    const base = {
      id: posted.id,
      senderId: fromId,
      username: sender.username,
      avatarUrl: sender.avatarUrl,
      body: null,
      createdAt: posted.createdAt.toISOString(),
      kind: 'gift' as const,
      gift: card,
      game: null,
    };
    return chat === 'group' ? { ...base, deleted: false } : { ...base, deliveredAt: null, readAt: null };
  }

  private async senderView(
    settled: Settled,
    input: SendGiftInput,
    groupPrivacy: string | null,
  ): Promise<DmMessage | GroupMessage> {
    const inGroup = input.chat?.kind === 'group';
    const sender = await this.sender(input.fromId);
    const card = await this.card(settled.batchId, {
      id: input.fromId,
      seesEveryone: !inGroup || groupPrivacy === 'invite',
    });
    return this.message(settled.posted!, input.fromId, sender, card, inGroup ? 'group' : 'dm');
  }

  /**
   * After the commit: the message where it was posted, a `gift_received` to
   * each recipient with their own card, and a line in their notifications.
   *
   * A group room is read by everyone in it at once, so the card published
   * there is no one's in particular (nobody is "me" on it); each recipient's
   * own card — theirs to open — comes with their `gift_received`. Names on the
   * room's card are safe for every member: in an invite-only group members see
   * one another, and in an open group a recipient has to be someone who may
   * read its chat, which only a known adult may.
   */
  private async deliver(settled: Settled, input: SendGiftInput, groupPrivacy: string | null): Promise<void> {
    const { fromId, chat } = input;
    const { realtime, inbox } = this.deps;
    const sender = await this.sender(fromId);
    const warn = (what: string) => (err: unknown) => this.deps.log?.warn({ err, batchId: settled.batchId }, what);
    const inGroup = chat?.kind === 'group';

    if (settled.posted && chat?.kind === 'group') {
      const roomCard = await this.card(settled.batchId, { id: null, seesEveryone: groupPrivacy === 'invite' });
      const message = this.message(settled.posted, fromId, sender, roomCard, 'group');
      await realtime
        .publish(groupRoom(chat.groupId), { type: 'group_msg', groupId: chat.groupId, message })
        .catch(warn('gift message not published to the group'));
    }

    for (const { toId, giftId } of settled.given) {
      const card = await this.card(settled.batchId, { id: toId, seesEveryone: !inGroup || groupPrivacy === 'invite' });
      if (!card) continue;
      if (settled.posted && !inGroup) {
        const message = this.message(settled.posted, fromId, sender, card, 'dm');
        await realtime
          .notifyUser(toId, { type: 'dm', from: fromId, fromUsername: sender.username, message })
          .catch(warn('gift message not pushed'));
      }
      const where: GiftChatRef = chat?.kind === 'group' ? chat : { kind: 'dm', userId: fromId };
      const event: GiftUserEvent = {
        type: 'gift_received',
        giftId,
        batchId: settled.batchId,
        from: { name: sender.username, avatarUrl: sender.avatarUrl },
        card,
        chat: where,
      };
      await realtime.notifyUser(toId, event).catch(warn('gift_received not pushed'));
      // English for the notification list; the apps write their own words from `data`
      await inbox
        ?.record(toId, {
          category: 'friends',
          title: 'You have a gift',
          body: `${sender.username || 'Someone'} sent you ${settled.item.name}.`,
          data: {
            kind: 'gift',
            giftId,
            batchId: settled.batchId,
            chat: where.kind === 'group' ? `group:${where.groupId}` : `dm:${fromId}`,
            sku: settled.item.sku,
            fromUserId: fromId,
          },
        })
        .catch(warn('gift notification not recorded'));
    }
  }

  /**
   * The recipient unwraps their gift: it is opened (and seen, which clears the
   * badge), and the card comes back with what they can put on. The sender
   * hears about it once — `gift_opened` on their own channel, unless a block
   * now stands between them — and so does a group the gift is in
   * (`group_msg_gift_opened {groupId, messageId, batchId}`), so every
   * member's card can show it; the card itself is per viewer, so members
   * fetch theirs (`GET /gifts/batches/:batchId`) rather than being sent one.
   */
  async open(userId: string, giftId: string): Promise<{ card: GiftCard; equippable: EquippableCategory | null }> {
    const opened = await this.pool.query<{ batch_id: string; from_user_id: string | null }>(
      `UPDATE gifts SET opened_at = now(), seen_at = COALESCE(seen_at, now())
        WHERE id = $1 AND to_user_id = $2 AND opened_at IS NULL
        RETURNING batch_id, from_user_id`,
      [giftId, userId],
    );
    let batchId = opened.rows[0]?.batch_id;
    if (!batchId) {
      // opened before (opening twice is not an error), or not theirs to open
      const mine = await this.pool.query<{ batch_id: string }>(
        `SELECT batch_id FROM gifts WHERE id = $1 AND to_user_id = $2`,
        [giftId, userId],
      );
      batchId = mine.rows[0]?.batch_id;
      if (!batchId) throw giftNotFound();
    }

    const where = await batchChat(this.pool, batchId);
    const card = await this.card(batchId, { id: userId, seesEveryone: await this.seesEveryone(where, userId) });
    if (!card) throw giftNotFound();

    const first = opened.rows[0];
    if (first) {
      const warn = (err: unknown) => this.deps.log?.warn({ err, giftId }, 'gift opened, but telling people failed');
      const from = first.from_user_id;
      if (from) {
        // Not when a block now stands between the two of them: opening a
        // present is the recipient's activity, which a block keeps from the
        // other side. Silently, as a block is — the gift opens all the same.
        const event: GiftUserEvent = { type: 'gift_opened', batchId, giftId };
        await this.deps.friends
          .areBlocked(userId, from)
          .then((blocked) => (blocked ? undefined : this.deps.realtime.notifyUser(from, event)))
          .catch(warn);
      }
      if (where?.kind === 'group') {
        await this.deps.realtime
          .publish(groupRoom(where.groupId), {
            type: 'group_msg_gift_opened',
            groupId: where.groupId,
            messageId: where.messageId,
            batchId,
          })
          .catch(warn);
      }
    }
    return { card, equippable: card.equippable };
  }

  /**
   * One gift card, for someone who can see the message it is on: its sender,
   * a recipient, or someone who reads the group it was posted in. Anyone else
   * is told there is no such gift.
   *
   * A gift between two people — in their direct messages, or from the shop
   * before gifts were in the chat — is part of their conversation, and a
   * block between them hides it from both as it hides the thread: otherwise
   * the person blocked could keep asking for the card, and read on it the
   * other's name, current picture, and whether they have opened it. A group's
   * gifts follow the group, which a block between two members does not hide.
   */
  async batchCard(viewerId: string, batchId: string): Promise<GiftCard> {
    const rows = await this.pool.query<{ from_user_id: string | null; to_user_id: string }>(
      `SELECT from_user_id, to_user_id FROM gifts WHERE batch_id = $1`,
      [batchId],
    );
    if (rows.rows.length === 0) throw giftNotFound();
    const gave = rows.rows.some((r) => r.from_user_id === viewerId);
    const party = gave || rows.rows.some((r) => r.to_user_id === viewerId);
    const where = await batchChat(this.pool, batchId);
    if (where?.kind === 'group') {
      if (!party && !(await this.deps.groupChat.canRead(where.groupId, viewerId))) throw giftNotFound();
    } else {
      if (!party) throw giftNotFound();
      const others = gave ? rows.rows.map((r) => r.to_user_id) : rows.rows.flatMap((r) => r.from_user_id ?? []);
      const blocked = await Promise.all(others.map((other) => this.deps.friends.areBlocked(viewerId, other)));
      if (blocked.some(Boolean)) throw giftNotFound();
    }
    const card = await this.card(batchId, { id: viewerId, seesEveryone: await this.seesEveryone(where, viewerId) });
    if (!card) throw giftNotFound();
    return card;
  }

  /** The roster rule for a card: everyone in a direct message, and to a member of an invite-only group. */
  private async seesEveryone(where: Awaited<ReturnType<typeof batchChat>>, viewerId: string): Promise<boolean> {
    if (where?.kind !== 'group') return true;
    const r = await this.pool.query<{ sees: boolean }>(
      `SELECT g.privacy = 'invite' AND EXISTS (
                SELECT 1 FROM group_members m WHERE m.group_id = g.id AND m.user_id = $2) AS sees
         FROM groups g WHERE g.id = $1`,
      [where.groupId, viewerId],
    );
    return r.rows[0]?.sees ?? false;
  }

  /**
   * What the sender can give these friends: everything on sale now with a
   * price, and for something there is only one of, which of them own it
   * already — so the picker can say so instead of the send refusing. Friends
   * only, like sending; the sender's balance rides along.
   */
  async catalog(
    fromId: string,
    toIds: readonly string[],
    now: Date = new Date(),
  ): Promise<{ items: GiftCatalogItem[]; balance: { zer: number; gems: number } }> {
    const ids = [...new Set(toIds)];
    if (ids.includes(fromId)) throw new AppError('GIFT_TO_SELF', 400, 'you cannot gift to yourself');
    if (ids.length === 0 || ids.length > MAX_GIFT_RECIPIENTS) {
      throw new AppError('BAD_RECIPIENTS', 400, `a gift goes to 1–${MAX_GIFT_RECIPIENTS} friends`);
    }
    const statuses = await Promise.all(ids.map((to) => this.deps.friends.statusBetween(fromId, to)));
    if (statuses.some((s) => s !== 'friends')) {
      throw new AppError('NOT_FRIENDS', 403, 'you can only send gifts to friends');
    }

    const items = (await this.deps.shop.liveItems(now)).filter((i) => i.price > 0);
    const unique = items.filter((i) => i.isUnique).map((i) => i.sku);
    const owned = await this.pool.query<{ user_id: string; sku: string }>(
      `SELECT user_id, sku FROM user_entitlements WHERE user_id = ANY($1::uuid[]) AND sku = ANY($2::text[])`,
      [ids, unique],
    );
    const owners = new Map<string, string[]>();
    for (const r of owned.rows) owners.set(r.sku, [...(owners.get(r.sku) ?? []), r.user_id]);

    return {
      items: items.map((i) => ({
        sku: i.sku,
        name: i.name,
        category: i.category,
        assetUrl: cosmeticAssetUrl(i.category, i.assetKey),
        currency: i.currency,
        price: i.price,
        tier: giftTierFor({ currency: i.currency, price: i.price, limited: i.availableTo !== null }),
        // in the order asked, so the picker can line it up with its chips
        alreadyOwnedBy: ids.filter((id) => owners.get(i.sku)?.includes(id)),
      })),
      balance: await this.deps.wallet.balances(fromId),
    };
  }

  /** Gifts waiting to be seen — the badge, folded into `/me/social`. */
  async unseenCount(userId: string): Promise<number> {
    return this.deps.shop.unseenGiftCount(userId);
  }
}

function giftNotFound(): AppError {
  return new AppError('GIFT_NOT_FOUND', 404, 'no such gift');
}

/**
 * Is a gift posted at `where` one this send could have made — the same group,
 * or (a direct message, or the shop, which posts to one) the same two people?
 *
 * A gift with no message is from before gifts had them, when only the shop
 * gave them, or its message has gone since (with its group, or with a closed
 * child's messages). A direct-message send may be its retry: it has the one
 * recipient, who has the gift already, so all a retry can do is answer from
 * it. A group's send cannot, as it could add people to a gift whose chat is
 * not this one.
 */
function postedIn(where: BatchChat | null, chat: GiftChatRef | null, fromId: string, toId: string): boolean {
  if (chat?.kind === 'group') return where?.kind === 'group' && where.groupId === chat.groupId;
  if (!where) return true;
  if (where.kind !== 'dm') return false;
  const { lo, hi } = canonicalPair(fromId, toId);
  return where.userLo === lo && where.userHi === hi;
}
