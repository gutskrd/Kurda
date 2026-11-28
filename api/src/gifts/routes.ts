import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { MAX_GIFT_QUANTITY, MAX_GIFT_RECIPIENTS, SPEND_LIMIT_MAX_ZER, SPEND_LIMIT_MIN_ZER, SPEND_LIMIT_PERIODS } from '@kurda/shared';
import { requireAccount } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { requireBirthMonth } from '../users/age.js';
import type { GiftService } from './service.js';
import { POST_TYPES, postGiftSenders, postGiftsFor, visiblePostAuthor } from './posts.js';
import { bagArrivals, bagEntries, markArrivalsSeen } from './bag.js';
import { giftLimitView, setGiftLimit } from './safety.js';
import { earnsZer } from '../earn/service.js';
import { isKnownAdultAccount } from '../users/age.js';

const postRef = z.object({ type: z.enum(POST_TYPES), id: lowerUuid() });

const sendBody = z
  .object({
    sku: z.string().min(1).max(80),
    /** how many of it each recipient is given; one when left out */
    quantity: z.number().int().min(1).max(MAX_GIFT_QUANTITY).optional(),
    /** the friends in the chat; left out for a gift onto a post, which goes to its author */
    toUserIds: z.array(lowerUuid()).min(1).max(MAX_GIFT_RECIPIENTS).optional(),
    /** the chat the gift is posted in (shared `GiftChatRef`) */
    chat: z
      .discriminatedUnion('kind', [z.object({ kind: z.literal('dm'), userId: lowerUuid() }), z.object({ kind: z.literal('group'), groupId: lowerUuid() })])
      .optional(),
    /** a post the gift is given onto, instead of a chat */
    post: postRef.optional(),
    /** required so a retry never pays twice */
    idempotencyKey: z.string().min(8).max(120),
    /** the price the picker showed; refused if it changed */
    expectedPrice: z.number().int().min(0).max(10_000_000).optional(),
    /** pay with free gifts from the members' box */
    useFreeGift: z.boolean().optional(),
    /** give it from the gift bag */
    fromBag: z.boolean().optional(),
    /** a big gift's second confirmation, from the GIFT_NEEDS_CONFIRM refusal of this same send */
    confirmToken: z.string().min(1).max(120).optional(),
  })
  .refine((b) => (b.post ? !b.chat && !b.toUserIds : !!b.chat && !!b.toUserIds), 'a gift goes to friends in a chat, or onto a post');

/** `?to=a,b`, the friends the picker is choosing for, or `?post=library:<id>`, a post it gives onto. */
const catalogQuery = z.union([
  z.object({
    to: z
      .string()
      .max(MAX_GIFT_RECIPIENTS * 37)
      .transform((s) => s.split(',').map((id) => id.trim()).filter(Boolean))
      .pipe(z.array(lowerUuid()).min(1).max(MAX_GIFT_RECIPIENTS)),
  }),
  z.object({
    post: z
      .string()
      .max(60)
      .transform((s) => ({ type: s.slice(0, s.indexOf(':')), id: s.slice(s.indexOf(':') + 1) }))
      .pipe(postRef),
  }),
]);

const idParam = z.object({ id: lowerUuid() });

/** A spending limit, or null for none. */
const limitBody = z.object({
  limit: z
    .object({ period: z.enum(SPEND_LIMIT_PERIODS), zer: z.number().int().min(SPEND_LIMIT_MIN_ZER).max(SPEND_LIMIT_MAX_ZER) })
    .nullable(),
});

/**
 * Gifts in the chat and onto posts: send one from a direct message, a group or a post, open one, list what can be given,
 * fetch a card that changed, and see a post's gifts and who gave them. A gift arrives as an ordinary `dm` or `group_msg`
 * event (`kind: 'gift'`), and each recipient also gets `gift_received` with their own card. Opening sends the sender
 * `gift_opened` and, in a group, publishes `group_msg_gift_opened {groupId, messageId, batchId}`; cards are drawn per
 * viewer, so members refetch theirs (`GET /gifts/batches/:batchId`). A gift onto a post sends its author `post_gift`.
 */
export function registerGiftRoutes(app: FastifyInstance, gifts: GiftService): void {
  /**
   * Sends an item to friends in a chat. Answers with the shared `SendGiftResult` (who got it, who was skipped and why,
   * the balance after) plus the gift message as the sender sees it, so the thread can show it without a refetch.
   */
  app.post(
    '/gifts',
    {
      schema: { body: sendBody },
      config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: [requireAccount, requireBirthMonth],
    },
    async (req) => {
      const body = req.body as z.infer<typeof sendBody>;
      const result = await gifts.send({
        fromId: req.user!.id,
        toIds: body.toUserIds ?? [],
        sku: body.sku,
        quantity: body.quantity,
        chat: body.chat ?? null,
        post: body.post ?? null,
        idempotencyKey: body.idempotencyKey,
        expectedPrice: body.expectedPrice,
        useFreeGift: body.useFreeGift,
        fromBag: body.fromBag,
        confirmToken: body.confirmToken,
      });
      return {
        batchId: result.batchId,
        sent: result.sent,
        skipped: result.skipped,
        balance: result.balance,
        freeGifts: result.freeGifts,
        bag: result.bag,
        message: result.message,
      };
    },
  );

  /** What can be given to these friends or onto this post, who owns what already, the sender's Zêr and free gifts. */
  app.get('/gifts/catalog', { schema: { querystring: catalogQuery }, preHandler: requireAccount }, async (req) => {
    const q = req.query as z.infer<typeof catalogQuery>;
    return gifts.catalog(req.user!.id, 'post' in q ? { post: q.post } : { toIds: q.to });
  });

  /** A post's gifts (its count and items) and who gave them, for anyone who can read the post; readable signed out. */
  app.get('/gifts/posts/:type/:id', { schema: { params: postRef } }, async (req) => {
    const post = req.params as z.infer<typeof postRef>;
    const viewer = req.user?.id ?? null;
    if (!(await visiblePostAuthor(app.db, post, viewer))) throw new AppError('POST_NOT_FOUND', 404, 'no such post');
    const [summary, senders] = await Promise.all([postGiftsFor(app.db, [post], viewer, publicUrl), postGiftSenders(app.db, post, viewer, publicUrl)]);
    return { gifts: summary.get(`${post.type}:${post.id}`) ?? { count: 0, items: [], senders: 0, from: null }, senders };
  });

  /** Unwrap a gift you were given: `{card, equippable}`. Opening it again is fine. */
  app.post(
    '/gifts/:id/open',
    {
      schema: { params: idParam },
      config: { skipValidation: true, rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAccount,
    },
    async (req) => gifts.open(req.user!.id, (req.params as { id: string }).id),
  );

  const publicUrl = (key: string) => (app.storage ? app.storage.publicUrl(key) : null);

  /**
   * The caller's gift bag (shared `GiftBagView`): what it holds, what landed since they last looked, whether they earn
   * Zêr at the same moments, and whether they are a known adult (`nudges`), so the apps say members do only to a known
   * adult who does not.
   */
  app.get('/gifts/bag', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => {
    const userId = req.user!.id;
    const [items, arrivals, member, nudges] = await Promise.all([
      bagEntries(app.db, userId, publicUrl),
      bagArrivals(app.db, userId, publicUrl),
      earnsZer(app.db, userId),
      isKnownAdultAccount(app.db, userId),
    ]);
    return { items, arrivals, earnsZer: member, nudges };
  });

  /** What landed in the bag has been told of. */
  app.post('/gifts/bag/seen', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => ({
    seen: await markArrivalsSeen(app.db, req.user!.id),
  }));

  /** The caller's own limit on Zêr spent on gifts (shared `GiftSpendLimitView`). */
  app.get('/me/gift-limit', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => giftLimitView(app.db, req.user!.id));

  /**
   * Sets, changes or removes it: lower applies at once, higher or none a day later (`delayed`, with `pending.from`).
   * Under 18 the fixed limits apply and cannot be changed (403 MINOR_GIFT_LIMITS).
   */
  app.put(
    '/me/gift-limit',
    { schema: { body: limitBody }, config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAccount },
    async (req) => setGiftLimit(app.db, req.user!.id, (req.body as z.infer<typeof limitBody>).limit),
  );

  /** One gift card as the caller sees it, for whoever can see the message it is on. */
  app.get(
    '/gifts/batches/:id',
    { schema: { params: idParam }, preHandler: requireAccount },
    async (req) => ({ card: await gifts.batchCard(req.user!.id, (req.params as { id: string }).id) }),
  );
}
