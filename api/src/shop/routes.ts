import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { requireAccount, requireAuth, requireRoles } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { cosmeticAssetUrl } from '../cosmetics/access.js';
import { AppError } from '../plugins/errors.js';
import { SENSITIVE_PRICE } from '../admin/config-service.js';
import type { ShopService } from './service.js';
import type { RefreshedNotices } from './refreshed.js';
import type { GiftService, SkipReason } from '../gifts/service.js';
import { parentalAllows } from '../parental/supervision.js';

const itemBody = z.object({
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  // 'tag' is the Kurdish identity tag (tag_kurdish); without it the item could be listed but never saved again.
  category: z.enum(['cosmetic', 'background', 'icon', 'powerup', 'freeze', 'tag', 'sticker', 'gift', 'misc']).optional(),
  /** every price is in Zêr; the field stays so older consoles keep working */
  currency: z.literal('zer').default('zer'),
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
  toUserId: lowerUuid(),
  idempotencyKey: z.string().min(8).max(120),
  expectedPrice: z.number().int().min(0).max(10_000_000).optional(),
  /** a big gift's second confirmation, as `POST /gifts` takes it */
  confirmToken: z.string().min(1).max(120).optional(),
});

const purchaseBody = z.object({
  sku: z.string().min(1).max(80),
  /** Required so retries never charge twice. */
  idempotencyKey: z.string().min(8).max(120),
  /** The price the client showed; refused if it has changed. */
  expectedPrice: z.number().int().min(0).max(10_000_000).optional(),
});

/**
 * How the shop's gift button refuses its one friend: as an error, whose codes installed phone builds read. The chat's
 * route (`POST /gifts`) lists the skipped instead, since a group gift can reach some friends and not others.
 */
const SHOP_GIFT_REFUSALS: Readonly<Record<SkipReason, () => AppError>> = {
  already_owned: () => new AppError('ALREADY_OWNED', 409, 'they already own this item'),
  not_allowed: () =>
    new AppError('GIFT_NOT_ALLOWED', 403, 'a gift to a new friend can be sent once you have been friends for a day'),
  daily_limit: () => new AppError('GIFT_DAILY_LIMIT', 429, 'that is all the gifts for today'),
};

/**
 * Shop catalogue, purchases, gifting and inventory. Every purchase is final: no route returns an item for currency,
 * and the owner of an item whose art was replaced is told once and keeps it.
 */
export function registerShopRoutes(
  app: FastifyInstance,
  shop: ShopService,
  deps: { gifts: GiftService; refreshed?: RefreshedNotices },
): void {
  /**
   * Admin: creates or updates a catalogue item. A new price of 1,000 or more is refused here, since it needs a second
   * admin's sign-off (POST /admin/config/changes) and this route must not bypass that; resending an item's existing
   * price is not a change, so the rest of an expensive item can still be edited.
   */
  app.post(
    '/shop/items',
    { schema: { body: itemBody }, preHandler: requireRoles('admin', 'superadmin') },
    async (req) => {
      const body = req.body as z.infer<typeof itemBody>;
      if (body.price >= SENSITIVE_PRICE) {
        const { rows } = await app.db.query<{ price: number }>(`SELECT price FROM shop_items WHERE sku = $1`, [body.sku]);
        const was = rows[0];
        if (!was || was.price !== body.price) {
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

  /** Public URL for a stored asset key (null when storage is unconfigured). */
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);

  /**
   * Admin: the full catalogue with inactive and out-of-stock items and their prices, since `GET /shop` shows only what
   * a player can buy. Each item has its art URL and owner count; retired items only with `?retired=include`.
   */
  app.get(
    '/admin/shop/items',
    {
      schema: { querystring: z.object({ retired: z.enum(['include', 'exclude']).optional() }) },
      preHandler: requireRoles('admin', 'superadmin'),
    },
    async (req) => {
      const { retired } = req.query as { retired?: 'include' | 'exclude' };
      return {
        items: (await shop.allItems({ retired })).map((i) => ({
          ...i,
          assetUrl: cosmeticAssetUrl(i.category, i.assetKey, publicUrl, i.sku),
        })),
      };
    },
  );

  /** The live catalogue this user can see and buy, with a resolved `assetUrl` on cosmetic items for thumbnails. */
  app.get('/shop', { preHandler: requireAuth }, async (req) => ({
    items: (await shop.catalog(req.user!.id)).map((i) => ({
      ...i,
      assetUrl: cosmeticAssetUrl(i.category, i.assetKey, publicUrl, i.sku),
    })),
    // false for a supervised teen whose parent switched buying with real money off, so the apps never start a purchase;
    // a receipt already paid is still credited (iap/routes.ts)
    purchasesAllowed: await parentalAllows(app.db, req.user!.id, 'purchases'),
  }));

  /** Buy an item. Atomic validate → debit → grant; idempotency key required. */
  app.post(
    '/shop/purchase',
    {
      schema: { body: purchaseBody },
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAccount,
    },
    async (req) => {
      const { sku, idempotencyKey, expectedPrice } = req.body as z.infer<typeof purchaseBody>;
      return shop.purchase(req.user!.id, sku, idempotencyKey, new Date(), expectedPrice);
    },
  );

  /**
   * Buys an item for a friend; friends only, as an unsolicited gift would put a stranger's name in front of someone, as
   * direct messages are friends-only. It is the chat gift button's send (`GiftService`) with its rules, arriving in the
   * pair's chat, so it needs a birth month like a message. The answer keeps this route's original shape.
   */
  app.post(
    '/shop/gift',
    {
      schema: { body: giftBody },
      config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: [requireAccount, requireBirthMonth],
    },
    async (req) => {
      const { sku, toUserId, idempotencyKey, expectedPrice, confirmToken } = req.body as z.infer<typeof giftBody>;
      const result = await deps.gifts.send({
        fromId: req.user!.id,
        toIds: [toUserId],
        sku,
        chat: null,
        idempotencyKey,
        expectedPrice,
        confirmToken,
      });
      const refused = result.skipped[0];
      if (refused) throw SHOP_GIFT_REFUSALS[refused.reason]();
      return {
        gifted: true,
        duplicate: result.duplicate,
        sku: result.item.sku,
        balance: result.balance.zer,
      };
    },
  );

  /** Gifts the caller has received, and how many are unopened. */
  app.get('/me/gifts', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => ({
    gifts: (await shop.giftsReceived(req.user!.id)).map((g) => ({
      ...g,
      assetUrl: cosmeticAssetUrl(g.category, g.assetKey, publicUrl, g.sku),
    })),
    unseen: await shop.unseenGiftCount(req.user!.id),
  }));

  /**
   * Just the unopened gift count, for the phone's badge; the browser reads it from `/me/social`, but the phone has no
   * such poll, and the full list joins two tables for up to fifty rows to answer "any?".
   */
  app.get('/me/gifts/unseen', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => ({
    unseen: await shop.unseenGiftCount(req.user!.id),
  }));

  /** Mark received gifts as opened (clears the badge). */
  app.post('/me/gifts/seen', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => ({
    seen: await shop.markGiftsSeen(req.user!.id),
  }));

  /** The caller's owned items with a resolved `assetUrl`, and `refreshedItems` not yet announced (shared/src/cosmetics.ts). */
  app.get('/me/inventory', { preHandler: requireAuth }, async (req) => {
    const userId = req.user!.id;
    const [items, refreshedItems] = await Promise.all([shop.inventory(userId), deps.refreshed?.unnoticed(userId)]);
    return {
      items: items.map((i) => ({
        ...i,
        assetUrl: cosmeticAssetUrl(i.category, i.assetKey, publicUrl, i.sku),
      })),
      refreshedItems: refreshedItems ?? [],
    };
  });

  const refreshed = deps.refreshed;
  if (refreshed) {
    /** The one-time "we refreshed your items" notice has been shown. */
    app.post(
      '/me/inventory/refreshed/seen',
      { config: { skipValidation: true }, preHandler: requireAccount },
      async (req) => ({ seen: await refreshed.markNoticed(req.user!.id) }),
    );
  }
}
