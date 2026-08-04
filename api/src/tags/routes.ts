import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { TagService } from './service.js';

const claimBody = z.object({
  key: z.string().min(1).max(40),
  value: z.string().max(60).optional(),
  consent: z.boolean().optional(),
});
const displayBody = z.object({ key: z.string().min(1).max(40), displayed: z.boolean() });
const createBody = z.object({
  key: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
  kind: z.enum(['main', 'claimable']),
  category: z.string().min(1).max(40),
  acquisition: z.enum(['default', 'role', 'purchase', 'self_claim', 'auto_grant']),
  sensitive: z.boolean().optional(),
});
const keyParam = z.object({ key: z.string().min(1).max(40) });

/**
 * User tags & badges (KUR-286). Public read of a user's effective tags; the
 * owner claims/hides sensitive claimable tags; admins/founder curate the catalog.
 */
export function registerTagRoutes(app: FastifyInstance, tags = new TagService(app.db)): void {
  /** A user's effective main tag + displayed claimable tags (profiles #82). */
  app.get('/users/:id/tags', { schema: { params: z.object({ id: z.uuid() }) } }, async (req) =>
    tags.profileTags((req.params as { id: string }).id),
  );

  /** My own tags. */
  app.get('/me/tags', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) =>
    tags.profileTags(req.user!.id),
  );

  /** The claimable catalog. */
  app.get('/tags', { config: { skipValidation: true }, preHandler: requireAuth }, async () => ({ tags: await tags.catalog() }));

  /** Self-claim a claimable tag (sensitive ones need `consent: true`). */
  app.post('/me/tags/claim', { schema: { body: claimBody }, preHandler: requireAuth }, async (req, reply) => {
    const { key, value, consent } = req.body as z.infer<typeof claimBody>;
    const res = await tags.claim(req.user!.id, key, value, consent);
    if (res.ok) return { claimed: true };
    const code = res.reason === 'consent-required' ? 422 : res.reason === 'not-claimable' ? 409 : 404;
    return reply.code(code).send({ code: res.reason.toUpperCase().replace(/-/g, '_'), message: 'could not claim tag' });
  });

  /** Show/hide a claimed tag. */
  app.post('/me/tags/display', { schema: { body: displayBody }, preHandler: requireAuth }, async (req, reply) => {
    const { key, displayed } = req.body as z.infer<typeof displayBody>;
    const ok = await tags.setDisplayed(req.user!.id, key, displayed);
    if (!ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'you have not claimed that tag' });
    return { updated: true };
  });

  /** Revoke a self-claimed tag (removes the data). */
  app.delete('/me/tags/:key', { schema: { params: keyParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req, reply) => {
    const ok = await tags.unclaim(req.user!.id, (req.params as { key: string }).key);
    if (!ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such claimed tag' });
    return { removed: true };
  });

  /** Admin/founder: create a tag. */
  app.post('/admin/tags', { schema: { body: createBody }, preHandler: requireRoles('admin', 'superadmin', 'founder') }, async (req, reply) => {
    const created = await tags.createTag(req.user!.id, req.body as z.infer<typeof createBody>);
    if (!created) return reply.code(409).send({ code: 'INVALID_TAG', message: 'invalid or duplicate tag key' });
    return reply.code(201).send(created);
  });

  /** Admin/founder: deactivate a tag. */
  app.delete('/admin/tags/:key', { schema: { params: keyParam }, config: { skipValidation: true }, preHandler: requireRoles('admin', 'superadmin', 'founder') }, async (req, reply) => {
    const ok = await tags.deactivate((req.params as { key: string }).key);
    if (!ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such tag' });
    return { deactivated: true };
  });
}
