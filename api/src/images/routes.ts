import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { requireAccount } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { requireUnrestricted } from '../moderation/restrictions.js';
import { requireParental } from '../parental/supervision.js';
import { AppError } from '../plugins/errors.js';
import type { AppConfig } from '../config/env.js';
import { imagePostLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { storeImageMedia } from '../media/imageMedia.js';
import type { AiModerationService } from '../moderation/ai-service.js';
import type { TrustService } from '../trust/service.js';
import { PostGate } from '../trust/post-gate.js';
import { POST_PICTURE_KIND, checkPostPictures, type PictureClaimFailure } from '../media/postMedia.js';
import { ImagePostService, type AuthorRole } from './service.js';
import { pageQuery, queryUuid, queryWord } from '../http/query.js';
import { staffCleared } from '../admin/admin-gate.js';

const IMAGE_POST_KIND = POST_PICTURE_KIND;

function authorRole(req: FastifyRequest): AuthorRole {
  const roles = req.user?.roles ?? [];
  if (roles.includes('founder')) return 'founder';
  if (roles.some((r) => ['admin', 'superadmin', 'content_editor'].includes(r))) return 'admin';
  return 'user';
}

const createBody = z.object({
  imageMediaId: z.string().min(1).max(512),
  caption: z.string().max(2_000).optional(),
  category: z.enum(['meme', 'image']).optional(),
  language: z.string().max(16).optional(),
});
const editBody = z.object({ caption: z.string().max(2_000).nullable() });
const idParam = z.object({ id: lowerUuid() });

/**
 * Community image posts. Reads are public; upload, create, edit and remove need an account and an ownership or staff
 * check. Images go through the server (`POST /images/upload`) to be validated, resized, compressed and screened
 * before a post may use them, and create accepts only a cleared media id its author uploaded and no other post uses.
 * New picture posts are written posts (library/routes.ts); `POST /images` stays for installed apps, with the caption
 * gated like any other words (trust/post-gate.ts).
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
   * Whether this request may edit or take down somebody else's picture: a staff role from a session the console would
   * admit (admin/admin-gate.ts `staffCleared`). A staff password alone counts as a member.
   */
  const actsAsStaff = async (req: FastifyRequest): Promise<boolean> => authorRole(req) !== 'user' && (await staffCleared(app, req));

  /**
   * Edits a caption (author or admin). A changed caption is new words for readers, so it is gated like a post; removing
   * one is not, nor is staff editing (trust/post-gate.ts).
   */
  const editCaption = async (req: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
    const { id } = req.params as { id: string };
    const { caption } = req.body as z.infer<typeof editBody>;
    const current = await images.current(id);
    if (!current) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
    if (current.authorId !== req.user!.id && !(await actsAsStaff(req))) return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your image' });
    const words = caption?.trim() ?? '';
    const changed = words !== '' && words !== (current.caption ?? '');
    const gated = changed && current.authorId === req.user!.id;
    if (gated) {
      const refused = await gate.check(req.user!.id, words);
      if (refused) return reply.code(refused.status).send({ code: refused.code, message: refused.message });
    }
    const res = await images.editCaption(id, req.user!.id, await actsAsStaff(req), caption);
    if (res.ok && gated) await gate.passed(req.user!.id, captionScreened(res.post));
    return respond(reply, res);
  };

  /**
   * Attach the public CDN URL so clients don't need to know the media key layout. A post waiting for a person reaches only
   * its author, who gets its picture as a short-lived private link.
   */
  const withUrl = async <T extends { imageMediaId: string; status: string }>(post: T): Promise<T & { imageUrl: string | null }> => ({
    ...post,
    imageUrl: post.status === 'held' ? ((await app.pictures.ownerLink(post.imageMediaId))?.url ?? null) : publicUrl(post.imageMediaId),
  });

  /**
   * Through-server upload: raw image bytes to a stored WebP and a media id, owned by the uploader and unconfirmed until a
   * post uses it. `?ownWork=false` leaves off the signature, which would otherwise claim someone else's picture as the
   * poster's; omitted, as installed apps do, it is on.
   */
  app.post(
    '/images/upload',
    {
      config: {
        rawBody: true,
        rateLimit: { max: limits.uploadRateMax, windowMs: limits.uploadRateWindowMs, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('post'), requireUnrestricted('media'), requireParental('posts')],
    },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_IMAGE', message: 'send raw image bytes with an image/* content-type' });

      // The handle comes from the database, never the request, so nobody can sign with someone else's name.
      const who = await app.db.query<{ username: string }>(`SELECT username FROM users WHERE id = $1`, [req.user!.id]);

      const ownWork = !['false', '0'].includes(String((req.query as Record<string, unknown>).ownWork ?? ''));
      const res = await storeImageMedia(
        { pool: app.db, storage: app.storage, usage, pictures: app.pictures, limits, log: app.log },
        IMAGE_POST_KIND,
        raw,
        { signAs: ownWork ? who.rows[0]?.username : undefined, ownerId: req.user!.id },
      );
      if (!res.ok) {
        req.log.warn({ userId: req.user!.id, reason: res.reason, bytes: raw.length }, 'image upload rejected');
        // a refusal by the picture check says why, and how to ask a person (PictureRejection)
        if (res.retryAfterSec) reply.header('retry-after', String(res.retryAfterSec));
        return reply.code(res.status).send({ code: res.code, message: res.message, ...(res.refusal ?? {}) });
      }
      // held: `url` is a short-lived link only the uploader gets; a post made with it waits for the same person
      return reply.code(201).send({
        imageMediaId: res.mediaId,
        url: res.url,
        width: res.width,
        height: res.height,
        signed: res.signed,
        review: res.review,
      });
    },
  );

  app.post(
    '/images',
    { schema: { body: createBody }, config: { rateLimit: { max: 30, windowMs: 60_000 } }, preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('post'), requireUnrestricted('media'), requireParental('posts')] },
    async (req, reply) => {
      const body = req.body as z.infer<typeof createBody>;
      // A refused picture is turned away before anything counts; the create claims it and decides.
      const picture = await checkPostPictures(app.db, req.user!.id, [body.imageMediaId.trim()]);
      if (!picture.ok) return refusePicture(reply, picture.code);
      // Picture posts pass the same gate as written ones.
      const refused = await gate.check(req.user!.id, body.caption?.trim() ?? '');
      if (refused) return reply.code(refused.status).send({ code: refused.code, message: refused.message });
      // The media must be this author's own unused upload that cleared the pipeline, never an arbitrary, unscreened or
      // oversized key, someone else's picture, or one already posted.
      const res = await images.create(req.user!.id, authorRole(req), body);
      if (!res.ok) return refusePicture(reply, res.reason);
      await gate.passed(req.user!.id, captionScreened(res.post));
      // with its byline, so the wall can show the new picture without refetching
      return reply.code(201).send(await withUrl((await images.withAuthors([res.post], publicUrl))[0]!));
    },
  );

  const imageListQuery = z.object({
    category: queryWord,
    language: queryWord,
    authorId: queryUuid,
    sort: queryWord,
    ...pageQuery,
  });
  app.get('/images', { schema: { querystring: imageListQuery } }, async (req) => {
    const q = req.query as z.infer<typeof imageListQuery>;
    const posts = await images.list({
      category: q.category === 'image' ? 'image' : q.category === 'meme' ? 'meme' : undefined,
      language: q.language,
      authorId: q.authorId,
      sort: q.sort === 'popular' ? 'popular' : 'newest',
      limit: q.limit,
      offset: q.offset,
      viewerId: req.user?.id ?? null,
    });
    // Bylines come from the library's loader, so one person has one face everywhere.
    return { posts: await Promise.all((await images.withAuthors(posts, publicUrl)).map(withUrl)) };
  });

  app.get('/images/:id', { schema: { params: idParam } }, async (req, reply) => {
    const post = await images.get((req.params as { id: string }).id, req.user?.id ?? null);
    if (!post) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
    return await withUrl((await images.withAuthors([post], publicUrl))[0]!);
  });

  app.patch(
    '/images/:id',
    { schema: { params: idParam, body: editBody }, preHandler: [requireAccount, requireBirthMonth, requireUnrestricted('post'), requireParental('posts')] },
    async (req, reply) =>
      editCaption(req, reply),
  );

  app.delete(
    '/images/:id',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAccount },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const current = await images.current(id);
      // Staff taking down someone else's picture make a moderation decision: blocked by its bytes, off the public
      // bucket, and a removal notice with an appeal for its author (moderation/pictures-service.ts).
      if (current && current.authorId !== req.user!.id && (await actsAsStaff(req))) {
        await app.pictures.staffRemovePost(id, req.user!.id);
        const after = await app.db.query<{ status: string }>(`SELECT status FROM image_posts WHERE id = $1`, [id]);
        return { ...current, status: after.rows[0]?.status ?? 'removed' };
      }
      return respond(reply, await images.remove(id, req.user!.id, await actsAsStaff(req)));
    },
  );
}

/** A picture that cannot be posted: an unusable key keeps the INVALID_POST answer installed apps handle; one already posted says so. */
function refusePicture(reply: FastifyReply, reason: 'invalid' | PictureClaimFailure): FastifyReply {
  return reason === 'MEDIA_IN_USE'
    ? reply.code(422).send({ code: 'MEDIA_IN_USE', message: 'this picture is already on a post' })
    : reply.code(422).send({ code: 'INVALID_POST', message: 'image must be uploaded via /images/upload first' });
}

/** What screening reads of a picture post: its caption. */
function captionScreened(post: { id: string; caption: string | null }) {
  return { surface: 'caption' as const, contentType: 'caption' as const, contentRef: post.id, text: post.caption ?? '' };
}

function respond(reply: FastifyReply, res: { ok: true; post: unknown } | { ok: false; reason: 'not-found' | 'forbidden' }): unknown {
  if (res.ok) return res.post;
  if (res.reason === 'not-found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such image' });
  return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your image' });
}
