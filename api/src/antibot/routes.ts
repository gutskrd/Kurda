import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { BotDetectionService } from './service.js';

const userParam = z.object({ userId: z.uuid() });

/**
 * Behavioral bot detection routes (KUR-110). Admin review + confirm/clear of
 * flagged accounts, a manual scoring-job trigger, and the authenticated
 * challenge check the client calls at session start to decide whether to present
 * the invisible CAPTCHA.
 */
export function registerAntibotRoutes(app: FastifyInstance, bots: BotDetectionService): void {
  /** Client session-start check: does this account owe an invisible CAPTCHA? */
  app.get(
    '/antibot/challenge',
    { config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => ({ required: await bots.requiresChallenge(req.user!.id) }),
  );

  /** Flagged accounts awaiting review (most suspicious first). */
  app.get(
    '/admin/antibot/flagged',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => ({ flagged: await bots.flaggedForReview() }),
  );

  /** Run the scoring job over all active accounts (also scheduled). */
  app.post(
    '/admin/antibot/score',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => ({ scored: await bots.scoreActive() }),
  );

  /** Confirm a bot: reverse its XP gains through the ledger. */
  app.post(
    '/admin/antibot/:userId/reverse',
    { schema: { params: userParam }, config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async (req) => ({ reversedXp: await bots.confirmAndReverse((req.params as { userId: string }).userId, req.user!.id) }),
  );

  /** Clear a false positive. */
  app.post(
    '/admin/antibot/:userId/clear',
    { schema: { params: userParam }, config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async (req, reply) => {
      const ok = await bots.clear((req.params as { userId: string }).userId, req.user!.id);
      if (!ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no active bot score for that user' });
      return { cleared: true };
    },
  );
}
