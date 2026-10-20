/**
 * The admin's shop tools beyond the whole-row upsert (shop/routes.ts):
 *
 *   POST   /admin/shop/art/:kind           upload a background's or an icon's art (raw image body)
 *   POST   /admin/shop/items               add an item, refusing an SKU that is taken
 *   PATCH  /shop/items/:sku                change only the fields sent
 *   GET    /admin/shop/items/:sku/usage    who owns, wears or was given it: what deleting it would do
 *   DELETE /shop/items/:sku                delete it, or retire it when people have it
 *
 * Admin-only, behind the admin's second factor like every staff route
 * (admin/admin-gate.ts), and every change is in the audit log twice over: the
 * request, by the log's own hook (admin/audit-routes.ts), and what it changed,
 * before and after, written here.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ART_KINDS, cosmeticAssetUrl, type ArtKind } from '../cosmetics/access.js';
import { SENSITIVE_PRICE } from '../admin/config-service.js';
import { AuditService } from '../admin/audit-service.js';
import type { AppConfig } from '../config/env.js';
import { mediaLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { storeArt } from './art.js';
import { CatalogueEditor } from './catalogue.js';
import type { ShopItem, ShopService } from './service.js';

const CATEGORIES = ['cosmetic', 'background', 'icon', 'powerup', 'freeze', 'tag', 'misc'] as const;

const skuParams = z.object({ sku: z.string().min(1).max(80) });

/** The same fields as the upsert's body (shop/routes.ts), for an item that must be new. */
const addBody = z.object({
  sku: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9_-]*$/, 'lower-case letters, digits, - and _'),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  category: z.enum(CATEGORIES).optional(),
  currency: z.enum(['zer', 'gems']),
  price: z.number().int().min(0).max(10_000_000),
  isUnique: z.boolean().optional(),
  active: z.boolean().optional(),
  inStock: z.boolean().optional(),
  availableFrom: z.coerce.date().optional(),
  availableTo: z.coerce.date().optional(),
  assetKey: z.string().max(200).optional(),
  premiumOnly: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(100_000).optional(),
});

/** Every field optional; null clears the ones that may be empty. */
const editBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().max(500).nullable(),
    category: z.enum(CATEGORIES),
    currency: z.enum(['zer', 'gems']),
    price: z.number().int().min(0).max(10_000_000),
    isUnique: z.boolean(),
    active: z.boolean(),
    inStock: z.boolean(),
    availableFrom: z.coerce.date().nullable(),
    availableTo: z.coerce.date().nullable(),
    assetKey: z.string().max(200).nullable(),
    premiumOnly: z.boolean(),
    displayOrder: z.number().int().min(0).max(100_000),
  })
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), 'send at least one field to change');

export function registerShopAdminRoutes(app: FastifyInstance, shop: ShopService, config: AppConfig): void {
  const audit = new AuditService(app.db);
  const editor = new CatalogueEditor(app.db, shop, audit);
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  const limits = mediaLimits(config);
  const admin = requireRoles('admin', 'superadmin');
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);
  const withArt = <T extends ShopItem>(item: T): T & { assetUrl: string | null } => ({
    ...item,
    assetUrl: cosmeticAssetUrl(item.category, item.assetKey, publicUrl),
  });

  /**
   * Upload a background's or an icon's art. The body is the picture's bytes
   * (any of the image content types, or application/octet-stream — the type
   * is read from the bytes, never from the label). Answers the key to save
   * the item with, where it is served from, and the size it was stored at.
   */
  app.post(
    '/admin/shop/art/:kind',
    {
      schema: { params: z.object({ kind: z.enum(ART_KINDS) }) },
      config: {
        rateLimit: { max: 60, windowMs: 60 * 60_000, per: 'user-or-ip' as const },
        skipValidation: true, // the body is raw bytes, not JSON
      },
      preHandler: admin,
    },
    async (req, reply) => {
      const { kind } = req.params as { kind: ArtKind };
      if (!app.storage) {
        throw new AppError('STORAGE_UNAVAILABLE', 503, 'picture storage is not set up on this server, so art cannot be uploaded');
      }
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_IMAGE', message: 'send the picture’s bytes as image/png, image/webp or image/jpeg' });

      const res = await storeArt({ pool: app.db, storage: app.storage, usage, limits, log: app.log }, kind, raw);
      if (!res.ok) {
        req.log.warn({ kind, code: res.code, bytes: raw.length }, 'shop art upload refused');
        return reply.code(res.status).send({ code: res.code, message: res.message, details: res.details, requestId: req.id });
      }
      const { art } = res;
      await audit.record(app.db, {
        adminId: req.user!.id,
        action: 'shop.art.upload',
        targetType: 'shop_art',
        targetId: art.key,
        after: { kind, width: art.width, height: art.height, bytes: art.bytes, reused: art.reused },
        requestId: req.id,
      });
      return reply.code(201).send(art);
    },
  );

  /**
   * Add an item. The upsert would replace an item that already has the SKU —
   * people's purchases and all — so this refuses one that is taken. A price of
   * SENSITIVE_PRICE or more goes through Approvals, as everywhere.
   */
  app.post('/admin/shop/items', { schema: { body: addBody }, preHandler: admin }, async (req, reply) => {
    const body = req.body as z.infer<typeof addBody>;
    if (body.price >= SENSITIVE_PRICE) {
      throw new AppError(
        'PRICE_NEEDS_APPROVAL',
        409,
        `a price of ${SENSITIVE_PRICE.toLocaleString('en')} or more goes through Approvals, where a second admin signs off`,
      );
    }
    if (body.availableFrom && body.availableTo && body.availableTo <= body.availableFrom) {
      throw new AppError('BAD_WINDOW', 400, 'the sale must end after it starts');
    }
    if ((body.category === 'background' || body.category === 'icon') && !body.assetKey) {
      throw new AppError('ART_REQUIRED', 400, `a ${body.category} needs its picture`);
    }
    const item = await shop.addItem(body);
    if (!item) throw new AppError('SKU_TAKEN', 409, 'an item already has this SKU');
    await audit.record(app.db, {
      adminId: req.user!.id,
      action: 'shop.item.add',
      targetType: 'shop_item',
      targetId: item.sku,
      after: item,
      requestId: req.id,
    });
    return reply.code(201).send({ ...withArt(item), retiredAt: null, owners: 0 });
  });

  /** Change only the fields sent; the rest of the item stays as it is. */
  app.patch(
    '/shop/items/:sku',
    { schema: { params: skuParams, body: editBody }, preHandler: admin },
    async (req) => {
      const { sku } = req.params as { sku: string };
      return withArt(await editor.edit(req.user!.id, req.id, sku, req.body as z.infer<typeof editBody>));
    },
  );

  /** What deleting an item would do: delete it, or retire it because people have it. */
  app.get(
    '/admin/shop/items/:sku/usage',
    { schema: { params: skuParams }, preHandler: admin },
    async (req) => editor.usage((req.params as { sku: string }).sku),
  );

  /**
   * Delete an item nobody has; retire one somebody owns, was given or is
   * wearing (shop/catalogue.ts). The answer says which happened and how many
   * people have it.
   */
  app.delete(
    '/shop/items/:sku',
    { schema: { params: skuParams }, preHandler: admin },
    async (req) => editor.remove(req.user!.id, req.id, (req.params as { sku: string }).sku),
  );
}
