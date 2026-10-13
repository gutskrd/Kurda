import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { AppError } from '../plugins/errors.js';
import type { AppConfig } from '../config/env.js';
import { imagePostLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { storeImageMedia } from '../media/imageMedia.js';
import { ImageModerationService } from '../moderation/image-moderation-service.js';
import type { AiModerationService } from '../moderation/ai-service.js';
import type { TrustService } from '../trust/service.js';
import { PostGate } from '../trust/post-gate.js';
import { POST_PICTURE_KIND, checkPostPictures, type PictureClaimFailure } from '../media/postMedia.js';
import { ImagePostService, type AuthorRole } from './service.js';

const IMAGE_POST_KIND = POST_PICTURE_KIND;

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
 * it — the create step only accepts a media id that already cleared that pipeline,
 * that its author uploaded, and that no other post uses.
 *
 * New posts with pictures are written posts (library/routes.ts) and use the same
 * upload; `POST /images` stays for the apps already installed, and a caption
 * goes through the same gate as any other words (trust/post-gate.ts).
 */
export function registerImagePostRoutes(
  app: FastifyInstance,
  config: AppConfig,
  images = new ImagePostService(app.db),
  aiMod?: AiModerationService,
  trust?: TrustService,
): void {
  const limits = imagePostLimits(config);
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  const gate = new PostGate(trust, aiMod, app.log);

  /**
   * Edit a caption (author or admin). A changed caption is new words in front
   * of readers, so it is gated like a post; taking one off is not.
   */
  const editCaption = async (req: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    const { id } = req.params as { id: string };
    const { caption } = req.body as z.infer<typeof editBody>;
    const current = await images.current(id);
    if (!current) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
    if (current.authorId !== req.user!.id && !isAdmin(req)) return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your image' });
    const words = caption?.trim() ?? '';
    const changed = words !== '' && words !== (current.caption ?? '');
    if (changed) {
      const refused = await gate.check(req.user!.id, words);
      if (refused) return reply.code(refused.status).send({ code: refused.code, message: refused.message });
    }
    const res = await images.editCaption(id, req.user!.id, isAdmin(req), caption);
    if (res.ok && changed) await gate.passed(req.user!.id, captionScreened(res.post));
    return respond(reply, res);
  };

  /** Attach the public CDN URL so clients don't need to know the media key layout. */
  const withUrl = <T extends { imageMediaId: string }>(post: T): T & { imageUrl: string | null } => ({
    ...post,
    imageUrl: publicUrl(post.imageMediaId),
  });

  /**
   * Through-server upload: raw image bytes → cost-safe stored WebP → media id,
   * owned by the uploader and unconfirmed until a post uses it.
   *
   * `?ownWork=false` is "I made this" switched off: the picture goes up without
   * the signature, which would otherwise claim somebody else's picture as the
   * poster's. Left out (as the installed apps do), it is on.
   */
  app.post(
    '/images/upload',
    {
      config: {
        rateLimit: { max: limits.uploadRateMax, windowMs: limits.uploadRateWindowMs, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: requireBirthMonth,
    },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_IMAGE', message: 'send raw image bytes with an image/* content-type' });

      // the handle comes from the database, never from the request: a mark the
      // uploader could name is a mark they could put someone else's name on
      const who = await app.db.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [req.user!.id]);

      const ownWork = !['false', '0'].includes(String((req.query as Record<string, unknown>).ownWork ?? ''));
      const res = await storeImageMedia(
        { pool: app.db, storage: app.storage, usage, moderation: new ImageModerationService(app.db), limits, log: app.log },
        IMAGE_POST_KIND,
        raw,
        { signAs: ownWork ? who.rows[0]?.username : undefined, ownerId: req.user!.id },
      );
      if (!res.ok) {
        req.log.warn({ userId: req.user!.id, reason: res.reason, bytes: raw.length }, 'image upload rejected');
        return reply.code(res.status).send({ code: res.code, message: res.message });
      }
      return reply.code(201).send({
        imageMediaId: res.mediaId,
        url: res.url,
        width: res.width,
        height: res.height,
        signed: res.signed,
      });
    },
  );

  app.post(
    '/images',
    { schema: { body: createBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: requireBirthMonth },
    async (req, reply) => {
      const body = req.body as z.infer<typeof createBody>;
      // refused for its picture before it counts toward anything (the create
      // claims it, and decides)
      const picture = await checkPostPictures(app.db, req.user!.id, [body.imageMediaId.trim()]);
      if (!picture.ok) return refusePicture(reply, picture.code);
      // a picture post was the one way onto the wall with no velocity cap, no
      // spam check and no screening of its words; it goes through the gate now
      const refused = await gate.check(req.user!.id, body.caption?.trim() ?? '');
      if (refused) return reply.code(refused.status).send({ code: refused.code, message: refused.message });
      // the referenced media must have cleared the upload pipeline and be this
      // author's own unused upload — not an arbitrary, unmoderated or oversized
      // key, somebody else's picture, or a picture already posted
      const res = await images.create(req.user!.id, authorRole(req), body);
      if (!res.ok) return refusePicture(reply, res.reason);
      await gate.passed(req.user!.id, captionScreened(res.post));
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
      viewerId: req.user?.id ?? null,
    });
    // a wall of pictures with no names is not a community; the byline comes
    // from the same loader the library uses, so one person has one face
    return { posts: (await images.withAuthors(posts, publicUrl)).map(withUrl) };
  });

  app.get('/images/:id', { schema: { params: idParam } }, async (req, reply) => {
    const post = await images.get((req.params as { id: string }).id, req.user?.id ?? null);
    if (!post) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
    return withUrl((await images.withAuthors([post], publicUrl))[0]!);
  });

  app.patch(
    '/images/:id',
    { schema: { params: idParam, body: editBody }, preHandler: requireBirthMonth },
    async (req, reply) =>
      editCaption(req, reply),
  );

  app.delete(
    '/images/:id',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) =>
      respond(reply, await images.remove((req.params as { id: string }).id, req.user!.id, isAdmin(req))),
  );
}

/**
 * A picture that cannot be posted. An unusable key keeps the answer the
 * installed apps already handle (INVALID_POST); one already on a post says so.
 */
function refusePicture(reply: FastifyReply, reason: 'invalid' | PictureClaimFailure): FastifyReply {
  return reason === 'MEDIA_IN_USE'
    ? reply.code(422).send({ code: 'MEDIA_IN_USE', message: 'this picture is already on a post' })
    : reply.code(422).send({ code: 'INVALID_POST', message: 'image must be uploaded via /images/upload first' });
}

/** What the screening reads of a picture post: its caption (#293). */
function captionScreened(post: { id: string; caption: string | null }) {
  return { surface: 'caption' as const, contentType: 'caption' as const, contentRef: post.id, text: post.caption ?? '' };
}

function respond(reply: FastifyReply, res: { ok: true; post: unknown } | { ok: false; reason: 'not-found' | 'forbidden' }): unknown {
  if (res.ok) return res.post;
  if (res.reason === 'not-found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
  return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your image' });
}
