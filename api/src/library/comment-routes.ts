import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { LibraryCommentService, type CreateCommentInput } from './comment-service.js';

const ADMIN_ROLES = ['admin', 'superadmin', 'content_editor'];
const isAdmin = (req: FastifyRequest): boolean => !!req.user?.roles.some((r) => ADMIN_ROLES.includes(r));

const createBody = z.object({
  body: z.string().min(1).max(10_000).optional(),
  audioMediaId: z.string().max(512).optional(),
  parentId: z.uuid().optional(),
});
const editBody = z.object({
  body: z.string().min(1).max(10_000).nullable().optional(),
  audioMediaId: z.string().max(512).nullable().optional(),
});
const postIdParam = z.object({ postId: z.uuid() });
const idParam = z.object({ id: z.uuid() });

/**
 * Threaded comments on library posts (KUR-283). Reads are public; creating,
 * editing, and deleting require auth (guests read-only) plus an ownership/admin
 * check. Comment creation is rate-limited (#010).
 */
export function registerLibraryCommentRoutes(app: FastifyInstance, comments = new LibraryCommentService(app.db)): void {
  /** Post a comment (text / audio / both) or a reply. */
  app.post(
    '/library/posts/:postId/comments',
    {
      schema: { params: postIdParam, body: createBody },
      config: { rateLimit: { max: 30, windowMs: 60_000 } },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const { postId } = req.params as { postId: string };
      const res = await comments.create(postId, req.user!.id, isAdmin(req) ? 'admin' : 'user', req.body as CreateCommentInput);
      if (res.ok) return reply.code(201).send(res.comment);
      switch (res.reason) {
        case 'empty':
          return reply.code(422).send({ code: 'EMPTY_COMMENT', message: 'a comment needs text or audio' });
        case 'post-not-found':
          return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such published post' });
        case 'parent-not-found':
          return reply.code(404).send({ code: 'PARENT_NOT_FOUND', message: 'no such parent comment' });
      }
    },
  );

  /** Top-level comments of a post (public, paginated). */
  app.get('/library/posts/:postId/comments', { schema: { params: postIdParam } }, async (req) => {
    const { postId } = req.params as { postId: string };
    const q = req.query as Record<string, string | undefined>;
    return {
      comments: await comments.topLevel(postId, {
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
        sort: q.sort === 'oldest' ? 'oldest' : 'newest',
      }),
    };
  });

  /** Direct replies to a comment (public, load-more per branch). */
  app.get('/library/comments/:id/replies', { schema: { params: idParam } }, async (req) => {
    const { id } = req.params as { id: string };
    const q = req.query as Record<string, string | undefined>;
    return {
      comments: await comments.replies(id, {
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      }),
    };
  });

  /** Edit own comment (admins any). */
  app.patch(
    '/library/comments/:id',
    { schema: { params: idParam, body: editBody }, preHandler: requireAuth },
    async (req, reply) =>
      respond(reply, await comments.edit((req.params as { id: string }).id, req.user!.id, isAdmin(req), req.body as CreateCommentInput)),
  );

  /** Soft-delete (author or admin); subtree preserved as a tombstone. */
  app.delete(
    '/library/comments/:id',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) =>
      respond(reply, await comments.remove((req.params as { id: string }).id, req.user!.id, isAdmin(req))),
  );
}

function respond(reply: FastifyReply, res: { ok: true; comment: unknown } | { ok: false; reason: 'not-found' | 'forbidden' | 'empty' }): unknown {
  if (res.ok) return res.comment;
  if (res.reason === 'not-found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such comment' });
  if (res.reason === 'empty') return reply.code(422).send({ code: 'EMPTY_COMMENT', message: 'a comment needs text or audio' });
  return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your comment' });
}
