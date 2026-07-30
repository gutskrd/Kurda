import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { NotificationPrefsService } from './prefs-service.js';

const minute = z.number().int().min(0).max(1439);

const patchBody = z
  .object({
    streak: z.boolean().optional(),
    friends: z.boolean().optional(),
    games: z.boolean().optional(),
    events: z.boolean().optional(),
    marketing: z.boolean().optional(),
    quietStartMin: minute.nullable().optional(),
    quietEndMin: minute.nullable().optional(),
  })
  // quiet hours are a pair: set both or neither
  .refine(
    (b) =>
      (b.quietStartMin === undefined && b.quietEndMin === undefined) ||
      (b.quietStartMin === null && b.quietEndMin === null) ||
      (typeof b.quietStartMin === 'number' && typeof b.quietEndMin === 'number'),
    { message: 'quietStartMin and quietEndMin must be set together', path: ['quietStartMin'] },
  );

/** Per-category notification toggles + quiet hours (KUR-095). */
export function registerNotificationRoutes(app: FastifyInstance, prefs: NotificationPrefsService): void {
  app.get('/me/notification-prefs', { preHandler: requireAuth }, async (req) => prefs.get(req.user!.id));

  app.put(
    '/me/notification-prefs',
    { schema: { body: patchBody }, preHandler: requireAuth },
    async (req) => prefs.update(req.user!.id, req.body as z.infer<typeof patchBody>),
  );
}
