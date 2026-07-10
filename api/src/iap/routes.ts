import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { AppConfig } from '../config/env.js';
import type { IapService } from './service.js';

const platform = z.enum(['apple', 'google']);

const redeemBody = z.object({
  platform,
  productId: z.string().min(1).max(120),
  /** opaque store receipt/token, validated server-to-server */
  receipt: z.string().min(1).max(20_000),
});

const packBody = z.object({
  platform,
  productId: z.string().min(1).max(120),
  gems: z.number().int().min(1).max(1_000_000),
  active: z.boolean().optional(),
});

/** In-app purchases (KUR-072): redeem, refund webhook, restore. */
export function registerIapRoutes(app: FastifyInstance, iap: IapService, config: AppConfig): void {
  /** Admin: define a gem pack. */
  app.post(
    '/iap/packs',
    { schema: { body: packBody }, preHandler: requireRoles('admin') },
    async (req) => {
      await iap.createPack(req.body as z.infer<typeof packBody>);
      return { ok: true };
    },
  );

  /** Redeem a validated store receipt for Gems (idempotent per transaction). */
  app.post(
    '/iap/redeem',
    {
      schema: { body: redeemBody },
      config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const { platform: p, productId, receipt } = req.body as z.infer<typeof redeemBody>;
      return iap.redeem(req.user!.id, p, receipt, productId);
    },
  );

  /** The caller's receipts, for restore-purchases reconciliation. */
  app.get('/me/iap/receipts', { preHandler: requireAuth }, async (req) => ({
    receipts: await iap.receipts(req.user!.id),
  }));

  /**
   * Store refund webhook → Gem clawback. Guarded by a shared secret; disabled
   * (503) when unconfigured so we never expose an unauthenticated clawback.
   * Real Apple JWS / Google RTDN signature verification is a follow-up.
   */
  app.post(
    '/iap/webhooks/:platform',
    {
      schema: {
        params: z.object({ platform }),
        body: z.object({ transactionId: z.string().min(1).max(200) }),
      },
    },
    async (req) => {
      if (!config.IAP_WEBHOOK_SECRET) {
        throw new AppError('WEBHOOK_DISABLED', 503, 'iap webhooks are not configured');
      }
      if (req.headers['x-iap-secret'] !== config.IAP_WEBHOOK_SECRET) {
        throw new AppError('UNAUTHORIZED', 401, 'bad webhook secret');
      }
      const { platform: p } = req.params as { platform: 'apple' | 'google' };
      const { transactionId } = req.body as { transactionId: string };
      return iap.refund(p, transactionId);
    },
  );
}
