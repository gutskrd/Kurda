import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { ImagePostService, type AuthorRole } from './service.js';

function authorRole(req: FastifyRequest): AuthorRole {
  const roles = req.user?.roles ?? [];
  if (roles.includes('founder')) return 'founder';
  if (roles.some((r) => ['admin', 'superadmin', 'content_editor'].includes(r))) return 'admin';
  return 'user';
}
const isAdmin = (req: FastifyRequest): boolean => authorRole(req) !== 'user';

const createBody = z.object({
  imageMediaId: z.string().min(1).max(512),
  caption: z.string().max(2_000).optional(),
  category: z.enum(['meme', 'image']).optional(),
  language: z.string().max(16).optional(),
});
const editBody = z.object({ caption: z.string().max(2_000).nullable() });
const idParam = z.object({ id: z.uuid() });

/**
 * Community image & meme sharing (KUR-290). Reads public (guests view); upload/
 * edit/remove require auth + an ownership/admin check. Author role (user/admin/
 * founder) from RBAC (#099/#286).
 */
export function registerImagePostRoutes(app: FastifyInstance, images = new ImagePostService(app.db)): void {
  app.post(
    '/images',
    { schema: { body: createBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req, reply) => {
      const res = await images.create(req.user!.id, authorRole(req), req.body as z.infer<typeof createBody>);
      if (!res.ok) return reply.code(422).send({ code: 'INVALID_POST', message: 'an image is required' });
      return reply.code(201).send(res.post);
    },
  );

  app.get('/images', { config: { skipValidation: true } }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    return {
      posts: await images.list({
        category: q.category === 'image' ? 'image' : q.category === 'meme' ? 'meme' : undefined,
        language: q.language,
        authorId: q.authorId,
        sort: q.sort === 'popular' ? 'popular' : 'newest',
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      }),
    };
  });

  app.get('/images/:id', { schema: { params: idParam } }, async (req, reply) => {
    const post = await images.get((req.params as { id: string }).id);
    if (!post) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
    return post;
  });

  app.patch(
    '/images/:id',
    { schema: { params: idParam, body: editBody }, preHandler: requireAuth },
    async (req, reply) =>
      respond(reply, await images.editCaption((req.params as { id: string }).id, req.user!.id, isAdmin(req), (req.body as z.infer<typeof editBody>).caption)),
  );

  app.delete(
    '/images/:id',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) =>
      respond(reply, await images.remove((req.params as { id: string }).id, req.user!.id, isAdmin(req))),
  );
}

function respond(reply: FastifyReply, res: { ok: true; post: unknown } | { ok: false; reason: 'not-found' | 'forbidden' }): unknown {
  if (res.ok) return res.post;
  if (res.reason === 'not-found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
  return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your image' });
}
