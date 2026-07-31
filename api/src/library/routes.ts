import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { LibraryService } from './service.js';

const ADMIN_ROLES = ['admin', 'superadmin', 'content_editor'];
const isAdmin = (req: FastifyRequest): boolean => !!req.user?.roles.some((r) => ADMIN_ROLES.includes(r));

const createBody = z.object({
  type: z.enum(['story', 'poem']),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(50_000),
  audioMediaId: z.string().max(512).optional(),
  language: z.string().max(16).optional(),
  publish: z.boolean().optional(),
});

const updateBody = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(50_000).optional(),
  audioMediaId: z.string().max(512).nullable().optional(),
  language: z.string().max(16).optional(),
});

const idParam = z.object({ id: z.uuid() });

/**
 * Community library authoring + browsing (KUR-281). Reads are public (guests can
 * read/listen); authoring/editing require auth and an ownership/admin check.
 */
export function registerLibraryRoutes(app: FastifyInstance, library = new LibraryService(app.db)): void {
  /** Create a story/poem (text required, audio optional). */
  app.post(
    '/library/posts',
    {
      schema: { body: createBody },
      config: { rateLimit: { max: 20, windowMs: 60_000 } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof createBody>;
      const res = await library.create(req.user!.id, isAdmin(req) ? 'admin' : 'user', body);
      if (!res.ok) return reply.code(422).send({ code: 'INVALID_POST', message: 'title and body are required' });
      return reply.code(201).send(res.post);
    },
  );

  /** Browse published posts (public). */
  app.get('/library/posts', { config: { skipValidation: true } }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const posts = await library.list({
      type: q.type === 'story' || q.type === 'poem' ? q.type : undefined,
      language: q.language,
      authorId: q.authorId,
      sort: q.sort === 'popular' ? 'popular' : 'newest',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
    return { posts };
  });

  /** Read one post + increment views (public). */
  app.get('/library/posts/:id', { schema: { params: idParam } }, async (req, reply) => {
    const post = await library.get((req.params as { id: string }).id);
    if (!post) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such post' });
    return post;
  });

  /** Edit (author or admin). */
  app.patch(
    '/library/posts/:id',
    { schema: { params: idParam, body: updateBody }, preHandler: requireAuth },
    async (req, reply) => {
      const res = await library.update((req.params as { id: string }).id, req.user!.id, isAdmin(req), req.body as z.infer<typeof updateBody>);
      return respond(reply, res);
    },
  );

  /** Unpublish → draft (author or admin). */
  app.post(
    '/library/posts/:id/unpublish',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) => respond(reply, await library.setStatus((req.params as { id: string }).id, req.user!.id, isAdmin(req), 'draft')),
  );

  /** Publish a draft (author or admin). */
  app.post(
    '/library/posts/:id/publish',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) => respond(reply, await library.setStatus((req.params as { id: string }).id, req.user!.id, isAdmin(req), 'published')),
  );

  /** Soft-remove (author or admin); retained for moderation (#285). */
  app.delete(
    '/library/posts/:id',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) => respond(reply, await library.setStatus((req.params as { id: string }).id, req.user!.id, isAdmin(req), 'removed')),
  );
}

function respond(reply: import('fastify').FastifyReply, res: { ok: true; post: unknown } | { ok: false; reason: 'not-found' | 'forbidden' }): unknown {
  if (res.ok) return res.post;
  if (res.reason === 'not-found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such post' });
  return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your post' });
}
