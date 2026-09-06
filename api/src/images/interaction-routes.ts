import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import type { AiModerationService } from '../moderation/ai-service.js';
import type { TrustService } from '../trust/service.js';
import { ImageReactionService, REACTIONS } from './reaction-service.js';
import { ImageCommentService, type AuthorRole, type CreateCommentInput } from './comment-service.js';

const ADMIN_ROLES = ['admin', 'superadmin', 'content_editor'];
function authorRole(req: FastifyRequest): AuthorRole {
  const roles = req.user?.roles ?? [];
  if (roles.includes('founder')) return 'founder';
  if (roles.some((r) => ADMIN_ROLES.includes(r))) return 'admin';
  return 'user';
}
const isAdmin = (req: FastifyRequest): boolean => authorRole(req) !== 'user';

const reactionBody = z.object({ reaction: z.enum(REACTIONS) });
const commentBody = z.object({ body: z.string().min(1).max(2_000), parentId: z.uuid().optional() });
const editBody = z.object({ body: z.string().min(1).max(2_000) });
const idParam = z.object({ id: z.uuid() });

/**
 * Reactions & threaded comments on image/meme posts (KUR-291). Reads are public
 * (a signed-in caller also sees their own reaction); reacting/commenting require
 * auth + trust/velocity gating (#295) and auto-screen comment text (#293). Comment
 * edit/delete enforce an ownership/admin check.
 */
export function registerImageInteractionRoutes(
  app: FastifyInstance,
  reactions = new ImageReactionService(app.db),
  comments = new ImageCommentService(app.db),
  aiMod?: AiModerationService,
  trust?: TrustService,
): void {
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);

  // ---- reactions ----------------------------------------------------------

  /** Set (or change) the caller's reaction on a post. */
  app.put(
    '/images/:id/reaction',
    { schema: { params: idParam, body: reactionBody }, config: { rateLimit: { max: 60, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req, reply) => {
      const res = await reactions.set((req.params as { id: string }).id, req.user!.id, (req.body as z.infer<typeof reactionBody>).reaction);
      if (!res.ok) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
      return res.summary;
    },
  );

  /** Remove the caller's reaction. */
  app.delete(
    '/images/:id/reaction',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req) => reactions.clear((req.params as { id: string }).id, req.user!.id),
  );

  /** Public reaction breakdown (+ the caller's own reaction when signed in). */
  app.get('/images/:id/reactions', { schema: { params: idParam } }, async (req) =>
    reactions.summary((req.params as { id: string }).id, req.user?.id ?? null),
  );

  // ---- comments -----------------------------------------------------------

  /** Post a comment or reply (rate-limited + trust-gated + auto-screened). */
  app.post(
    '/images/:id/comments',
    { schema: { params: idParam, body: commentBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req, reply) => {
      const postId = (req.params as { id: string }).id;
      const input = req.body as CreateCommentInput;
      if (trust) {
        const gate = await trust.checkAction(req.user!.id, 'comment');
        if (!gate.allowed) {
          return reply.code(429).send({ code: 'TRUST_VELOCITY', message: 'you are commenting too fast — slow down for new accounts' });
        }
        if (input.body) {
          const spam = await trust.assessContent(req.user!.id, input.body);
          if (spam.enforced) {
            return reply.code(403).send({ code: 'AUTO_MODERATED', message: 'your account has been restricted for spam-like activity' });
          }
        }
      }
      const res = await comments.create(postId, req.user!.id, authorRole(req), input);
      if (res.ok) {
        if (trust) await trust.recordAction(req.user!.id, 'comment');
        if (aiMod && res.comment.body) {
          await aiMod
            .moderate({ surface: 'caption', text: res.comment.body, authorId: req.user!.id, contentType: 'comment', contentRef: res.comment.id })
            .catch((err) => app.log.warn({ err }, 'image comment auto-moderation failed'));
        }
        return reply.code(201).send((await comments.withAuthors([res.comment], publicUrl))[0]!);
      }
      switch (res.reason) {
        case 'empty':
          return reply.code(422).send({ code: 'EMPTY_COMMENT', message: 'a comment needs text' });
        case 'post-not-found':
          return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such published post' });
        case 'parent-not-found':
          return reply.code(404).send({ code: 'PARENT_NOT_FOUND', message: 'no such parent comment' });
      }
    },
  );

  /** Top-level comments of a post (public, paginated). */
  app.get('/images/:id/comments', { schema: { params: idParam } }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const rows = await comments.topLevel((req.params as { id: string }).id, {
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
      sort: q.sort === 'oldest' ? 'oldest' : 'newest',
    });
    return { comments: await comments.withAuthors(rows, publicUrl) };
  });

  /** Direct replies to a comment (public, load-more per branch). */
  app.get('/images/comments/:id/replies', { schema: { params: idParam } }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const rows = await comments.replies((req.params as { id: string }).id, {
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
    return { comments: await comments.withAuthors(rows, publicUrl) };
  });

  /** Edit own comment (admins any). */
  app.patch(
    '/images/comments/:id',
    { schema: { params: idParam, body: editBody }, preHandler: requireAuth },
    async (req, reply) =>
      respond(reply, await comments.edit((req.params as { id: string }).id, req.user!.id, isAdmin(req), req.body as CreateCommentInput)),
  );

  /** Soft-delete (author or admin); subtree preserved as a tombstone. */
  app.delete(
    '/images/comments/:id',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) =>
      respond(reply, await comments.remove((req.params as { id: string }).id, req.user!.id, isAdmin(req))),
  );
}

function respond(reply: FastifyReply, res: { ok: true; comment: unknown } | { ok: false; reason: 'not-found' | 'forbidden' | 'empty' }): unknown {
  if (res.ok) return res.comment;
  if (res.reason === 'not-found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such comment' });
  if (res.reason === 'empty') return reply.code(422).send({ code: 'EMPTY_COMMENT', message: 'a comment needs text' });
  return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your comment' });
}
