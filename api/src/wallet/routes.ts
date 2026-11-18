import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { WalletService } from './service.js';

export function registerWalletRoutes(app: FastifyInstance): void {
  const wallet = new WalletService(app.db);

  /** Balances and recent history; credits and debits happen only inside features. */
  app.get('/me/wallet', { preHandler: requireAuth }, async (req) => {
    const [balances, history] = await Promise.all([
      wallet.balances(req.user!.id),
      wallet.history(req.user!.id, 25),
    ]);
    return { balances, history };
  });
}
