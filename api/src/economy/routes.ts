import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import type { EconomyService } from './service.js';
import { RECONCILE_LIST_MAX, WalletReconciler } from '../wallet/reconcile.js';

const currencyQuery = z.object({
  currency: z.enum(['zer', 'gems']).default('zer'),
  days: z.coerce.number().int().min(1).max(365).optional(),
});

/** Economy monitoring dashboard (KUR-074), admin-only. */
export function registerEconomyRoutes(app: FastifyInstance, economy: EconomyService): void {
  const reconciler = new WalletReconciler(app.db);

  /**
   * Does every balance still equal the sum of its ledger? The daily job asks
   * the same (jobs/wallet-jobs.ts); this answers now, for the console. It
   * reads the whole ledger, so it is limited to a few asks a minute.
   */
  app.get(
    '/admin/economy/reconcile',
    {
      schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(RECONCILE_LIST_MAX).optional() }) },
      config: { rateLimit: { max: 6, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireRoles('admin'),
    },
    async (req) => reconciler.check({ limit: (req.query as { limit?: number }).limit }),
  );

  /** Net-supply time series for the chart. */
  app.get(
    '/admin/economy/supply',
    { schema: { querystring: currencyQuery }, preHandler: requireRoles('admin') },
    async (req) => {
      const { currency, days } = req.query as z.infer<typeof currencyQuery>;
      return { currency, points: await economy.supply(currency, days ?? 30) };
    },
  );

  /** Weekly faucet/sink drift + alert flag. */
  app.get(
    '/admin/economy/drift',
    {
      schema: {
        querystring: currencyQuery.extend({ target: z.coerce.number().positive().max(100).optional() }),
      },
      preHandler: requireRoles('admin'),
    },
    async (req) => {
      const { currency, target } = req.query as { currency: 'zer' | 'gems'; target?: number };
      return economy.drift(currency, target ?? 1);
    },
  );

  /** Manually (re)aggregate a day — the daily job calls the same path. */
  app.post(
    '/admin/economy/aggregate',
    {
      schema: { body: z.object({ day: z.coerce.date().optional() }) },
      preHandler: requireRoles('admin'),
    },
    async (req) => {
      const { day } = req.body as { day?: Date };
      await economy.aggregateDay(day ?? new Date());
      return { ok: true };
    },
  );
}
