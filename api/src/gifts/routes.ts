import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { MAX_GIFT_RECIPIENTS } from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import type { GiftService } from './service.js';

const sendBody = z.object({
  sku: z.string().min(1).max(80),
  toUserIds: z.array(z.uuid()).min(1).max(MAX_GIFT_RECIPIENTS),
  /** the chat the gift is posted in (shared `GiftChatRef`) */
  chat: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('dm'), userId: z.uuid() }),
    z.object({ kind: z.literal('group'), groupId: z.uuid() }),
  ]),
  /** required so a retry never pays twice */
  idempotencyKey: z.string().min(8).max(120),
  /** the price the picker showed; refused if it changed */
  expectedPrice: z.number().int().min(0).max(10_000_000).optional(),
});

/** `?to=a,b` — the friends the picker is choosing for. */
const catalogQuery = z.object({
  to: z
    .string()
    .max(MAX_GIFT_RECIPIENTS * 37)
    .transform((s) => s.split(',').map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.uuid()).min(1).max(MAX_GIFT_RECIPIENTS)),
});

const idParam = z.object({ id: z.uuid() });

/**
 * Gifts in the chat: send one from a direct message or a group, open one,
 * see what can be given, and fetch a card that changed.
 *
 * Realtime, for the apps: a gift posted in a direct message reaches the
 * recipient as an ordinary `dm` event (its message has `kind: 'gift'`), one
 * posted in a group as `group_msg` to the room; each recipient also gets
 * `gift_received` with their own card and the chat it is in. Opening one sends
 * the sender `gift_opened`, and in a group publishes `group_msg_gift_opened
 * {groupId, messageId, batchId}` to the room, on which members fetch the card
 * again (`GET /gifts/batches/:batchId`): a card is drawn per viewer, so the
 * room is told that it changed rather than what it now says.
 */
export function registerGiftRoutes(app: FastifyInstance, gifts: GiftService): void {
  /**
   * Send an item to friends in a chat — the one in a direct message, or some
   * of the members of a group. The answer is shared `SendGiftResult` (who got
   * it, who was skipped and why, the balance after), plus the gift message as
   * the sender sees it when this request posted one, so the thread can show it
   * without a refetch.
   */
  app.post(
    '/gifts',
    {
      schema: { body: sendBody },
      config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireBirthMonth,
    },
    async (req) => {
      const body = req.body as z.infer<typeof sendBody>;
      const result = await gifts.send({
        fromId: req.user!.id,
        toIds: body.toUserIds,
        sku: body.sku,
        chat: body.chat,
        idempotencyKey: body.idempotencyKey,
        expectedPrice: body.expectedPrice,
      });
      return {
        batchId: result.batchId,
        sent: result.sent,
        skipped: result.skipped,
        balance: result.balance,
        message: result.message,
      };
    },
  );

  /** What can be given to these friends, who owns what already, and the sender's balance. */
  app.get('/gifts/catalog', { schema: { querystring: catalogQuery }, preHandler: requireAuth }, async (req) => {
    const { to } = req.query as z.infer<typeof catalogQuery>;
    return gifts.catalog(req.user!.id, to);
  });

  /** Unwrap a gift you were given: `{card, equippable}`. Opening it again is fine. */
  app.post(
    '/gifts/:id/open',
    {
      schema: { params: idParam },
      config: { skipValidation: true, rateLimit: { max: 60, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => gifts.open(req.user!.id, (req.params as { id: string }).id),
  );

  /** One gift card as the caller sees it, for whoever can see the message it is on. */
  app.get(
    '/gifts/batches/:id',
    { schema: { params: idParam }, preHandler: requireAuth },
    async (req) => ({ card: await gifts.batchCard(req.user!.id, (req.params as { id: string }).id) }),
  );
}
