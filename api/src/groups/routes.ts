import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { GroupService } from './service.js';

const idParam = z.object({ id: z.uuid() });
const memberParam = z.object({ id: z.uuid(), userId: z.uuid() });

/** Groups / clubs (KUR-084). */
export function registerGroupRoutes(app: FastifyInstance, groups: GroupService): void {
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
      preHandler: requireAuth,
    },
    async (req) => groups.create(req.user!.id, req.body as { name: string; description?: string; privacy?: 'open' | 'invite' }),
  );

  /** Discover open groups + your own. */
  app.get('/groups', { preHandler: requireAuth }, async () => ({ groups: await groups.discover() }));
  app.get('/me/groups', { preHandler: requireAuth }, async (req) => ({ groups: await groups.myGroups(req.user!.id) }));

  /** Group detail with roster. */
  app.get('/groups/:id', { schema: { params: idParam }, preHandler: requireAuth }, async (req) =>
    groups.get((req.params as { id: string }).id, req.user!.id),
  );

  const ok = { ok: true } as const;

  app.post('/groups/:id/join', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req) => {
    await groups.join(req.user!.id, (req.params as { id: string }).id);
    return ok;
  });
  app.post('/groups/:id/leave', { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth }, async (req) => {
    await groups.leave(req.user!.id, (req.params as { id: string }).id);
    return ok;
  });
  app.post(
    '/groups/:id/invite',
    { schema: { params: idParam, body: z.object({ userId: z.uuid() }) }, preHandler: requireAuth },
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
