import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isArtSlot } from '@kurda/shared';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import type { ArtOverrideService } from './overrides.js';

const slotParam = z.object({ slot: z.string().min(3).max(120).refine(isArtSlot, 'no such picture') });
const setBody = z.object({ assetKey: z.string().min(1).max(200), note: z.string().trim().max(300).optional() });
const resetBody = z.object({ note: z.string().trim().max(300).optional() }).optional();

/**
 * Pictures put in place of the art that ships (art/overrides.ts).
 *
 * `GET /art/overrides` is public, as the pictures themselves are: the apps
 * load it at start, signed in or not, and briefly cached at the edge. The admin
 * routes are for the admins who keep the shop's art (the same who upload it),
 * behind the two-step code like every staff route; every change is in the
 * admin audit trail with the slot it changed.
 */
export function registerArtRoutes(app: FastifyInstance, art: ArtOverrideService): void {
  app.get('/art/overrides', { config: { skipValidation: true } }, async () => art.published());

  const staff = [requireAuth, requireRoles('admin', 'superadmin')];

  app.get('/admin/art', { config: { skipValidation: true }, preHandler: staff }, async () => ({ overrides: await art.list() }));

  app.get('/admin/art/:slot/history', { schema: { params: slotParam }, preHandler: staff }, async (req) => ({
    history: await art.history((req.params as z.infer<typeof slotParam>).slot),
  }));

  /** Put an uploaded picture (`POST /admin/shop/art/:kind` first) in a slot. */
  app.put('/admin/art/:slot', { schema: { params: slotParam, body: setBody }, preHandler: staff }, async (req, reply) => {
    const { slot } = req.params as z.infer<typeof slotParam>;
    const body = req.body as z.infer<typeof setBody>;
    const res = await art.set(req.user!.id, slot, body.assetKey, body.note || null);
    if (!res.ok) return reply.code(res.status).send({ code: res.code, message: res.message, requestId: req.id });
    return { override: res.override };
  });

  /** Back to the art that ships. */
  app.delete('/admin/art/:slot', { schema: { params: slotParam, body: resetBody }, preHandler: staff }, async (req, reply) => {
    const { slot } = req.params as z.infer<typeof slotParam>;
    const res = await art.set(req.user!.id, slot, null, (req.body as z.infer<typeof resetBody>)?.note || null);
    if (!res.ok) return reply.code(res.status).send({ code: res.code, message: res.message, requestId: req.id });
    return { override: null };
  });
}
