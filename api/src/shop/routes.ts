import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { ShopService } from './service.js';

const itemBody = z.object({
  sku: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.string().max(40).optional(),
  currency: z.enum(['zer', 'gems']),
  price: z.number().int().min(0).max(10_000_000),
  isUnique: z.boolean().optional(),
  active: z.boolean().optional(),
  availableFrom: z.coerce.date().optional(),
  availableTo: z.coerce.date().optional(),
});

const purchaseBody = z.object({
  sku: z.string().min(1).max(80),
  /** required so retries never double-charge (KUR-071) */
  idempotencyKey: z.string().min(8).max(120),
});

/** Shop catalog + purchase + inventory (KUR-071). */
export function registerShopRoutes(app: FastifyInstance, shop: ShopService): void {
  /** Admin: create/update a catalog item. */
  app.post(
    '/shop/items',
    { schema: { body: itemBody }, preHandler: requireRoles('admin') },
    async (req) => shop.createItem(req.body as z.infer<typeof itemBody>),
  );

  /** Live catalog. */
  app.get('/shop', { preHandler: requireAuth }, async () => ({ items: await shop.catalog() }));

  /** Buy an item. Atomic validate → debit → grant; idempotency key required. */
  app.post(
    '/shop/purchase',
    {
      schema: { body: purchaseBody },
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const { sku, idempotencyKey } = req.body as z.infer<typeof purchaseBody>;
      return shop.purchase(req.user!.id, sku, idempotencyKey);
    },
  );

  /** The caller's owned items. */
  app.get('/me/inventory', { preHandler: requireAuth }, async (req) => ({
    items: await shop.inventory(req.user!.id),
  }));
}
