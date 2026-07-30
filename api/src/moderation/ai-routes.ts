import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireRoles } from '../plugins/auth.js';
import type { AiModerationService } from './ai-service.js';
import type { ImageModerationService } from './image-moderation-service.js';

/**
 * Admin surface for the automated moderation tier (KUR-293): the pending-flags
 * feed (the automated half of the #102 queue) and the reversibility path so a
 * moderator can confirm or overturn (false-positive) any auto-action.
 */
export function registerAiModerationRoutes(app: FastifyInstance, ai: AiModerationService): void {
  app.get(
    '/admin/moderation/flags',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => ({ flags: await ai.pending() }),
  );

  app.post(
    '/admin/moderation/flags/:id/resolve',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z.object({ outcome: z.enum(['actioned', 'reversed']) }),
      },
      preHandler: requireRoles('admin'),
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
 * Admin surface for the automatic image-scan tier (KUR-294): the pending
 * image-flag feed and the moderator reversal path (a false-positive `reversed`
 * re-clears the image; a preserved-evidence CSAM flag can only be actioned).
 */
export function registerImageModerationRoutes(app: FastifyInstance, images: ImageModerationService): void {
  app.get(
    '/admin/moderation/image-flags',
    { config: { skipValidation: true }, preHandler: requireRoles('admin') },
    async () => ({ flags: await images.pending() }),
  );

  app.post(
    '/admin/moderation/image-flags/:id/resolve',
    {
      schema: {
        params: z.object({ id: z.uuid() }),
        body: z.object({ outcome: z.enum(['actioned', 'reversed']) }),
      },
      preHandler: requireRoles('admin'),
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { outcome } = req.body as { outcome: 'actioned' | 'reversed' };
      const ok = await images.resolve(id, req.user!.id, outcome);
      if (!ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no pending image flag with that id' });
      return { resolved: true, outcome };
    },
  );
}
