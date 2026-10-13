import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { cosmeticAssetUrl } from '../cosmetics/access.js';
import { AppError } from '../plugins/errors.js';
import { SENSITIVE_PRICE } from '../admin/config-service.js';
import type { ShopService } from './service.js';
import type { ItemReturns } from './returns.js';
import type { GiftService, SkipReason } from '../gifts/service.js';

const itemBody = z.object({
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  // 'tag' is the Kurdish identity tag the tags migration sells (tag_kurdish):
  // without it here the item could be listed but never saved again
  category: z.enum(['cosmetic', 'background', 'icon', 'powerup', 'freeze', 'tag', 'misc']).optional(),
  currency: z.enum(['zer', 'gems']),
  price: z.number().int().min(0).max(10_000_000),
  isUnique: z.boolean().optional(),
  active: z.boolean().optional(),
  inStock: z.boolean().optional(),
  availableFrom: z.coerce.date().optional(),
  availableTo: z.coerce.date().optional(),
  /** cosmetics: storage/static key + premium access + catalog ordering */
  assetKey: z.string().max(200).optional(),
  premiumOnly: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(100_000).optional(),
});

const giftBody = z.object({
  sku: z.string().min(1).max(80),
  toUserId: z.uuid(),
  idempotencyKey: z.string().min(8).max(120),
  expectedPrice: z.number().int().min(0).max(10_000_000).optional(),
});

const purchaseBody = z.object({
  sku: z.string().min(1).max(80),
  /** required so retries never double-charge (KUR-071) */
  idempotencyKey: z.string().min(8).max(120),
  /** the price the client displayed; rejected if it changed (KUR-070) */
  expectedPrice: z.number().int().min(0).max(10_000_000).optional(),
});

/**
 * How the shop's gift button says no, for the one friend it gifts. It has
 * always answered a refusal with an error, and phone builds in people's hands
 * read those codes; the chat's own route (`POST /gifts`) lists the skipped
 * instead, since a group gift can reach some friends and not others.
 */
const SHOP_GIFT_REFUSALS: Readonly<Record<SkipReason, () => AppError>> = {
  already_owned: () => new AppError('ALREADY_OWNED', 409, 'they already own this item'),
  not_allowed: () =>
    new AppError('GIFT_NOT_ALLOWED', 403, 'a gift to a new friend can be sent once you have been friends for a day'),
  daily_limit: () => new AppError('GIFT_DAILY_LIMIT', 429, 'that is all the gifts for today'),
};

/** Shop catalog + purchase + gifting + inventory (KUR-071). */
export function registerShopRoutes(
  app: FastifyInstance,
  shop: ShopService,
  deps: { gifts: GiftService; returns?: ItemReturns },
): void {
  /**
   * Admin: create/update a catalog item.
   *
   * A new price of 1,000 or more is not set here. Such a price is the change
   * that needs a second admin's sign-off (POST /admin/config/changes), and
   * accepting it on this route as well let one admin skip that by choosing the
   * other door — as live events' rewards did. Sending an item back with the
   * price it already has is not a change, so the rest of a dear item can still
   * be edited here.
   */
  app.post(
    '/shop/items',
    { schema: { body: itemBody }, preHandler: requireRoles('admin', 'superadmin') },
    async (req) => {
      const body = req.body as z.infer<typeof itemBody>;
      if (body.price >= SENSITIVE_PRICE) {
        const { rows } = await app.db.query<{ price: number; currency: string }>(
          `SELECT price, currency FROM shop_items WHERE sku = $1`,
          [body.sku],
        );
        const was = rows[0];
        if (!was || was.price !== body.price || was.currency !== body.currency) {
          throw new AppError(
            'PRICE_NEEDS_APPROVAL',
            409,
            `a price of ${SENSITIVE_PRICE.toLocaleString('en')} or more goes through Approvals, where a second admin signs off`,
          );
        }
      }
      return shop.createItem(body);
    },
  );

  /** Admin: pull an item in/out of stock. */
  app.patch(
    '/shop/items/:sku/stock',
    {
      schema: { params: z.object({ sku: z.string().max(80) }), body: z.object({ inStock: z.boolean() }) },
      preHandler: requireRoles('admin', 'superadmin'),
    },
    async (req) => {
      const { sku } = req.params as { sku: string };
      await shop.setStock(sku, (req.body as { inStock: boolean }).inStock);
      return { ok: true };
    },
  );

  /**
   * Admin: the FULL catalog, including inactive / out-of-stock items and their
   * prices. `GET /shop` is the player-facing view (filtered to what they can buy),
   * so managing prices needs its own unfiltered listing.
   */
  app.get(
    '/admin/shop/items',
    { config: { skipValidation: true }, preHandler: requireRoles('admin', 'superadmin') },
    async () => ({ items: await shop.allItems() }),
  );
  /** Public URL for a stored asset key (null when storage is unconfigured). */
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);

  /** Live catalog, filtered to what this user can currently see/buy. Cosmetic
   *  items carry a resolved `assetUrl` so the client can render thumbnails. */
  app.get('/shop', { preHandler: requireAuth }, async (req) => ({
    items: (await shop.catalog(req.user!.id)).map((i) => ({
      ...i,
      assetUrl: cosmeticAssetUrl(i.category, i.assetKey, publicUrl),
    })),
  }));

  /** Buy an item. Atomic validate → debit → grant; idempotency key required. */
  app.post(
    '/shop/purchase',
    {
      schema: { body: purchaseBody },
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const { sku, idempotencyKey, expectedPrice } = req.body as z.infer<typeof purchaseBody>;
      return shop.purchase(req.user!.id, sku, idempotencyKey, new Date(), expectedPrice);
    },
  );

  /**
   * Buy an item for a friend.
   *
   * Friends only, deliberately. An unsolicited gift from a stranger is a way to
   * put your name in front of someone who has not agreed to hear from you — the
   * same reason direct messages are friends-only. It also means the notification
   * it sends can never be used to reach a stranger.
   *
   * The same send as the chat's gift button (`GiftService`), with its rules,
   * and like every gift it arrives in the chat between the two of you — which
   * is why it now asks for the birth month a message asks for. The answer
   * keeps the shape this route has always had.
   */
  app.post(
    '/shop/gift',
    {
      schema: { body: giftBody },
      config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireBirthMonth,
    },
    async (req) => {
      const { sku, toUserId, idempotencyKey, expectedPrice } = req.body as z.infer<typeof giftBody>;
      const result = await deps.gifts.send({
        fromId: req.user!.id,
        toIds: [toUserId],
        sku,
        chat: null,
        idempotencyKey,
        expectedPrice,
      });
      const refused = result.skipped[0];
      if (refused) throw SHOP_GIFT_REFUSALS[refused.reason]();
      return {
        gifted: true,
        duplicate: result.duplicate,
        sku: result.item.sku,
        // in the item's own currency, as it always was
        balance: result.balance[result.item.currency],
      };
    },
  );

  /** Gifts the caller has received, and how many are unopened. */
  app.get('/me/gifts', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => ({
    gifts: (await shop.giftsReceived(req.user!.id)).map((g) => ({
      ...g,
      assetUrl: cosmeticAssetUrl(g.category, g.assetKey, publicUrl),
    })),
    unseen: await shop.unseenGiftCount(req.user!.id),
  }));

  /**
   * Just the count.
   *
   * Every signed-in tab asked for this once a minute to draw the badge, and the
   * full list joins shop_items and users for up to fifty rows to answer a
   * question that is really "any?". The count now rides on `/me/social`
   * (`unread.gifts`), which the apps already poll; this stays for the phone
   * builds in people's hands that still ask here.
   */
  app.get('/me/gifts/unseen', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => ({
    unseen: await shop.unseenGiftCount(req.user!.id),
  }));

  /** Mark received gifts as opened (clears the badge). */
  app.post('/me/gifts/seen', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => ({
    seen: await shop.markGiftsSeen(req.user!.id),
  }));

  /**
   * The caller's owned items, incl. a resolved cosmetic `assetUrl`.
   *
   * Items whose art was replaced also say what returning them gives back
   * (`refund`, null when nothing would), and `refreshedItems` lists the ones
   * the caller has not been told about yet — see shared/src/cosmetics.ts.
   */
  app.get('/me/inventory', { preHandler: requireAuth }, async (req) => {
    const userId = req.user!.id;
    const [items, refunds, refreshedItems] = await Promise.all([
      shop.inventory(userId),
      deps.returns?.refunds(userId),
      deps.returns?.unnoticed(userId),
    ]);
    return {
      items: items.map((i) => ({
        ...i,
        assetUrl: cosmeticAssetUrl(i.category, i.assetKey, publicUrl),
        refund: refunds?.get(i.sku) ?? null,
      })),
      refreshedItems: refreshedItems ?? [],
    };
  });

  const returns = deps.returns;
  if (returns) {
    /** The one-time "we refreshed your items" notice has been shown. */
    app.post(
      '/me/inventory/refreshed/seen',
      { config: { skipValidation: true }, preHandler: requireAuth },
      async (req) => ({ seen: await returns.markNoticed(req.user!.id) }),
    );

    /**
     * Return an item whose art was replaced, for what was paid for it. Only
     * the replaced items, only by an owner who bought one, and only once — a
     * repeat answers `duplicate: true` and pays nothing.
     */
    app.post(
      '/shop/items/:sku/return',
      {
        // no body: the item is in the path, and the refund was settled when its art changed
        schema: { params: z.object({ sku: z.string().min(1).max(80) }) },
        config: { skipValidation: true, rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
        preHandler: requireAuth,
      },
      async (req) => returns.returnItem(req.user!.id, (req.params as { sku: string }).sku),
    );
  }
}
