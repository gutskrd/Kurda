import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { requireCapability } from '../admin/routes.js';

/** Moderators, superadmins and the legacy admin role (it used to be only the last). */
const moderators = [requireAuth, requireCapability('moderation.act')];
import type { AiModerationService } from './ai-service.js';
import type { ImageModerationService } from './image-moderation-service.js';
import type { PictureReviewService } from './pictures-service.js';

/**
 * Admin routes for the automated moderation tier: the pending-flags feed (the automated half of the queue) and the
 * reversal path, so a moderator can confirm or overturn any auto-action.
 */
export function registerAiModerationRoutes(app: FastifyInstance, ai: AiModerationService): void {
  app.get(
    '/admin/moderation/flags',
    { config: { skipValidation: true }, preHandler: moderators },
    async () => ({ flags: await ai.pending() }),
  );

  app.post(
    '/admin/moderation/flags/:id/resolve',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z.object({ outcome: z.enum(['actioned', 'reversed']) }),
      },
      preHandler: moderators,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { outcome } = req.body as { outcome: 'actioned' | 'reversed' };
      const ok = await ai.resolve(id, req.user!.id, outcome);
      if (!ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no pending flag with that id' });
      return { resolved: true, outcome };
    },
  );
}

/**
 * Admin routes for the automatic image-scan tier: the pending image-flag feed, each with its case, and its two buttons,
 * decided as the Picture checks page decides (pictures-service.ts `resolveFlag`): `actioned` removes the picture with a
 * removal notice and appeal for its owner, `reversed` approves it. A child-safety flag is refused here (403); it is
 * decided from its case.
 */
export function registerImageModerationRoutes(app: FastifyInstance, images: ImageModerationService, pictures: PictureReviewService): void {
  app.get(
    '/admin/moderation/image-flags',
    { config: { skipValidation: true }, preHandler: moderators },
    async () => ({ flags: await images.pending() }),
  );

  app.post(
    '/admin/moderation/image-flags/:id/resolve',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z.object({ outcome: z.enum(['actioned', 'reversed']) }),
      },
      preHandler: moderators,
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { outcome } = req.body as { outcome: 'actioned' | 'reversed' };
      const ok = await pictures.resolveFlag(id, req.user!.id, outcome);
      if (!ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no pending image flag with that id' });
      return { resolved: true, outcome };
    },
  );
}
