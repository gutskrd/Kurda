import { randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  BIG_GIFT_CONFIRM_ZER,
  FREE_GIFT_MAX_PRICE,
  GIFT_CATEGORY,
  GIFT_MIN_FRIENDSHIP_HOURS,
  MAX_GIFT_QUANTITY,
  MAX_GIFT_RECIPIENTS,
  giftForAdultsOnly,
  giftTierFor,
  giftsPerFriendCap,
  giftsReceivedCap,
  giftsSentCap,
  isLimitedItem,
  type EquippableCategory,
  type GiftCard,
  type GiftCatalog,
  type GiftChatRef,
  type GiftUserEvent,
  type SendGiftResult,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { assertUnrestricted } from '../moderation/restrictions.js';
import { assertParentalAllowed, parentalAllows } from '../parental/supervision.js';
import { assertEconomyNotHeld } from '../economy/standing.js';
import { canonicalPair } from '../friends/pair.js';
import type { FriendService } from '../friends/service.js';
import { cosmeticAssetUrl, giftOnOffer, resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { isPurchasable, lockEntitlement, type ItemRow, type ShopService } from '../shop/service.js';
import { InsufficientFundsError, type WalletService } from '../wallet/service.js';
import type { DmMessage } from '../chat/service.js';
import { groupRoom, type GroupChatService, type GroupMessage } from '../groups/chat-service.js';
import type { Notification } from '../push/service.js';
import { isKnownAdultAccount, notKnownAdultSql } from '../users/age.js';
import { childrenAmong } from '../users/kind.js';
import { childRefused } from '../family/child-gate.js';
import { batchChat, giftCards, giftCardsForEach, type BatchChat, type CardViewer } from './cards.js';
import { giftHold, postGiftBlocked, visiblePostAuthor, type PostRef } from './posts.js';
import { freeGiftsLeft, spendFreeGifts } from '../plus/members-box.js';
import { bagEntries, lockZerRow, takeFromBagWithin } from './bag.js';
import { giftsLeftToday } from './day-caps.js';
import { assertWithinBounds, notAdults, confirmToken, confirmTokenValid, sendBounds, type ConfirmSubject } from './safety.js';

export type SkipReason = SendGiftResult['skipped'][number]['reason'];

export interface SendGiftInput {
  fromId: string;
  /** the friends it goes to; for a gift onto a post, its author (found by `send`) */
  toIds: readonly string[];
  sku: string;
  /** How many of it each recipient is given, 1 to `MAX_GIFT_QUANTITY`; one when not said. */
  quantity?: number;
  /** Where the gift is posted: a direct message or a group's channel. Null from the shop, which posts to the direct message. */
  chat: GiftChatRef | null;
  /** A post the gift is given onto instead of a chat; its author is the one recipient, and no chat message is posted. */
  post?: PostRef | null;
  /** the request's retry key; each recipient's gift is keyed `${key}:${recipient}` */
  idempotencyKey: string;
  /** The price the sender was shown; refused if it has changed. */
  expectedPrice?: number;
  /** Pay with free gifts from the sender's members' boxes, one a gift, instead of Zêr. */
  useFreeGift?: boolean;
  /** Give it from the sender's gift bag, one from it a gift, instead of paying. */
  fromBag?: boolean;
  /** The second confirmation of a big gift, as a GIFT_NEEDS_CONFIRM refusal handed it out for this very send. */
  confirmToken?: string;
}

export interface SendGiftOutcome extends SendGiftResult {
  /** nothing happened this time: every recipient already had this request's gift */
  duplicate: boolean;
  item: { sku: string; name: string; price: number };
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
  inbox?: { recordAll(items: ReadonlyArray<{ userId: string; notification: Notification }>): Promise<void> };
  /** The escalation mute, which applies to a gift as to a message. */
  moderation?: { isChatMuted(userId: string): Promise<boolean> };
  /** The badges, told a gift was given (Diyarî). */
  badges?: { onGiftSent(fromUserId: string): Promise<void> };
  log?: { warn: (obj: unknown, msg: string) => void };
  /** The key big gifts' confirmations are signed with (safety.ts `confirmSecretFrom`); a fresh one each start without it. */
  confirmSecret?: Buffer;
}

/** The per-recipient key a gift row is stored under: one request, one gift each. */
export const recipientKey = (key: string, toId: string): string => `${key}:${toId}`;

interface Sender {
  username: string;
  /** the name to say: their display name, or the username */
  name: string;
  avatarUrl: string;
}

interface Posted {
  id: string;
  createdAt: Date;
}

/** What one send settled, inside its transaction, for the work after it. */
interface Settled {
  /** Every recipient already had this request's gift, so nothing was done. */
  replay: boolean;
  batchId: string;
  item: SendGiftOutcome['item'];
  /** how many of it each recipient was given */
  quantity: number;
  /** Recipients who have this request's gift, in the order asked, earlier attempts included. */
  sent: string[];
  /** recipients given it by this call, with their gift's id */
  given: Array<{ toId: string; giftId: string }>;
  skipped: SendGiftResult['skipped'];
  posted: Posted | null;
}

/** Who sent a batch, and its card as each person told of it sees it: the sender, the group room (null), each recipient. */
interface GiftViews {
  sender: Sender;
  cards: Map<string | null, GiftCard | null>;
}

/**
 * Gifts: a shop item or gift sticker bought for friends that arrives in a chat as a wrapped present, or given onto a post.
 * Every entry point (the shop's gift button, a direct message, a group, a post) goes through one set of rules:
 *
 * - In a chat, friends only, refused outright otherwise, as a direct message is.
 * - A day of friendship first when either side is not a known adult, against the "add, gift, groom" pattern. Onto a
 *   post the same holds without the chat's friendship: the author's friends of a day or more, or anyone when both are
 *   known adults.
 * - Daily caps per sender and per pair over the last 24 hours, and per recipient from everyone together, so throwaway
 *   accounts cannot pour items into one account: wide between two known adults, narrow wherever someone under 18 is
 *   involved (`GIFT_DAY_CAPS`). Several of one gift at once count as that many gifts.
 * - Not from an account paused from moving value (economy/standing.ts): 403 GIFTS_PAUSED.
 * - Never currency: a gift is an item, and purchases are final, so it cannot move currency between accounts.
 * - Not a unique item the recipient owns, decided under `lockEntitlement` so two friends gifting it cannot both win, and
 *   never more than one of it at once.
 * - Never free of cost, or it would be an unlimited free way to put a notification in front of someone; a member's free
 *   gifts from their monthly box are counted out, three a month.
 * - Not while muted from chat, with the same answers as a message (403 MUTED, then CHAT_MUTED).
 * - Within the safeguards (safety.ts): at most 500 Zêr a gift from or to anyone under 18, 2,000 Zêr a month spent by
 *   them (gifts from their bag counted at their price), an adult's own limit, and a second confirmation for a send of 2,000 Zêr or more, all decided under the
 *   sender's lock with their Zêr row locked, so two quick sends cannot both pass.
 * - From the gift bag as from Zêr, under every rule above; the bag is the only thing a bag's gifts can leave by.
 *
 * A friend a rule turns away is skipped and the answer says why; the rest still get it. The debits, items, gift
 * rows and chat message are one transaction. Notifying happens after the commit, and its failure never undoes a gift.
 */
export class GiftService {
  private readonly confirmSecret: Buffer;

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: GiftDeps,
    private readonly publicUrl: PublicUrl = () => null,
  ) {
    this.confirmSecret = deps.confirmSecret ?? randomBytes(32);
  }

  async send(asked: SendGiftInput, now: Date = new Date()): Promise<SendGiftOutcome> {
    // Every id in its one lower-case spelling before anything compares them, as the routes read them too (http/ids.ts).
    const input = canonicalSend(asked);
    // A child's profile never gives a gift, however it is asked for; the child gate keeps them from the routes as well.
    if ((await childrenAmong(this.pool, [input.fromId])).size > 0) throw childRefused();
    if (input.fromBag && input.useFreeGift) throw new AppError('BAD_PAYMENT', 400, 'a gift is paid one way');
    const quantity = input.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_GIFT_QUANTITY) {
      throw new AppError('BAD_QUANTITY', 400, `a gift is 1–${MAX_GIFT_QUANTITY} of one thing`);
    }
    if (input.post) return this.sendToPost({ ...input, post: input.post }, now);
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
    // Muted from chat is refused as a message would be; the group's own rules are checked by assertCanPost below.
    await assertUnrestricted(this.pool, fromId, 'chat');
    // and a gift is a message, so a parent's switch for messages covers it (in a group, by assertCanPost)
    if (chat?.kind !== 'group') await assertParentalAllowed(this.pool, fromId, 'chat');
    if (chat?.kind !== 'group' && this.deps.moderation && (await this.deps.moderation.isChatMuted(fromId))) {
      throw new AppError('CHAT_MUTED', 403, 'you are muted from chat');
    }
    await assertEconomyNotHeld(this.pool, fromId, 'gifts');

    // every recipient in one query, not one each
    const statuses = await this.deps.friends.statusesBetween(fromId, toIds);
    if (toIds.some((to) => statuses.get(to) !== 'friends')) {
      throw new AppError('NOT_FRIENDS', 403, 'you can only send gifts to friends');
    }

    // In a group the gift is a channel message, so the sender must be able to post and each recipient must read it.
    const outsideGroup = new Set<string>();
    if (chat?.kind === 'group') {
      await this.deps.groupChat.assertCanPost(chat.groupId, fromId);
      const readers = await this.deps.groupChat.canReadEach(chat.groupId, toIds);
      toIds.forEach((to, i) => {
        if (!readers[i]) outsideGroup.add(to);
      });
    }

    return this.finish(input, await this.settle(input, toIds, outsideGroup, now));
  }

  /**
   * A gift onto a post: to its author, from anyone who can read it, under the post rule (`postGiftBlocked`) and the same
   * daily caps. Like a comment it is refused while muted from posting or switched off by a parent.
   */
  private async sendToPost(input: SendGiftInput & { post: PostRef }, now: Date): Promise<SendGiftOutcome> {
    const { fromId, post } = input;
    const author = await visiblePostAuthor(this.pool, post, fromId);
    if (!author) throw new AppError('POST_NOT_FOUND', 404, 'no such post');
    if (author === fromId) throw new AppError('GIFT_TO_SELF', 400, 'you cannot gift to yourself');
    await assertUnrestricted(this.pool, fromId, 'post');
    await assertParentalAllowed(this.pool, fromId, 'posts');
    await assertEconomyNotHeld(this.pool, fromId, 'gifts');
    const sending = { ...input, toIds: [author], chat: null };
    return this.finish(sending, await this.settle(sending, [author], new Set(), now));
  }

  /** After the transaction: tell people, then answer with the balance and what was posted. */
  private async finish(input: SendGiftInput, settled: Settled): Promise<SendGiftOutcome> {
    const { fromId } = input;
    // Notify straight after the commit, before anything else can fail: a retry replays the gift without notifying, so a
    // failure first would leave friends never told of a present that is theirs. What they are told is read once and
    // serves the sender's own message too.
    let views: GiftViews | null = null;
    if (settled.given.length > 0) {
      await this.views(settled, input)
        .then((read) => this.deliver(settled, input, (views = read)))
        .catch((err) => this.deps.log?.warn({ err, batchId: settled.batchId }, 'a gift was given but telling people failed'));
      // the giving badge counts it from the gifts table; best-effort
      await this.deps.badges?.onGiftSent(fromId).catch(() => undefined);
    }

    const [balance, freeGifts, bag] = await Promise.all([
      this.deps.wallet.balances(fromId),
      freeGiftsLeft(this.pool, fromId),
      bagEntries(this.pool, fromId, this.publicUrl),
    ]);
    const message = settled.posted ? this.senderView(settled, input, views ?? (await this.views(settled, input))) : null;

    return {
      batchId: settled.batchId,
      sent: settled.sent,
      skipped: settled.skipped,
      balance,
      freeGifts,
      bag,
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
    const quantity = input.quantity ?? 1;
    const post = input.post ?? null;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // One send at a time per sender, so two sends cannot both fit under the daily cap; a retry arriving mid-attempt
      // waits here and then finds that attempt's gifts.
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`gift-send:${fromId}`]);

      // Recognise a retry first, or the owns-it check would report a friend owning the item the first try gave them.
      const prior = await client.query<{ to_user_id: string; batch_id: string; sku: string; quantity: number }>(
        `SELECT to_user_id, batch_id, sku, quantity FROM gifts
          WHERE from_user_id = $1 AND idempotency_key = ANY($2::text[])`,
        [fromId, toIds.map((to) => recipientKey(idempotencyKey, to))],
      );
      // A retry must match the item, the one gift it made and the chat; a key alone would let a send in one chat add
      // friends to a gift posted in another.
      const reused = () => new AppError('IDEMPOTENCY_REUSED', 409, 'that request key was already used');
      if (prior.rows.some((r) => r.sku !== sku || r.quantity !== quantity)) throw reused();
      if (new Set(prior.rows.map((r) => r.batch_id)).size > 1) throw reused();
      if (prior.rows.length > 0 && !(await sameTarget(client, prior.rows[0]!.batch_id, chat, post, fromId, toIds[0]!))) {
        throw reused();
      }
      const had = new Set(prior.rows.map((r) => r.to_user_id));
      const batchId = prior.rows[0]?.batch_id ?? randomUUID();

      const item = (await client.query<ItemRow>(`SELECT * FROM shop_items WHERE sku = $1`, [sku])).rows[0];
      if (!item) throw new AppError('ITEM_NOT_FOUND', 404, 'no such item');
      const summary = { sku: item.sku, name: item.name, price: item.price };

      // A full replay: the stored result, whatever the catalogue says now.
      if (toIds.every((to) => had.has(to))) {
        await client.query('COMMIT');
        return { replay: true, batchId, item: summary, quantity, sent: toIds, given: [], skipped: [], posted: null };
      }

      if (!isPurchasable(item, now)) throw new AppError('ITEM_UNAVAILABLE', 409, 'item is not available');
      // a gift the sheet does not offer (not drawn yet, or out of its season) cannot be sent around it either
      if (!giftOnOffer({ sku: item.sku, category: item.category, assetKey: item.asset_key }, now)) {
        throw new AppError('ITEM_UNAVAILABLE', 409, 'item is not available');
      }
      if (item.price <= 0) throw new AppError('NOT_GIFTABLE', 409, 'this item cannot be given as a gift');
      // there is only ever one of a unique item
      if (item.is_unique && quantity > 1) throw new AppError('BAD_QUANTITY', 400, 'only one of this can be given');
      if (expectedPrice != null && item.price !== expectedPrice) {
        throw new AppError('PRICE_CHANGED', 409, 'the price changed; please review and try again');
      }

      const skipped: SendGiftResult['skipped'] = [];
      const skip = (userId: string, reason: SkipReason) => skipped.push({ userId, reason });
      let candidates = toIds.filter((to) => !had.has(to));

      if (input.useFreeGift && item.price > FREE_GIFT_MAX_PRICE) {
        throw new AppError('NOT_A_FREE_GIFT', 409, 'a free gift pays only for a smaller gift');
      }
      // A bag only ever holds gifts.
      if (input.fromBag && item.category !== GIFT_CATEGORY) throw bagEmpty();

      // a member of the group the gift is posted in, a friendship old enough (onto a post, the post's own rule), and never
      // a child's profile, which is given nothing
      const notYet = post
        ? await postGiftBlocked(client, fromId, candidates, GIFT_MIN_FRIENDSHIP_HOURS)
        : await this.notYetAllowed(client, fromId, candidates);
      const children = await childrenAmong(client, candidates);
      candidates = candidates.filter((to) => {
        const allowed = !outsideGroup.has(to) && !notYet.has(to) && !children.has(to);
        if (!allowed) skip(to, 'not_allowed');
        return allowed;
      });

      // Each recipient's items are locked here in one order (by id), so "they own it already" holds when decided, and two
      // people giving the same thing to the same friends in opposite order cannot deadlock. The recipient's day of gifts
      // is locked first in the same order, so two senders cannot both fit under its cap.
      for (const to of [...candidates].sort()) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`gift-received:${to}`]);
        await lockEntitlement(client, to, sku);
      }

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

      // who is under 18 or of unknown age, which keeps the day's caps narrow
      const young = await notAdults(client, [fromId, ...candidates]);
      const senderAdult = !young.has(fromId);

      // a token of courtship goes only from one known adult to another
      if (giftForAdultsOnly(item.sku)) {
        if (!senderAdult) throw new AppError('ITEM_UNAVAILABLE', 409, 'item is not available');
        candidates = candidates.filter((to) => {
          if (young.has(to)) skip(to, 'not_allowed');
          return !young.has(to);
        });
      }

      // what each recipient has been given in the last 24 hours, by anyone
      if (candidates.length > 0) {
        const received = await client.query<{ to_user_id: string; n: number }>(
          `SELECT to_user_id, sum(quantity)::int AS n FROM gifts
            WHERE to_user_id = ANY($1::uuid[]) AND created_at > now() - interval '24 hours'
            GROUP BY to_user_id`,
          [candidates],
        );
        const receivedBy = new Map(received.rows.map((r) => [r.to_user_id, r.n]));
        candidates = candidates.filter((to) => {
          if ((receivedBy.get(to) ?? 0) + quantity <= giftsReceivedCap(!young.has(to))) return true;
          skip(to, 'daily_limit');
          return false;
        });
      }

      // the caps, over the last 24 hours, counting every gift: several at once are that many
      const recent = await client.query<{ to_user_id: string; n: number }>(
        `SELECT to_user_id, sum(quantity)::int AS n FROM gifts
          WHERE from_user_id = $1 AND created_at > now() - interval '24 hours'
          GROUP BY to_user_id`,
        [fromId],
      );
      const perFriend = new Map(recent.rows.map((r) => [r.to_user_id, r.n]));
      let today = recent.rows.reduce((n, r) => n + r.n, 0);
      candidates = candidates.filter((to) => {
        const theirs = perFriend.get(to) ?? 0;
        if (today + quantity > giftsSentCap(senderAdult) || theirs + quantity > giftsPerFriendCap(senderAdult, !young.has(to))) {
          skip(to, 'daily_limit');
          return false;
        }
        today += quantity;
        perFriend.set(to, theirs + quantity);
        return true;
      });

      // The safeguards, with the sender's Zêr row held: what these recipients may be given, what is left to spend, and
      // for a big send, that its money amount was seen and confirmed for exactly this send.
      const paying = !input.useFreeGift && !input.fromBag;
      // what each recipient's gift costs, and the gifts this send gives in all
      const each = item.price * quantity;
      const units = quantity * candidates.length;
      const total = paying ? each * candidates.length : 0;
      if (candidates.length > 0) {
        // the Zêr row before the bag, the one order every path takes (bag.ts)
        await lockZerRow(client, fromId);
        await assertWithinBounds(client, fromId, candidates, item.price, total, input.fromBag ? each * candidates.length : 0);
        if (paying && total >= BIG_GIFT_CONFIRM_ZER) {
          // never ask someone to confirm what they cannot pay for
          if ((await zerHeld(client, fromId)) < total) throw new InsufficientFundsError();
          const subject: ConfirmSubject = { fromId, sku, price: item.price, quantity, recipients: candidates, target: targetOf(chat, post, toIds), idempotencyKey };
          if (!confirmTokenValid(this.confirmSecret, input.confirmToken, subject)) {
            const confirm = confirmToken(this.confirmSecret, subject);
            throw new AppError('GIFT_NEEDS_CONFIRM', 409, 'a big gift is confirmed once more before it goes', {
              confirmToken: confirm.token,
              total,
              recipients: candidates.length,
              expiresAt: confirm.expiresAt.toISOString(),
            });
          }
        }
      }

      // Free gifts cover every recipient or none, so a send never ends up half paid one way and half the other.
      if (input.useFreeGift && candidates.length > 0 && !(await spendFreeGifts(client, fromId, units))) {
        throw new AppError('NO_FREE_GIFTS', 409, 'there are not enough free gifts left for that');
      }
      // and the bag likewise, one from it a gift
      if (input.fromBag && candidates.length > 0 && !(await takeFromBagWithin(client, fromId, sku, units))) throw bagEmpty();

      const given: Settled['given'] = [];
      for (const to of candidates) {
        const giftId = randomUUID();
        if (paying) {
          // Ledger reason 'gift' tells gifts from purchases; one debit per recipient with its own key, so a retry pays nothing.
          const debit = await this.deps.wallet.debitWithin(client, {
            userId: fromId,
            currency: 'zer',
            amount: each,
            reason: 'gift',
            refId: giftId,
            idempotencyKey: `gift:${fromId}:${recipientKey(idempotencyKey, to)}`,
          });
          if (debit.duplicate) throw reused();
        }
        await client.query(
          `INSERT INTO user_entitlements (user_id, sku, source, quantity)
           VALUES ($1, $2, 'gift', $3)
           ON CONFLICT (user_id, sku) DO UPDATE SET quantity = user_entitlements.quantity + EXCLUDED.quantity`,
          [to, sku, quantity],
        );
        // clock_timestamp, not now(), keeps recipients in the order given, which is the order the card lists them.
        await client.query(
          `INSERT INTO gifts (id, from_user_id, to_user_id, sku, price, currency, idempotency_key, batch_id, post_type, post_id, paid_with, quantity, created_at)
           VALUES ($1, $2, $3, $4, $5, 'zer', $6, $7, $8, $9, $10, $11, clock_timestamp())`,
          [
            giftId,
            fromId,
            to,
            sku,
            item.price,
            recipientKey(idempotencyKey, to),
            batchId,
            post?.type ?? null,
            post?.id ?? null,
            input.fromBag ? 'bag' : input.useFreeGift ? 'free_gift' : 'zer',
            quantity,
          ],
        );
        given.push({ toId: to, giftId });
      }

      // One message per send, posted by the call that made the batch; a retry reaching a skipped friend joins the batch
      // and the existing message shows them.
      let posted: Posted | null = null;
      if (given.length > 0 && prior.rows.length === 0 && !post) posted = await this.post(client, fromId, given[0]!.toId, chat, batchId);

      await client.query('COMMIT');
      const sentSet = new Set([...had, ...given.map((g) => g.toId)]);
      return {
        replay: false,
        batchId,
        item: summary,
        quantity,
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
   * The friends a gift cannot reach yet: the friendship is younger than `GIFT_MIN_FRIENDSHIP_HOURS` (from acceptance,
   * or creation if unrecorded) and either side is not a known adult. Also, read inside the transaction, anyone who
   * stopped being a friend since the check at the door.
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
    const r = await this.pool.query<{ username: string; display_name: string | null; profile_photo_key: string | null; selected_avatar_key: string | null }>(
      `SELECT username, display_name, profile_photo_key, selected_avatar_key FROM users WHERE id = $1`,
      [userId],
    );
    const u = r.rows[0];
    return {
      username: u?.username ?? '',
      name: u?.display_name?.trim() || u?.username || '',
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

  /**
   * Who sent a batch and its card for each person told of it, in one read of the cards: in a direct message the two
   * are the pair, and in a group the sender and every recipient are members, who see one another.
   */
  private async views(settled: Settled, input: SendGiftInput): Promise<GiftViews> {
    const viewers = [input.fromId, null, ...settled.given.map((g) => g.toId)];
    const [sender, cards] = await Promise.all([this.sender(input.fromId), giftCardsForEach(this.pool, settled.batchId, viewers, this.publicUrl)]);
    return { sender, cards };
  }

  private senderView(settled: Settled, input: SendGiftInput, { sender, cards }: GiftViews): DmMessage | GroupMessage {
    const inGroup = input.chat?.kind === 'group';
    return this.message(settled.posted!, input.fromId, sender, cards.get(input.fromId) ?? null, inGroup ? 'group' : 'dm');
  }

  /**
   * After the commit: the message where it was posted, a `gift_received` with their own card to each recipient, and a
   * notification. The card published to a group room is nobody's in particular; names on it are safe for every
   * member, since recipients are members and members see one another.
   */
  private async deliver(settled: Settled, input: SendGiftInput, { sender, cards }: GiftViews): Promise<void> {
    const { fromId, chat } = input;
    const { realtime, inbox } = this.deps;
    const warn = (what: string) => (err: unknown) => this.deps.log?.warn({ err, batchId: settled.batchId }, what);
    const inGroup = chat?.kind === 'group';
    if (input.post) return this.deliverToPost(settled, input.post, fromId, sender);

    if (settled.posted && chat?.kind === 'group') {
      const message = this.message(settled.posted, fromId, sender, cards.get(null) ?? null, 'group');
      // A channel message like any other, so it is kept from members with a block between them and the sender.
      await this.deps.groupChat
        .hiddenFrom(chat.groupId, fromId)
        .then((hidden) =>
          realtime.publish(groupRoom(chat.groupId), {
            type: 'group_msg',
            groupId: chat.groupId,
            message,
            ...(hidden.length > 0 ? { hiddenFrom: hidden } : {}),
          }),
        )
        .catch(warn('gift message not published to the group'));
    }

    const where: GiftChatRef = chat?.kind === 'group' ? chat : { kind: 'dm', userId: fromId };
    const told = settled.given.flatMap(({ toId, giftId }) => {
      const card = cards.get(toId) ?? null;
      return card ? [{ toId, giftId, card }] : [];
    });
    // Each recipient's events in order, the recipients side by side.
    await Promise.all(
      told.map(async ({ toId, giftId, card }) => {
        // a gift in a message is a message: not live to someone whose parent switched messages off
        if (settled.posted && !inGroup && (await parentalAllows(this.pool, toId, 'chat'))) {
          const message = this.message(settled.posted, fromId, sender, card, 'dm');
          await realtime
            .notifyUser(toId, { type: 'dm', from: fromId, fromUsername: sender.username, message })
            .catch(warn('gift message not pushed'));
        }
        const event: GiftUserEvent = {
          type: 'gift_received',
          giftId,
          batchId: settled.batchId,
          from: { name: sender.name, avatarUrl: sender.avatarUrl },
          card,
          chat: where,
        };
        await realtime.notifyUser(toId, event).catch(warn('gift_received not pushed'));
      }),
    );
    // English for the notification list; the apps write their own words from `data`
    const what = settled.quantity > 1 ? `${settled.quantity} × ${settled.item.name}` : settled.item.name;
    await inbox
      ?.recordAll(
        told.map(({ toId, giftId }) => ({
          userId: toId,
          notification: {
            category: 'friends' as const,
            title: 'You have a gift',
            body: `${sender.name || 'Someone'} sent you ${what}.`,
            data: {
              kind: 'gift',
              giftId,
              batchId: settled.batchId,
              chat: where.kind === 'group' ? `group:${where.groupId}` : `dm:${fromId}`,
              sku: settled.item.sku,
              ...(settled.quantity > 1 ? { quantity: String(settled.quantity) } : {}),
              fromUserId: fromId,
              // a friend or a member of the same group, whose name the recipient sees already
              fromName: sender.name,
            },
          },
        })),
      )
      .catch(warn('gift notification not recorded'));
  }

  /**
   * After the commit, a gift onto a post: its author hears live (`post_gift`) and in the notification list, which the apps
   * word from `data`. There is no chat message; the notice names the author's own gift (`giftId`), so following it opens
   * the gift in its light on the post (`POST /gifts/:id/open`), and the post shows its gifts.
   */
  private async deliverToPost(settled: Settled, post: PostRef, fromId: string, sender: Sender): Promise<void> {
    const warn = (what: string) => (err: unknown) => this.deps.log?.warn({ err, batchId: settled.batchId }, what);
    const authorId = settled.given[0]?.toId;
    const giftId = settled.given[0]?.giftId;
    if (!authorId || !giftId) return;
    // The author can see whoever could give onto their post (the post's own rule), so the sender is named.
    const from = { name: sender.name, avatarUrl: sender.avatarUrl };
    await this.deps.realtime
      .notifyUser(authorId, { type: 'post_gift', postType: post.type, postId: post.id, batchId: settled.batchId, giftId, sku: settled.item.sku, from })
      .catch(warn('post_gift not pushed'));
    await this.deps.inbox
      ?.recordAll([
        {
          userId: authorId,
          notification: {
            category: 'friends' as const,
            title: 'A gift on your post',
            body: `${sender.name || 'Someone'} gave your post ${settled.quantity > 1 ? `${settled.quantity} × ${settled.item.name}` : settled.item.name}.`,
            data: {
              kind: 'post_gift',
              postType: post.type,
              postId: post.id,
              batchId: settled.batchId,
              giftId,
              sku: settled.item.sku,
              ...(settled.quantity > 1 ? { quantity: String(settled.quantity) } : {}),
              fromUserId: fromId,
              fromName: sender.name,
            },
          },
        },
      ])
      .catch(warn('post gift notification not recorded'));
  }

  /**
   * The recipient unwraps their gift: it is opened and seen, and the card comes back with what they can wear. The
   * sender hears once (`gift_opened`, unless a block now stands between them), and a group gets
   * `group_msg_gift_opened {groupId, messageId, batchId}` so members refetch their per-viewer cards.
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
        // Not across a block: opening is the recipient's activity, which a block hides. Silently; the gift opens anyway.
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
   * One gift card for someone who can see its message: the sender, a recipient, or a reader of its group; anyone else
   * is told there is no such gift. A gift between two people is part of their conversation, so a block hides it from
   * both, or the blocked person could keep reading the other's name, picture and whether they opened it. Group gifts
   * follow the group, which a block between members does not hide.
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
      if (await this.deps.friends.blockedWithAny(viewerId, others)) throw giftNotFound();
    }
    const card = await this.card(batchId, { id: viewerId, seesEveryone: await this.seesEveryone(where, viewerId) });
    if (!card) throw giftNotFound();
    return card;
  }

  /** The roster rule for a card: everyone in a direct message, and members of the group it was posted in. */
  private async seesEveryone(where: Awaited<ReturnType<typeof batchChat>>, viewerId: string): Promise<boolean> {
    if (where?.kind !== 'group') return true;
    const r = await this.pool.query<{ sees: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM group_members m WHERE m.group_id = $1 AND m.user_id = $2) AS sees`,
      [where.groupId, viewerId],
    );
    return r.rows[0]?.sees ?? false;
  }

  /**
   * What the sender can give these friends, or a post's author: the gifts on sale that have their picture, cheapest
   * first, with the sender's gift bag, Zêr and free gifts from their members' boxes, and what this send may cost
   * (safety.ts), so the sheet can lock what the safeguards would refuse. `nudges` is false for anyone not known to be an
   * adult, who is never shown a suggestion to buy.
   */
  async catalog(fromId: string, target: { toIds: readonly string[] } | { post: PostRef }, now: Date = new Date()): Promise<GiftCatalog> {
    let ids: string[];
    const onPost = 'post' in target;
    if (onPost) {
      const author = await visiblePostAuthor(this.pool, target.post, fromId);
      if (!author) throw new AppError('POST_NOT_FOUND', 404, 'no such post');
      if (author === fromId) throw new AppError('GIFT_TO_SELF', 400, 'you cannot gift to yourself');
      ids = [author];
    } else {
      ids = [...new Set(target.toIds.map(lowerId))];
      if (ids.includes(lowerId(fromId))) throw new AppError('GIFT_TO_SELF', 400, 'you cannot gift to yourself');
      if (ids.length === 0 || ids.length > MAX_GIFT_RECIPIENTS) {
        throw new AppError('BAD_RECIPIENTS', 400, `a gift goes to 1–${MAX_GIFT_RECIPIENTS} friends`);
      }
      const statuses = await this.deps.friends.statusesBetween(fromId, ids);
      if (ids.some((to) => statuses.get(to) !== 'friends')) {
        throw new AppError('NOT_FRIENDS', 403, 'you can only send gifts to friends');
      }
    }

    // One recipient: whether the rules let a gift go yet, so the picker can say so before anything is chosen. When they
    // do not, the limits are the sender's own, so nobody learns from them how old someone they cannot give to is.
    const hold = ids.length === 1 ? await giftHold(this.pool, fromId, ids[0]!, onPost, GIFT_MIN_FRIENDSHIP_HOURS) : null;
    // tokens of courtship only where giver and receivers are all known adults, decided on the same ages as the limits
    const adults = (await notAdults(this.pool, [lowerId(fromId), ...(hold ? [] : ids)])).size === 0;
    const live = (await this.deps.shop.liveItems(now)).filter(
      (i) => i.price > 0 && i.category === GIFT_CATEGORY && giftOnOffer(i, now) && (adults || !giftForAdultsOnly(i.sku)),
    );
    const items = live
      .map((i) => ({ ...i, assetUrl: cosmeticAssetUrl(i.category, i.assetKey, this.publicUrl, i.sku) }))
      .sort((a, b) => a.price - b.price || a.displayOrder - b.displayOrder);
    const unique = items.filter((i) => i.isUnique).map((i) => i.sku);
    const owned = await this.pool.query<{ user_id: string; sku: string }>(
      `SELECT user_id, sku FROM user_entitlements WHERE user_id = ANY($1::uuid[]) AND sku = ANY($2::text[])`,
      [ids, unique],
    );
    const owners = new Map<string, string[]>();
    for (const r of owned.rows) owners.set(r.sku, [...(owners.get(r.sku) ?? []), r.user_id]);
    const bounds = await sendBounds(this.pool, fromId, hold ? [] : ids, now);
    const dayLeft = hold ? [] : await giftsLeftToday(this.pool, lowerId(fromId), ids);

    return {
      items: items.map((i) => ({
        sku: i.sku,
        name: i.name,
        category: i.category,
        assetUrl: i.assetUrl,
        price: i.price,
        tier: giftTierFor({ price: i.price, limited: isLimitedItem(i.sku, i.availableTo) }),
        // in the order asked, so the picker can line it up with its chips
        alreadyOwnedBy: ids.filter((id) => owners.get(i.sku)?.includes(id)),
        freeGiftEligible: i.price <= FREE_GIFT_MAX_PRICE,
      })),
      bag: (await bagEntries(this.pool, fromId, this.publicUrl)).filter((b) => items.some((i) => i.sku === b.sku)),
      balance: await this.deps.wallet.balances(fromId),
      freeGifts: await freeGiftsLeft(this.pool, fromId),
      hold,
      limits: { maxPrice: bounds.maxPrice, left: bounds.left, confirmFrom: bounds.confirmFrom },
      dayLeft,
      // only a known adult, never a guest or anyone of unknown age, is ever shown a suggestion to buy
      nudges: await isKnownAdultAccount(this.pool, fromId),
    };
  }

  /** Gifts waiting to be seen — the badge, folded into `/me/social`. */
  async unseenCount(userId: string): Promise<number> {
    return this.deps.shop.unseenGiftCount(userId);
  }
}

const lowerId = (id: string): string => id.toLowerCase();

/** A send with every id lower-cased and the recipients counted once each. */
function canonicalSend(input: SendGiftInput): SendGiftInput {
  const chat: GiftChatRef | null =
    input.chat?.kind === 'group' ? { kind: 'group', groupId: lowerId(input.chat.groupId) } : input.chat ? { kind: 'dm', userId: lowerId(input.chat.userId) } : null;
  return {
    ...input,
    fromId: lowerId(input.fromId),
    toIds: [...new Set(input.toIds.map(lowerId))],
    chat,
    post: input.post ? { type: input.post.type, id: lowerId(input.post.id) } : input.post,
  };
}

function giftNotFound(): AppError {
  return new AppError('GIFT_NOT_FOUND', 404, 'no such gift');
}

function bagEmpty(): AppError {
  return new AppError('BAG_EMPTY', 409, 'your gift bag does not hold enough of that gift');
}

async function zerHeld(client: pg.PoolClient, userId: string): Promise<number> {
  const res = await client.query<{ balance: number }>(`SELECT balance FROM wallet_balances WHERE user_id = $1 AND currency = 'zer'`, [userId]);
  return res.rows[0]?.balance ?? 0;
}

/** Where a send goes, as its confirmation names it. */
function targetOf(chat: GiftChatRef | null, post: PostRef | null, toIds: readonly string[]): string {
  if (post) return `post:${post.type}:${post.id}`;
  if (chat?.kind === 'group') return `group:${chat.groupId}`;
  return `${chat ? 'dm' : 'shop'}:${toIds[0] ?? ''}`;
}

/** Whether a retry's earlier gift went where this one goes: onto the same post, or posted in the same chat. */
async function sameTarget(
  client: pg.PoolClient,
  batchId: string,
  chat: GiftChatRef | null,
  post: PostRef | null,
  fromId: string,
  toId: string,
): Promise<boolean> {
  const on = await client.query<{ post_type: string | null; post_id: string | null }>(
    `SELECT post_type, post_id FROM gifts WHERE batch_id = $1 LIMIT 1`,
    [batchId],
  );
  const was = on.rows[0];
  if (post || was?.post_id) return !!post && was?.post_type === post.type && was?.post_id === post.id;
  return postedIn(await batchChat(client, batchId), chat, fromId, toId);
}

/**
 * Whether a gift posted at `where` is one this send could have made: the same group, or the same two people for a
 * direct message or the shop. A gift with no message predates gift messages or lost it with its group or a closed
 * child's messages; a direct-message send may still be its retry, since it has the one recipient, but a group send
 * may not, as it could add people to a gift in another chat.
 */
function postedIn(where: BatchChat | null, chat: GiftChatRef | null, fromId: string, toId: string): boolean {
  if (chat?.kind === 'group') return where?.kind === 'group' && where.groupId === chat.groupId;
  if (!where) return true;
  if (where.kind !== 'dm') return false;
  const { lo, hi } = canonicalPair(fromId, toId);
  return where.userLo === lo && where.userHi === hi;
}
