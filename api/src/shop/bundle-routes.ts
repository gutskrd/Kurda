/**
 * Bundles over HTTP: the list as one person would buy it, the purchase, and the admin's view and edits. Prices come
 * from the server's rows alone; the client sends which bundle, its own request key and the price it showed.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AuditService } from '../admin/audit-service.js';
import { requireAccount, requireRoles } from '../plugins/auth.js';
import type { BundleService } from './bundles.js';

/** A bundle's id as a client may send it, read in its one lower-case spelling as every id is (http/ids.ts). */
const bundleId = () =>
  z
    .string()
    .min(1)
    .max(60)
    .regex(/^[A-Za-z0-9-]+$/)
    .transform((id) => id.toLowerCase());

const purchaseBody = z.object({
  bundle: bundleId(),
  /** Required so a retry never charges twice; one key, whatever case the client writes it in. */
  idempotencyKey: z
    .string()
    .min(8)
    .max(120)
    .transform((key) => key.toLowerCase()),
  /** The price the client showed; refused if it is not the price now. */
  expectedPrice: z.number().int().min(0).max(10_000_000).optional(),
});

const editBody = z
  .object({ active: z.boolean(), price: z.number().int().min(1).max(10_000_000) })
  .partial()
  .refine((b) => b.active !== undefined || b.price !== undefined, 'send at least one field to change');

export function registerBundleRoutes(app: FastifyInstance, bundles: BundleService): void {
  const audit = new AuditService(app.db);
  const admin = requireRoles('admin', 'superadmin');

  /** Every bundle on sale, priced for the caller, and whether they may be shown what it saves. */
  app.get('/shop/bundles', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => bundles.list(req.user!.id));

  /** Buy a bundle: one transaction that pays, gives and records, or does nothing. The rate is a single purchase's. */
  app.post(
    '/shop/bundles/purchase',
    {
      schema: { body: purchaseBody },
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAccount,
    },
    async (req) => {
      const { bundle, idempotencyKey, expectedPrice } = req.body as z.infer<typeof purchaseBody>;
      return bundles.purchase(req.user!.id, bundle, idempotencyKey, { expectedPrice });
    },
  );

  /** Admin: every bundle, listed or not, with its parts, their worth and how many have bought it. */
  app.get('/admin/shop/bundles', { config: { skipValidation: true }, preHandler: admin }, async () => ({ bundles: await bundles.allBundles() }));

  /** Admin: take a bundle off sale or list it again, or change its price (500 Zêr or more through Approvals). */
  app.patch(
    '/admin/shop/bundles/:id',
    { schema: { params: z.object({ id: bundleId() }), body: editBody }, preHandler: admin },
    async (req) => {
      const { id } = req.params as { id: string };
      return bundles.editBundle(audit, req.user!.id, req.id, id, req.body as z.infer<typeof editBody>);
    },
  );
}
