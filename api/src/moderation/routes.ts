import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { requireCapability } from '../admin/routes.js';

/** Moderators, superadmins and the legacy admin role (it used to be only the last). */
const moderators = [requireAuth, requireCapability('moderation.act')];
import type { ModerationService } from './service.js';

/** Message reporting + admin moderation queue (KUR-086). */
export function registerModerationRoutes(app: FastifyInstance, moderation: ModerationService): void {
  /** Report a message; captures ~10 surrounding messages as context. */
  app.post(
    '/chat/reports',
    {
      schema: {
        body: z.object({
          messageType: z.enum(['dm', 'group']),
          messageId: z.uuid(),
          reason: z.string().max(300).optional(),
        }),
      },
      config: { rateLimit: { max: 20, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const { messageType, messageId, reason } = req.body as { messageType: 'dm' | 'group'; messageId: string; reason?: string };
      return moderation.report(req.user!.id, messageType, messageId, reason);
    },
  );

  /** Admin: open moderation queue with context. */
  app.get('/admin/moderation/reports', { preHandler: moderators }, async () => ({
    reports: await moderation.pendingReports(),
  }));

  /** Admin: resolve a report ('actioned' records an offense against the author). */
  app.post(
    '/admin/moderation/reports/:id/resolve',
    {
      schema: { params: z.object({ id: z.uuid() }), body: z.object({ action: z.enum(['actioned', 'dismissed']) }) },
      preHandler: moderators,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { action } = req.body as { action: 'actioned' | 'dismissed' };
      await moderation.resolveReport(id, action, req.user!.id);
      return { ok: true };
    },
  );
}
