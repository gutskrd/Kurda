import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { ShopService } from './service.js';

const itemBody = z.object({
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.enum(['cosmetic', 'powerup', 'freeze', 'misc']).optional(),
  currency: z.enum(['zer', 'gems']),
  price: z.number().int().min(0).max(10_000_000),
  isUnique: z.boolean().optional(),
  active: z.boolean().optional(),
  inStock: z.boolean().optional(),
  availableFrom: z.coerce.date().optional(),
  availableTo: z.coerce.date().optional(),
});

const purchaseBody = z.object({
  sku: z.string().min(1).max(80),
  /** required so retries never double-charge (KUR-071) */
  idempotencyKey: z.string().min(8).max(120),
  /** the price the client displayed; rejected if it changed (KUR-070) */
  expectedPrice: z.number().int().min(0).max(10_000_000).optional(),
});

/** Shop catalog + purchase + inventory (KUR-071). */
export function registerShopRoutes(app: FastifyInstance, shop: ShopService): void {
  /** Admin: create/update a catalog item. */
  app.post(
    '/shop/items',
    { schema: { body: itemBody }, preHandler: requireRoles('admin') },
    async (req) => shop.createItem(req.body as z.infer<typeof itemBody>),
  );

  /** Admin: pull an item in/out of stock. */
  app.patch(
    '/shop/items/:sku/stock',
    {
      schema: { params: z.object({ sku: z.string().max(80) }), body: z.object({ inStock: z.boolean() }) },
      preHandler: requireRoles('admin'),
    },
    async (req) => {
      const { sku } = req.params as { sku: string };
      await shop.setStock(sku, (req.body as { inStock: boolean }).inStock);
      return { ok: true };
    },
  );

  /** Live catalog, filtered to what this user can currently see/buy. */
  app.get('/shop', { preHandler: requireAuth }, async (req) => ({ items: await shop.catalog(req.user!.id) }));

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

  /** The caller's owned items. */
  app.get('/me/inventory', { preHandler: requireAuth }, async (req) => ({
    items: await shop.inventory(req.user!.id),
  }));
}
