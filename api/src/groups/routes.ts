import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GROUP_DESCRIPTION_MAX, GROUP_NAME_MAX, GROUP_NAME_MIN } from '@kurda/shared';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { requireBirthMonth } from '../users/age.js';
import { requireUnrestricted } from '../moderation/restrictions.js';
import { ImageModerationService } from '../moderation/image-moderation-service.js';
import type { AppConfig } from '../config/env.js';
import { mediaLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { clearGroupPhoto, setGroupPhoto } from '../media/groupPhoto.js';
import type { GroupService } from './service.js';
import type { TrustService } from '../trust/service.js';
import type { AiModerationService } from '../moderation/ai-service.js';

const idParam = z.object({ id: z.uuid() });
const memberParam = z.object({ id: z.uuid(), userId: z.uuid() });

/** Groups / clubs (KUR-084). */
export function registerGroupRoutes(
  app: FastifyInstance,
  groups: GroupService,
  trust?: TrustService,
  config?: AppConfig,
  aiMod?: AiModerationService,
): void {
  const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);
  /**
   * The classifier's word on a group's published text, after the wordlist the
   * service applies: what it would block is refused, what it would flag is
   * kept for the moderators' queue.
   */
  const screen = async (authorId: string, contentRef: string | undefined, ...texts: Array<string | null | undefined>): Promise<void> => {
    const text = texts.filter((x): x is string => Boolean(x && x.trim())).join('\n');
    if (!aiMod || !text) return;
    const verdict = await aiMod.moderate({ surface: 'profile', text, authorId, contentType: 'group', ...(contentRef ? { contentRef } : {}) });
    if (verdict.blocked) throw new AppError('GROUP_TEXT_REJECTED', 422, 'the name or description has words that are not allowed here');
  };
  /** Create a group (creator becomes owner). */
  app.post(
    '/groups',
    {
      schema: {
        body: z.object({
          name: z.string().min(2).max(60),
          description: z.string().max(300).optional(),
          privacy: z.enum(['open', 'invite']).optional(),
        }),
      },
      // a group's name and description are published text
      preHandler: [requireBirthMonth, requireUnrestricted('post')],
    },
    async (req, reply) => {
      const input = req.body as { name: string; description?: string; privacy?: 'open' | 'invite' };
      await screen(req.user!.id, undefined, input.name, input.description);
      if (trust) {
        // per-level cap (KUR-295): a new account can't spin up many groups fast
        const gate = await trust.checkAction(req.user!.id, 'group_create');
        if (!gate.allowed) {
          return reply
            .code(429)
            .send({ code: 'TRUST_VELOCITY', message: 'new accounts can create fewer groups — this lifts as your account ages' });
        }
      }
      const created = await groups.create(
        req.user!.id,
        req.body as { name: string; description?: string; privacy?: 'open' | 'invite' },
      );
      if (trust) await trust.recordAction(req.user!.id, 'group_create');
      return created;
    },
  );

  /** Discover open groups + your own. */
  app.get('/groups', { preHandler: requireAuth }, async (req) => ({ groups: await groups.discover(req.user!.id, 30, publicUrl) }));
  app.get('/me/groups', { preHandler: requireAuth }, async (req) => ({ groups: await groups.myGroups(req.user!.id, publicUrl) }));

  /** Group detail with roster. */
  app.get('/groups/:id', { schema: { params: idParam }, preHandler: requireAuth }, async (req) =>
    groups.get((req.params as { id: string }).id, req.user!.id, publicUrl),
  );

  /**
   * Change the group's name or description, as its owner or an admin. Both are
   * published text, so the same gates as making a group, and a ceiling on how
   * often, so a name cannot be flipped back and forth to spam the members.
   */
  app.patch(
    '/groups/:id',
    {
      schema: {
        params: idParam,
        body: z
          .object({
            name: z.string().min(GROUP_NAME_MIN).max(GROUP_NAME_MAX).optional(),
            description: z.string().max(GROUP_DESCRIPTION_MAX).nullable().optional(),
          })
          .refine((b) => b.name !== undefined || b.description !== undefined, { message: 'nothing to change' }),
      },
      config: { rateLimit: { max: 20, windowMs: 10 * 60_000, per: 'user-or-ip' as const } },
      preHandler: [requireBirthMonth, requireUnrestricted('post')],
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = req.body as { name?: string; description?: string | null };
      await screen(req.user!.id, id, body.name, body.description);
      return groups.update(req.user!.id, id, body);
    },
  );

  /**
   * The group's picture: the raw image bytes (Content-Type image/*), put up
   * through every guard a profile photo goes through — size, real type,
   * re-encoded to WebP, the storage ceiling and the image scan — by the owner
   * or an admin. Rate-limited like any upload.
   */
  const limits = config ? mediaLimits(config) : null;
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  app.post(
    '/groups/:id/photo',
    {
      schema: { params: idParam },
      config: {
        rateLimit: { max: limits?.uploadRateMax ?? 10, windowMs: limits?.uploadRateWindowMs ?? 60 * 60_000, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: [requireBirthMonth, requireUnrestricted('media')],
    },
    async (req, reply) => {
      if (!app.storage || !limits) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_IMAGE', message: 'send raw image bytes with an image/* content-type' });
      const res = await setGroupPhoto(
        { pool: app.db, storage: app.storage, usage, moderation: new ImageModerationService(app.db), limits, log: app.log },
        (req.params as { id: string }).id,
        req.user!.id,
        raw,
      );
      if (!res.ok) {
        req.log.warn({ userId: req.user!.id, reason: res.reason, bytes: raw.length }, 'group picture upload refused');
        return reply.code(res.status).send({ code: res.code, message: res.message });
      }
      return { photoUrl: res.photoUrl };
    },
  );
  app.delete(
    '/groups/:id/photo',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const res = await clearGroupPhoto({ pool: app.db, storage: app.storage, usage, log: app.log }, (req.params as { id: string }).id, req.user!.id);
      if (!res.ok) return reply.code(res.status).send({ code: res.code, message: res.message });
      return { photoUrl: null };
    },
  );

  const ok = { ok: true } as const;

  app.post('/groups/:id/join', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireBirthMonth }, async (req) => {
    await groups.join(req.user!.id, (req.params as { id: string }).id);
    return ok;
  });
  app.post('/groups/:id/leave', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req) => {
    await groups.leave(req.user!.id, (req.params as { id: string }).id);
    return ok;
  });
  app.post(
    '/groups/:id/invite',
    { schema: { params: idParam, body: z.object({ userId: z.uuid() }) }, preHandler: requireBirthMonth },
    async (req) => {
      await groups.invite(req.user!.id, (req.params as { id: string }).id, (req.body as { userId: string }).userId);
      return ok;
    },
  );
  app.post(
    '/groups/:id/transfer',
    { schema: { params: idParam, body: z.object({ userId: z.uuid() }) }, preHandler: requireAuth },
    async (req) => {
      await groups.transferOwnership(req.user!.id, (req.params as { id: string }).id, (req.body as { userId: string }).userId);
      return ok;
    },
  );
  app.put(
    '/groups/:id/members/:userId/role',
    { schema: { params: memberParam, body: z.object({ role: z.enum(['moderator', 'member']) }) }, preHandler: requireAuth },
    async (req) => {
      const { id, userId } = req.params as { id: string; userId: string };
      await groups.setRole(req.user!.id, id, userId, (req.body as { role: 'moderator' | 'member' }).role);
      return ok;
    },
  );
  app.delete(
    '/groups/:id/members/:userId',
    { schema: { params: memberParam }, preHandler: requireAuth },
    async (req) => {
      const { id, userId } = req.params as { id: string; userId: string };
      await groups.removeMember(req.user!.id, id, userId);
      return ok;
    },
  );
  app.delete('/groups/:id', { schema: { params: idParam }, preHandler: requireAuth }, async (req) => {
    await groups.deleteGroup(req.user!.id, (req.params as { id: string }).id);
    return ok;
  });
}
