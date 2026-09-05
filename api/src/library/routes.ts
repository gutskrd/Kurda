import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { LibraryService } from './service.js';
import type { AiModerationService } from '../moderation/ai-service.js';
import type { TrustService } from '../trust/service.js';

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
export function registerLibraryRoutes(
  app: FastifyInstance,
  library = new LibraryService(app.db),
  aiMod?: AiModerationService,
  trust?: TrustService,
): void {
  /** Resolve the optional audio rendition's media key to a public CDN URL. */
  const withAudioUrl = <T extends { audioMediaId: string | null }>(post: T): T & { audioUrl: string | null } => ({
    ...post,
    audioUrl: post.audioMediaId && app.storage ? app.storage.publicUrl(post.audioMediaId) : null,
  });

  /** An attached voice note must have cleared the upload pipeline (KUR-282) —
   *  a client can't reference an arbitrary/unconfirmed audio key. */
  const audioOk = async (key: string | null | undefined): Promise<boolean> => {
    if (!key) return true; // audio is optional
    const res = await app.db.query(`SELECT 1 FROM media_uploads WHERE key = $1 AND confirmed_at IS NOT NULL`, [key]);
    return (res.rowCount ?? 0) > 0;
  };
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
      if (!(await audioOk(body.audioMediaId))) {
        return reply.code(422).send({ code: 'INVALID_AUDIO', message: 'attach audio uploaded via /media/voice first' });
      }
      if (trust) {
        // per-level velocity cap (KUR-295): new accounts post fewer per hour
        const gate = await trust.checkAction(req.user!.id, 'post');
        if (!gate.allowed) {
          return reply.code(429).send({ code: 'TRUST_VELOCITY', message: 'you are posting too fast — slow down for new accounts' });
        }
        // duplicate/burst spam → auto-mute/suspend before the post lands
        const spam = await trust.assessContent(req.user!.id, `${body.title}\n${body.body}`);
        if (spam.enforced) {
          return reply.code(403).send({ code: 'AUTO_MODERATED', message: 'your account has been restricted for spam-like activity' });
        }
      }
      const res = await library.create(req.user!.id, isAdmin(req) ? 'admin' : 'user', body);
      if (!res.ok) return reply.code(422).send({ code: 'INVALID_POST', message: 'title and body are required' });
      if (trust) await trust.recordAction(req.user!.id, 'post');
      // auto-screen the text (KUR-285/#293): a flag enters the #102 queue. Never
      // blocks literature — reviewers decide; runs after the post exists.
      if (aiMod) {
        await aiMod
          .moderate({ surface: 'library', text: `${res.post.title}\n${res.post.body}`, authorId: req.user!.id, contentType: 'post', contentRef: res.post.id })
          .catch((err) => app.log.warn({ err }, 'library post auto-moderation failed'));
      }
      return reply.code(201).send(withAudioUrl(res.post));
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
    const withAuthor = await library.withAuthors(posts, (k) => (app.storage ? app.storage.publicUrl(k) : null));
    return { posts: withAuthor.map(withAudioUrl) };
  });

  /** Read one post + increment views (public). */
  app.get('/library/posts/:id', { schema: { params: idParam } }, async (req, reply) => {
    const post = await library.get((req.params as { id: string }).id);
    if (!post) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such post' });
    const [withAuthor] = await library.withAuthors([post], (k) =>
      app.storage ? app.storage.publicUrl(k) : null,
    );
    return withAudioUrl(withAuthor!);
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
