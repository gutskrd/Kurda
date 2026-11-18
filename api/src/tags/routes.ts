import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccount, requireRoles } from '../plugins/auth.js';
import { TagService } from './service.js';
import { SocialService } from '../social/service.js';
import { FriendService } from '../friends/service.js';

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

/** User tags: public read of a user's effective tags, owners claiming or hiding claimable ones, and admins curating the catalogue. */
export function registerTagRoutes(app: FastifyInstance, tags = new TagService(app.db)): void {
  const social = new SocialService(app.db, new FriendService(app.db));

  /**
   * A user's main tag and displayed claimable tags. Claimed tags are things a person says about themselves, so they
   * follow the profile's privacy (via the profile call's block, visibility and minor rules): a profile whose detail you
   * cannot see shows only its main tag.
   */
  app.get('/users/:id/tags', { schema: { params: z.object({ id: z.uuid() }) } }, async (req) => {
    const id = (req.params as { id: string }).id;
    const profile = await social.profile(req.user?.id ?? null, id);
    const shown = await tags.profileTags(id);
    return profile.private ? { ...shown, claimable: [] } : shown;
  });

  /** My own tags. */
  app.get('/me/tags', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) =>
    tags.profileTags(req.user!.id),
  );

  /** My own claimed tags, hidden ones included, for managing them. */
  app.get('/me/tags/claimed', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => ({
    tags: await tags.claimedTags(req.user!.id),
  }));

  /** The claimable catalog. */
  app.get('/tags', { config: { skipValidation: true }, preHandler: requireAccount }, async () => ({ tags: await tags.catalog() }));

  /** Self-claim a claimable tag (sensitive ones need `consent: true`). */
  app.post('/me/tags/claim', { schema: { body: claimBody }, preHandler: requireAccount }, async (req, reply) => {
    const { key, value, consent } = req.body as z.infer<typeof claimBody>;
    const res = await tags.claim(req.user!.id, key, value, consent);
    if (res.ok) return { claimed: true };
    const code = res.reason === 'consent-required' ? 422 : res.reason === 'not-claimable' ? 409 : 404;
    return reply.code(code).send({ code: res.reason.toUpperCase().replace(/-/g, '_'), message: 'could not claim tag' });
  });

  /** Show/hide a claimed tag. */
  app.post('/me/tags/display', { schema: { body: displayBody }, preHandler: requireAccount }, async (req, reply) => {
    const { key, displayed } = req.body as z.infer<typeof displayBody>;
    const ok = await tags.setDisplayed(req.user!.id, key, displayed);
    if (!ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'you have not claimed that tag' });
    return { updated: true };
  });

  /** Revoke a self-claimed tag (removes the data). */
  app.delete('/me/tags/:key', { schema: { params: keyParam }, config: { skipValidation: true }, preHandler: requireAccount }, async (req, reply) => {
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
