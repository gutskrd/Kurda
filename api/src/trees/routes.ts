import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TREE_POUR_MOST } from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import type { TreeService } from './service.js';

/** A kind's key; one that names no kind is answered 404 by the service. */
const kindBody = z.object({ species: z.string().min(1).max(24) });
const kindParams = z.object({ species: z.string().min(1).max(24) });
/** How much to pour; left out, one. */
const pourBody = z.object({ count: z.number().int().min(1).max(TREE_POUR_MOST).optional() });

/** What changes a tree is asked for by a person's hand, a few times a minute at most. */
const HAND = { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } };

/** The learner's tree: reading it, planting, watering and buying a kind (trees/service.ts). */
export function registerTreeRoutes(app: FastifyInstance, trees: TreeService): void {
  /** The tree that stands (null before the first), the kinds there are, and the learner's Zêr (MyTree). */
  app.get('/me/tree', { preHandler: requireAuth }, async (req) => trees.mine(req.user!.id));

  /** Plant a kind, in place of the tree that stands if there is one. 404 TREE_NOT_FOUND, 403 TREE_NOT_OWNED. */
  app.post('/me/tree/plant', { schema: { body: kindBody }, config: HAND, preHandler: requireAuth }, async (req) =>
    trees.plant(req.user!.id, (req.body as z.infer<typeof kindBody>).species),
  );

  /** Pour held water onto the tree (Watered). 404 TREE_NOT_PLANTED, 409 TREE_NO_WATER. */
  app.post('/me/tree/water', { schema: { body: pourBody }, config: { rateLimit: { max: 120, windowMs: 60_000, per: 'user-or-ip' as const } }, preHandler: requireAuth }, async (req) =>
    trees.water(req.user!.id, (req.body as z.infer<typeof pourBody>).count ?? 1),
  );

  /** Buy a kind with Zêr, to plant whenever wanted. 404 TREE_NOT_FOUND, 409 TREE_OWNED, 402 INSUFFICIENT_FUNDS. */
  app.post('/me/tree/kinds/:species/buy', { schema: { params: kindParams }, config: { skipValidation: true, ...HAND }, preHandler: requireAuth }, async (req) =>
    trees.buy(req.user!.id, (req.params as z.infer<typeof kindParams>).species),
  );
}
