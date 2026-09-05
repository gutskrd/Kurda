import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { cosmeticAssetUrl } from '../cosmetics/access.js';
import { AppError } from '../plugins/errors.js';
import type { ShopService } from './service.js';
import type { FriendService } from '../friends/service.js';
import type { InboxService } from '../notifications/inbox-service.js';

const itemBody = z.object({
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.enum(['cosmetic', 'background', 'icon', 'powerup', 'freeze', 'misc']).optional(),
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

/** Shop catalog + purchase + gifting + inventory (KUR-071). */
export function registerShopRoutes(
  app: FastifyInstance,
  shop: ShopService,
  deps: { friends?: FriendService; inbox?: InboxService } = {},
): void {
  /** Admin: create/update a catalog item. */
  app.post(
    '/shop/items',
    { schema: { body: itemBody }, preHandler: requireRoles('admin', 'superadmin') },
    async (req) => shop.createItem(req.body as z.infer<typeof itemBody>),
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
   * below can never be used to reach a stranger.
   */
  app.post(
    '/shop/gift',
    {
      schema: { body: giftBody },
      config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const { sku, toUserId, idempotencyKey, expectedPrice } = req.body as z.infer<typeof giftBody>;
      const from = req.user!.id;

      // checked before friendship: "you cannot gift yourself" is the accurate
      // answer, and nobody is friends with themselves
      if (from === toUserId) throw new AppError('GIFT_TO_SELF', 400, 'you cannot gift to yourself');

      if (deps.friends) {
        const status = await deps.friends.statusBetween(from, toUserId);
        if (status !== 'friends') {
          throw new AppError('NOT_FRIENDS', 403, 'you can only send gifts to friends');
        }
      }

      const result = await shop.gift(from, toUserId, sku, idempotencyKey, new Date(), expectedPrice);

      // outside the transaction on purpose: a notification that fails to send is
      // not a reason to undo someone's present
      if (!result.duplicate && deps.inbox) {
        const sender = await app.db.query<{ username: string }>(
          `SELECT username FROM users WHERE id = $1`,
          [from],
        );
        const who = sender.rows[0]?.username ?? 'Someone';
        await deps.inbox
          .record(toUserId, {
            category: 'friends',
            title: 'You have a gift',
            body: `${who} sent you ${result.name}.`,
            data: { kind: 'gift', giftId: result.giftId, sku: result.sku, fromUserId: from },
          })
          .catch(() => undefined);
      }

      return { gifted: true, duplicate: result.duplicate, sku: result.sku, balance: result.balance };
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

  /** Mark received gifts as opened (clears the badge). */
  app.post('/me/gifts/seen', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => ({
    seen: await shop.markGiftsSeen(req.user!.id),
  }));

  /** The caller's owned items, incl. a resolved cosmetic `assetUrl`. */
  app.get('/me/inventory', { preHandler: requireAuth }, async (req) => ({
    items: (await shop.inventory(req.user!.id)).map((i) => ({
      ...i,
      assetUrl: cosmeticAssetUrl(i.category, i.assetKey, publicUrl),
    })),
  }));
}
