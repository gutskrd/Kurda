import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  GROUP_BAN_DURATIONS,
  GROUP_BAN_REASON_MAX,
  GROUP_DESCRIPTION_MAX,
  GROUP_NAME_MAX,
  GROUP_NAME_MIN,
  GROUP_REQUEST_NOTE_MAX,
  type GroupBanDuration,
} from '@kurda/shared';
import { requireAccount } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import { requireBirthMonth } from '../users/age.js';
import { requireUnrestricted } from '../moderation/restrictions.js';
import type { AppConfig } from '../config/env.js';
import { mediaLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { clearGroupPhoto, setGroupPhoto } from '../media/groupPhoto.js';
import type { GroupService } from './service.js';
import { groupRoom } from './chat-service.js';
import type { TrustService } from '../trust/service.js';
import type { AiModerationService } from '../moderation/ai-service.js';

const idParam = z.object({ id: z.uuid() });
const memberParam = z.object({ id: z.uuid(), userId: z.uuid() });

/**
 * Group routes. Every group is private: these list a person's own groups only, show a group to its members (and to
 * someone banned, its name and their standing), and let people in one way, an owner or admin adding a friend.
 */
export function registerGroupRoutes(
  app: FastifyInstance,
  groups: GroupService,
  trust?: TrustService,
  config?: AppConfig,
  aiMod?: AiModerationService,
): void {
  const publicUrl = (k: string): string | null => (app.storage ? app.storage.publicUrl(k) : null);
  /**
   * The classifier's verdict on a group's published text (name, description, ban reason, request note), after the
   * service's word list: what it would block is refused, what it would flag is kept for the moderators.
   */
  const screen = async (authorId: string, contentRef: string | undefined, ...texts: Array<string | null | undefined>): Promise<void> => {
    const text = texts.filter((x): x is string => Boolean(x && x.trim())).join('\n');
    if (!aiMod || !text) return;
    const verdict = await aiMod.moderate({ surface: 'profile', text, authorId, contentType: 'group', ...(contentRef ? { contentRef } : {}) });
    if (verdict.blocked) throw new AppError('GROUP_TEXT_REJECTED', 422, 'the text has words that are not allowed here');
  };
  /** Creates a group with the creator as owner. `privacy` from older apps is dropped by the schema. */
  app.post(
    '/groups',
    {
      schema: {
        body: z.object({
          name: z.string().min(2).max(60),
          description: z.string().max(300).optional(),
        }),
      },
      // a group's name and description are published text
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('post')],
    },
    async (req, reply) => {
      const input = req.body as { name: string; description?: string };
      await screen(req.user!.id, undefined, input.name, input.description);
      if (trust) {
        // Per-trust-level cap, so a new account cannot create many groups quickly.
        const gate = await trust.checkAction(req.user!.id, 'group_create');
        if (!gate.allowed) {
          return reply
            .code(429)
            .send({ code: 'TRUST_VELOCITY', message: 'new accounts can create fewer groups — this lifts as your account ages' });
        }
      }
      const created = await groups.create(req.user!.id, { name: input.name, description: input.description });
      if (trust) await trust.recordAction(req.user!.id, 'group_create');
      return created;
    },
  );

  // There are no groups to discover; kept for older apps that still request the list.
  app.get('/groups', { preHandler: requireAccount }, async () => ({ groups: [] }));
  /** The caller's own groups: the only list of groups there is. */
  app.get('/me/groups', { preHandler: requireAccount }, async (req) => ({ groups: await groups.myGroups(req.user!.id, publicUrl) }));

  /**
   * A group with its roster, for a member. Someone banned gets its name, picture and their standing; anyone else gets
   * 404 GROUP_NOT_FOUND, as for an unknown id.
   */
  app.get('/groups/:id', { schema: { params: idParam }, preHandler: requireAccount }, async (req) => {
    const id = (req.params as { id: string }).id;
    // The new picture a person is still checking: for the group's owner and admins and whoever put it up, never for others.
    return groups.get(id, req.user!.id, publicUrl, app.hasDecorator('pictures') ? (key) => app.pictures.ownerLink(key) : undefined);
  });

  /**
   * Changes the group's name or description, as owner or admin, with the same gates as creating a group and a limit
   * on how often, so a name cannot be flipped to spam members. `privacy` from older apps is accepted and ignored.
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
            privacy: z.unknown().optional(),
          })
          .refine((b) => b.name !== undefined || b.description !== undefined || b.privacy !== undefined, { message: 'nothing to change' }),
      },
      config: { rateLimit: { max: 20, windowMs: 10 * 60_000, per: 'user-or-ip' as const } },
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('post')],
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { name, description } = req.body as { name?: string; description?: string | null };
      if (name === undefined && description === undefined) {
        const group = await groups.get(id, req.user!.id, publicUrl);
        return { name: group.name, description: group.description };
      }
      await screen(req.user!.id, id, name, description);
      return groups.update(req.user!.id, id, { name, description });
    },
  );

  /**
   * The group's picture as raw image bytes, through every guard a profile photo goes through (size, real type, WebP
   * re-encode, storage ceiling, image scan), by owner or admin. Rate limited like any upload.
   */
  const limits = config ? mediaLimits(config) : null;
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  app.post(
    '/groups/:id/photo',
    {
      schema: { params: idParam },
      config: {
        rawBody: true,
        rateLimit: { max: limits?.uploadRateMax ?? 10, windowMs: limits?.uploadRateWindowMs ?? 60 * 60_000, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('media')],
    },
    async (req, reply) => {
      if (!app.storage || !limits) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_IMAGE', message: 'send raw image bytes with an image/* content-type' });
      const res = await setGroupPhoto(
        { pool: app.db, storage: app.storage, usage, pictures: app.pictures, limits, log: app.log },
        (req.params as { id: string }).id,
        req.user!.id,
        raw,
      );
      if (!res.ok) {
        req.log.warn({ userId: req.user!.id, reason: res.reason, bytes: raw.length }, 'group picture upload refused');
        // a refusal by the picture check says why, and how to ask a person (PictureRejection)
        if (res.retryAfterSec) reply.header('retry-after', String(res.retryAfterSec));
        return reply.code(res.status).send({ code: res.code, message: res.message, ...(res.refusal ?? {}) });
      }
      // held: members keep seeing the old picture until a person checks the new one
      return { photoUrl: res.photoUrl, review: res.review, ...(res.review === 'held' ? { photoPending: res.photoPending ?? null } : {}) };
    },
  );
  app.delete(
    '/groups/:id/photo',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAccount },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const res = await clearGroupPhoto({ pool: app.db, storage: app.storage, usage, log: app.log }, (req.params as { id: string }).id, req.user!.id);
      if (!res.ok) return reply.code(res.status).send({ code: res.code, message: res.message });
      return { photoUrl: null };
    },
  );

  const ok = { ok: true } as const;

  /**
   * Takes people out of the group's live room as well as its member list, so an open socket stops receiving
   * messages. Looked up when called, since the gateway is set up after these routes.
   */
  const leaveRoom = async (groupId: string, userIds: readonly string[]): Promise<void> => {
    if (!app.hasDecorator('realtime')) return;
    await app.realtime.revokeAll(groupRoom(groupId), userIds).catch(() => undefined);
  };

  // Nobody joins a group by themselves; kept so older apps showing a Join button are told why.
  app.post('/groups/:id/join', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAccount }, async () => {
    throw new AppError('INVITE_ONLY', 403, 'this group is invite-only');
  });
  app.post('/groups/:id/leave', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAccount }, async (req) => {
    const { id } = req.params as { id: string };
    await groups.leave(req.user!.id, id);
    await leaveRoom(id, [req.user!.id]);
    return ok;
  });
  /** Add one of the caller's own friends, as the group's owner or an admin: the only way in. */
  app.post(
    '/groups/:id/invite',
    { schema: { params: idParam, body: z.object({ userId: z.uuid() }) }, preHandler: [requireAccount, requireBirthMonth] },
    async (req) => {
      await groups.invite(req.user!.id, (req.params as { id: string }).id, (req.body as { userId: string }).userId);
      return ok;
    },
  );
  app.post(
    '/groups/:id/transfer',
    { schema: { params: idParam, body: z.object({ userId: z.uuid() }) }, preHandler: requireAccount },
    async (req) => {
      await groups.transferOwnership(req.user!.id, (req.params as { id: string }).id, (req.body as { userId: string }).userId);
      return ok;
    },
  );
  app.put(
    '/groups/:id/members/:userId/role',
    { schema: { params: memberParam, body: z.object({ role: z.enum(['moderator', 'member']) }) }, preHandler: requireAccount },
    async (req) => {
      const { id, userId } = req.params as { id: string; userId: string };
      await groups.setRole(req.user!.id, id, userId, (req.body as { role: 'moderator' | 'member' }).role);
      return ok;
    },
  );
  app.delete(
    '/groups/:id/members/:userId',
    { schema: { params: memberParam }, preHandler: requireAccount },
    async (req) => {
      const { id, userId } = req.params as { id: string; userId: string };
      await groups.removeMember(req.user!.id, id, userId);
      await leaveRoom(id, [userId]);
      return ok;
    },
  );

  /**
   * Bans someone, as owner or admin: out of the group and its live room, not back by themselves for a day, a week or
   * for good, and with `deleteMessages` all their messages removed from every open view (`group_msgs_deleted`). Each
   * ban notifies them, so how often one admin may ban is limited too.
   */
  app.post(
    '/groups/:id/bans',
    {
      schema: {
        params: idParam,
        body: z.object({
          userId: z.uuid(),
          duration: z.enum(GROUP_BAN_DURATIONS),
          reason: z.string().max(GROUP_BAN_REASON_MAX).nullable().optional(),
          deleteMessages: z.boolean().optional(),
        }),
      },
      config: { rateLimit: { max: 60, windowMs: 60 * 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAccount,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const body = req.body as { userId: string; duration: GroupBanDuration; reason?: string | null; deleteMessages?: boolean };
      await screen(req.user!.id, id, body.reason);
      const ban = await groups.ban(req.user!.id, id, body, publicUrl);
      await leaveRoom(id, [body.userId]);
      if (body.deleteMessages && app.hasDecorator('realtime')) {
        await app.realtime.publish(groupRoom(id), { type: 'group_msgs_deleted', groupId: id, senderId: body.userId }).catch(() => undefined);
      }
      return { ban };
    },
  );
  /** Lift a ban (the owner or an admin). It does not add them back. */
  app.delete('/groups/:id/bans/:userId', { schema: { params: memberParam }, preHandler: requireAccount }, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    await groups.unban(req.user!.id, id, userId);
    return ok;
  });
  /** The bans in force, newest first (the owner and admins). */
  app.get('/groups/:id/bans', { schema: { params: idParam }, preHandler: requireAccount }, async (req) => ({
    bans: await groups.bans(req.user!.id, (req.params as { id: string }).id, publicUrl),
  }));

  /**
   * Asks to come back, as someone banned. At most five a day per person across all groups, with one waiting per group
   * and a longer wait after each refusal, so asking cannot pester admins.
   */
  app.post(
    '/groups/:id/requests',
    {
      schema: { params: idParam, body: z.object({ note: z.string().max(GROUP_REQUEST_NOTE_MAX).nullable().optional() }) },
      config: { rateLimit: { max: 5, windowMs: 24 * 60 * 60_000, per: 'user-or-ip' as const } },
      // the note reaches the group's admins
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('post')],
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const { note } = req.body as { note?: string | null };
      await screen(req.user!.id, id, note);
      return { request: await groups.requestToRejoin(req.user!.id, id, note) };
    },
  );
  /** Take back one's own waiting request. */
  app.delete('/groups/:id/requests', { schema: { params: idParam }, preHandler: requireAccount }, async (req) => {
    await groups.withdrawRequest(req.user!.id, (req.params as { id: string }).id);
    return ok;
  });
  /** The requests waiting, oldest first (the owner and admins). */
  app.get('/groups/:id/requests', { schema: { params: idParam }, preHandler: requireAccount }, async (req) => ({
    requests: await groups.requests(req.user!.id, (req.params as { id: string }).id, publicUrl),
  }));
  /** Let them back: the ban lifted, and a member again when every rule allows it. */
  app.post('/groups/:id/requests/:userId/approve', { schema: { params: memberParam }, config: { skipValidation: true }, preHandler: requireAccount }, async (req) => {
    const { id, userId } = req.params as { id: string; userId: string };
    return groups.approve(req.user!.id, id, userId);
  });
  /** Turn it down: a longer wait before the next, or with `stopRequests` no more from them. */
  app.post(
    '/groups/:id/requests/:userId/decline',
    { schema: { params: memberParam, body: z.object({ stopRequests: z.boolean().optional() }).optional() }, preHandler: requireAccount },
    async (req) => {
      const { id, userId } = req.params as { id: string; userId: string };
      await groups.decline(req.user!.id, id, userId, (req.body as { stopRequests?: boolean } | undefined)?.stopRequests ?? false);
      return ok;
    },
  );
  app.delete('/groups/:id', { schema: { params: idParam }, preHandler: requireAccount }, async (req) => {
    const { id } = req.params as { id: string };
    // Read the members before the rows go with the group.
    const members = await app.db.query<{ user_id: string }>(`SELECT user_id FROM group_members WHERE group_id = $1`, [id]);
    await groups.deleteGroup(req.user!.id, id);
    await leaveRoom(id, members.rows.map((m) => m.user_id));
    return ok;
  });
}
