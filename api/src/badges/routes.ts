import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SHOWCASE_SIZE } from '@kurda/shared';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { RANK_TOOL_ROLES } from '../admin/roles.js';
import type { BadgeService } from './service.js';

const showcaseBody = z.object({ keys: z.array(z.string().min(1).max(40)).max(SHOWCASE_SIZE) });
const seenBody = z.object({ keys: z.array(z.string().min(1).max(40)).max(64).optional() }).optional();
const adminBody = z.object({
  action: z.enum(['award', 'revoke']),
  tier: z.number().int().min(0).max(4),
  reason: z.string().trim().min(3).max(500),
});

/**
 * Badges (contract 4 §B): the learner's badge page, the unlocks still to
 * celebrate, the three on their profile; and the admin's catalogue, a
 * learner's badges, award/revoke with a reason, and rarity. Shapes are
 * @kurda/shared's `BadgesResponse`, `UnseenBadge` and `ShowcaseBadge`.
 */
export function registerBadgeRoutes(app: FastifyInstance, badges: BadgeService): void {
  /** Every badge with the caller's tier and progress, secrets as "???", rarity once there are enough people. */
  app.get('/me/badges', { preHandler: requireAuth }, async (req) => badges.list(req.user!.id));

  /** Unlocks not yet celebrated (for an app that was closed when `badge_unlocked` was sent). */
  app.get('/me/badges/unseen', { preHandler: requireAuth }, async (req) => ({ unseen: await badges.unseen(req.user!.id) }));

  /** The celebration was shown: these badges' (or every) unlocks are seen. */
  app.post('/me/badges/seen', { schema: { body: seenBody }, preHandler: requireAuth }, async (req) => {
    await badges.markSeen(req.user!.id, (req.body as z.infer<typeof seenBody>)?.keys);
    return { seen: true };
  });

  /** Up to three earned badges for the profile, in order. */
  app.put('/me/badges/showcase', { schema: { body: showcaseBody }, preHandler: requireAuth }, async (req) => ({
    showcase: await badges.setShowcase(req.user!.id, (req.body as z.infer<typeof showcaseBody>).keys),
  }));

  /** Admin: the catalogue, holders per tier, and the rarity last computed. */
  app.get('/admin/badges', { preHandler: requireRoles(...RANK_TOOL_ROLES) }, async () => badges.adminCatalogue());

  /** Admin: compute rarity now (it also runs nightly). */
  app.post('/admin/badges/rarity', { config: { skipValidation: true }, preHandler: requireRoles(...RANK_TOOL_ROLES) }, async () =>
    badges.computeRarity(),
  );

  /** Admin: one learner's badges and every award and revoke on them. */
  app.get(
    '/admin/users/:id/badges',
    { schema: { params: z.object({ id: z.uuid() }) }, preHandler: requireRoles(...RANK_TOOL_ROLES) },
    async (req) => badges.adminUser((req.params as { id: string }).id),
  );

  /**
   * Admin: award a badge up to a tier, or revoke it down to one, with a reason
   * (kept with the action; the audit log records the request as well).
   */
  app.post(
    '/admin/users/:id/badges/:key',
    {
      schema: { params: z.object({ id: z.uuid(), key: z.string().min(1).max(40) }), body: adminBody },
      preHandler: requireRoles(...RANK_TOOL_ROLES),
    },
    async (req) => {
      const { id, key } = req.params as { id: string; key: string };
      const body = req.body as z.infer<typeof adminBody>;
      return badges.adminSet(id, key, body.action, body.tier, body.reason, req.user!.id);
    },
  );
}
