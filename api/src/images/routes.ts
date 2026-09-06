import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { AppError } from '../plugins/errors.js';
import type { AppConfig } from '../config/env.js';
import { imagePostLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { storeImageMedia } from '../media/imageMedia.js';
import { ImageModerationService } from '../moderation/image-moderation-service.js';
import { ImagePostService, type AuthorRole } from './service.js';

const IMAGE_POST_KIND = 'image-post';

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
 * Community image & meme sharing (KUR-290/291). Reads public (guests view);
 * upload/create/edit/remove require auth + an ownership/admin check. Images are
 * uploaded through the server (`POST /images/upload`) so every byte is validated,
 * resized, WebP-compressed and moderated cost-safely before a post can reference
 * it — the create step only accepts a media id that already cleared that pipeline.
 */
export function registerImagePostRoutes(app: FastifyInstance, config: AppConfig, images = new ImagePostService(app.db)): void {
  const limits = imagePostLimits(config);
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);
  const usage = new MediaUsageService(app.db, app.redis ?? null);

  /** Attach the public CDN URL so clients don't need to know the media key layout. */
  const withUrl = <T extends { imageMediaId: string }>(post: T): T & { imageUrl: string | null } => ({
    ...post,
    imageUrl: publicUrl(post.imageMediaId),
  });

  /** Through-server upload: raw image bytes → cost-safe stored WebP → media id. */
  app.post(
    '/images/upload',
    {
      config: {
        rateLimit: { max: limits.uploadRateMax, windowMs: limits.uploadRateWindowMs, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_IMAGE', message: 'send raw image bytes with an image/* content-type' });

      // the handle comes from the database, never from the request: a mark the
      // uploader could name is a mark they could put someone else's name on
      const who = await app.db.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [req.user!.id]);

      const res = await storeImageMedia(
        { pool: app.db, storage: app.storage, usage, moderation: new ImageModerationService(app.db), limits, log: app.log },
        IMAGE_POST_KIND,
        raw,
        { signAs: who.rows[0]?.username },
      );
      if (!res.ok) {
        req.log.warn({ userId: req.user!.id, reason: res.reason, bytes: raw.length }, 'image upload rejected');
        return reply.code(res.status).send({ code: res.code, message: res.message });
      }
      return reply.code(201).send({ imageMediaId: res.mediaId, url: res.url });
    },
  );

  app.post(
    '/images',
    { schema: { body: createBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireAuth },
    async (req, reply) => {
      const body = req.body as z.infer<typeof createBody>;
      // the referenced media must have cleared the upload pipeline — a client
      // cannot attach an arbitrary, unmoderated, or oversized key.
      if (!(await mediaIsServable(app, body.imageMediaId))) {
        return reply.code(422).send({ code: 'INVALID_POST', message: 'image must be uploaded via /images/upload first' });
      }
      const res = await images.create(req.user!.id, authorRole(req), body);
      if (!res.ok) return reply.code(422).send({ code: 'INVALID_POST', message: 'an image is required' });
      // with its byline, so the wall can show the new picture without refetching
      return reply.code(201).send(withUrl((await images.withAuthors([res.post], publicUrl))[0]!));
    },
  );

  app.get('/images', { config: { skipValidation: true } }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const posts = await images.list({
      category: q.category === 'image' ? 'image' : q.category === 'meme' ? 'meme' : undefined,
      language: q.language,
      authorId: q.authorId,
      sort: q.sort === 'popular' ? 'popular' : 'newest',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
    // a wall of pictures with no names is not a community; the byline comes
    // from the same loader the library uses, so one person has one face
    return { posts: (await images.withAuthors(posts, publicUrl)).map(withUrl) };
  });

  app.get('/images/:id', { schema: { params: idParam } }, async (req, reply) => {
    const post = await images.get((req.params as { id: string }).id);
    if (!post) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
    return withUrl((await images.withAuthors([post], publicUrl))[0]!);
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

/** A media key is postable only if it's a confirmed, non-blocked upload (#294). */
async function mediaIsServable(app: FastifyInstance, key: string): Promise<boolean> {
  const res = await app.db.query<{ scan_status: string }>(
    `SELECT scan_status FROM media_uploads WHERE key = $1 AND confirmed_at IS NOT NULL`,
    [key],
  );
  const status = res.rows[0]?.scan_status;
  return status != null && status !== 'blocked';
}

function respond(reply: FastifyReply, res: { ok: true; post: unknown } | { ok: false; reason: 'not-found' | 'forbidden' }): unknown {
  if (res.ok) return res.post;
  if (res.reason === 'not-found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
  return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your image' });
}
