import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../plugins/auth.js';
import { requireBirthMonth } from '../users/age.js';
import { isWrittenPostType } from '@kurda/shared';
import { checkPostPictures } from '../media/postMedia.js';
import { assertUnrestricted, requireUnrestricted, voiceAttachable } from '../moderation/restrictions.js';
import {
  LibraryService,
  MAX_OPEN_DRAFTS,
  addedPictures,
  changedWords,
  createProblem,
  editProblem,
  postWords,
  type LibraryPost,
  type MutateResult,
  type PostRejection,
} from './service.js';
import type { AiModerationService } from '../moderation/ai-service.js';
import type { TrustService } from '../trust/service.js';
import { PostGate } from '../trust/post-gate.js';

const ADMIN_ROLES = ['admin', 'superadmin', 'content_editor'];
const isAdmin = (req: FastifyRequest): boolean => !!req.user?.roles.some((r) => ADMIN_ROLES.includes(r));

/*
 * What a post may be — words or pictures, a title for a çîrok or a helbest, the
 * lengths — is checked in the service, by the same rules the composer runs
 * (`@kurda/shared` post-composer), so one rule decides it and the answer is a
 * 422 with a code the apps can show. The caps here only bound the request: the
 * limits that count are measured trimmed, the way the composer's counter
 * measures them, so a long text with a blank line at the end is not refused
 * here for a length the counter never showed.
 */
const mediaList = z
  .array(z.object({ mediaKey: z.string().min(1).max(512), altText: z.string().max(10_000).nullable().optional() }))
  .max(16);

const createBody = z.object({
  type: z.enum(['gotin', 'story', 'poem']).optional(),
  title: z.string().max(2_000).nullable().optional(),
  body: z.string().max(100_000).optional(),
  media: mediaList.optional(),
  meme: z.boolean().optional(),
  sourceCredit: z.string().max(2_000).nullable().optional(),
  audioMediaId: z.string().max(512).optional(),
  language: z.string().max(16).optional(),
  publish: z.boolean().optional(),
});

const updateBody = z.object({
  type: z.enum(['gotin', 'story', 'poem']).optional(),
  title: z.string().max(2_000).nullable().optional(),
  body: z.string().max(100_000).optional(),
  media: mediaList.optional(),
  meme: z.boolean().optional(),
  sourceCredit: z.string().max(2_000).nullable().optional(),
  audioMediaId: z.string().max(512).nullable().optional(),
  language: z.string().max(16).optional(),
});

const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).max(10_000).optional(),
});

const idParam = z.object({ id: z.uuid() });

/**
 * Community library authoring + browsing (KUR-281). Reads are public (guests can
 * read/listen); authoring/editing require auth and an ownership/admin check.
 *
 * A post is words, up to four pictures (uploaded first through
 * `POST /images/upload`), or both. Every way words reach readers — a new post,
 * an edit, a draft published — goes through the same gate (trust/post-gate.ts).
 */
export function registerLibraryRoutes(
  app: FastifyInstance,
  library = new LibraryService(app.db),
  aiMod?: AiModerationService,
  trust?: TrustService,
): void {
  const gate = new PostGate(trust, aiMod, app.log);
  const publicUrl = (key: string): string | null => (app.storage ? app.storage.publicUrl(key) : null);

  /** Resolve the audio rendition's and the pictures' media keys to public CDN URLs. */
  const withAudioUrl = <T extends LibraryPost>(post: T) => ({
    ...post,
    audioUrl: post.audioMediaId ? publicUrl(post.audioMediaId) : null,
    media: post.media.map((m) => ({ ...m, url: publicUrl(m.mediaKey) })),
  });

  /** An attached voice note must have cleared the upload pipeline (KUR-282) —
   *  a client can't reference an arbitrary/unconfirmed key, a picture, or one
   *  moderation took down — and its author must not be barred from media (403
   *  MUTED). */
  const audioOk = async (req: FastifyRequest, key: string | null | undefined): Promise<boolean> => {
    if (!key) return true; // audio is optional
    return voiceAttachable(app.db, req.user!.id, key);
  };
  const audioRefused = { code: 'INVALID_AUDIO', message: 'attach audio uploaded via /media/voice first' };

  /** Whether this person may edit or publish this post, before any gate counts it. */
  const editable = async (req: FastifyRequest, reply: FastifyReply): Promise<LibraryPost | null> => {
    const post = await library.current((req.params as { id: string }).id);
    if (!post) {
      reply.code(404).send({ code: 'NOT_FOUND', message: 'no such post' });
      return null;
    }
    if (post.authorId !== req.user!.id && !isAdmin(req)) {
      reply.code(403).send({ code: 'FORBIDDEN', message: 'not your post' });
      return null;
    }
    return post;
  };

  /**
   * A write's answer: the post as a reader gets it (audio and picture URLs
   * resolved — these answered the bare row before), or why not.
   */
  const respond = (reply: FastifyReply, res: MutateResult): unknown => {
    if (res.ok) return withAudioUrl(res.post);
    if (res.reason === 'not-found') return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such post' });
    // an edit that would leave something that could not be posted is invalid,
    // not someone else's post (it used to answer 403 "not your post")
    if (res.reason === 'invalid') return refuse(reply, res.problem);
    return reply.code(403).send({ code: 'FORBIDDEN', message: 'not your post' });
  };

  /** Create a post: words, pictures or both (audio optional). */
  app.post(
    '/library/posts',
    {
      schema: { body: createBody },
      config: { rateLimit: { max: 20, windowMs: 60_000 } },
      preHandler: [requireBirthMonth, requireUnrestricted('post')],
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof createBody>;
      // the shape first: a post that is refused for it neither counts toward
      // the velocity cap nor lands in the spam check's memory
      const problem = createProblem(body);
      if (problem) return refuse(reply, problem);
      const keys = (body.media ?? []).map((m) => m.mediaKey);
      // a feature limit ("you can't upload pictures or voice") covers putting
      // up a picture uploaded before it, as it does a voice note (403 MUTED)
      if (keys.length > 0) await assertUnrestricted(app.db, req.user!.id, 'media');
      const pictures = await checkPostPictures(app.db, req.user!.id, keys);
      if (!pictures.ok) return refuse(reply, { code: pictures.code, mediaKey: pictures.mediaKey });
      if (!(await audioOk(req, body.audioMediaId))) return reply.code(422).send(audioRefused);
      // a draft reaches nobody, so it is gated when it is published, not twice;
      // how many a person keeps is bounded instead
      const publish = body.publish !== false;
      if (publish) {
        const refused = await gate.check(req.user!.id, postWords(body));
        if (refused) return reply.code(refused.status).send({ code: refused.code, message: refused.message });
      } else if ((await library.draftCount(req.user!.id)) >= MAX_OPEN_DRAFTS) {
        return reply.code(429).send({
          code: 'DRAFT_LIMIT',
          message: `you have ${MAX_OPEN_DRAFTS} unfinished drafts; publish or delete one first`,
        });
      }
      const res = await library.create(req.user!.id, isAdmin(req) ? 'admin' : 'user', body);
      if (!res.ok) return refuse(reply, res.problem);
      // auto-screen the words (KUR-285/#293): a flag enters the #102 queue. Never
      // blocks literature — reviewers decide; runs after the post exists.
      if (publish) await gate.passed(req.user!.id, screened(res.post));
      return reply.code(201).send(withAudioUrl(res.post));
    },
  );

  /** Browse published posts (public). */
  app.get('/library/posts', { config: { skipValidation: true } }, async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const posts = await library.list({
      type: isWrittenPostType(q.type) ? q.type : undefined,
      language: q.language,
      authorId: q.authorId,
      sort: q.sort === 'popular' ? 'popular' : 'newest',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
      viewerId: req.user?.id ?? null,
    });
    const withAuthor = await library.withAuthors(posts, (k) => (app.storage ? app.storage.publicUrl(k) : null));
    return { posts: withAuthor.map(withAudioUrl) };
  });

  /** Read one post + increment views (public). */
  app.get('/library/posts/:id', { schema: { params: idParam } }, async (req, reply) => {
    const post = await library.get((req.params as { id: string }).id, req.user?.id ?? null);
    if (!post) return reply.code(404).send({ code: 'NOT_FOUND', message: 'no such post' });
    const [withAuthor] = await library.withAuthors([post], (k) =>
      app.storage ? app.storage.publicUrl(k) : null,
    );
    return withAudioUrl(withAuthor!);
  });

  /** Edit (author or admin). */
  app.patch(
    '/library/posts/:id',
    // an edit can put new words in front of readers, so it waits for a birth
    // month like a new post does; unpublish and delete never do
    { schema: { params: idParam, body: updateBody }, preHandler: [requireBirthMonth, requireUnrestricted('post')] },
    async (req, reply) => {
      const patch = req.body as z.infer<typeof updateBody>;
      const current = await editable(req, reply);
      if (!current) return reply;
      // refused for what it is before it counts toward anything (the update
      // checks again, under the post's lock, and decides)
      const problem = editProblem(current, patch);
      if (problem) return refuse(reply, problem);
      const added = addedPictures(current, patch);
      if (added.length > 0) await assertUnrestricted(app.db, req.user!.id, 'media');
      const pictures = await checkPostPictures(app.db, current.authorId, added);
      if (!pictures.ok) return refuse(reply, { code: pictures.code, mediaKey: pictures.mediaKey });
      // a new voice rendition is checked like one attached to a new post (the
      // one it already has is not "attached" again by an edit that resends it)
      if (patch.audioMediaId !== current.audioMediaId && !(await audioOk(req, patch.audioMediaId))) {
        return reply.code(422).send(audioRefused);
      }
      // new words or new pictures on a published post put something new in
      // front of readers, so the edit is gated like a post; a draft's are
      // gated whole when it is published. Staff editing somebody's post are
      // not posting, and their words are not the author's (trust/post-gate.ts)
      const words = changedWords(current, patch);
      const own = current.authorId === req.user!.id;
      const gated = own && current.status === 'published' && (words !== '' || added.length > 0);
      if (gated) {
        const refused = await gate.check(req.user!.id, words);
        if (refused) return reply.code(refused.status).send({ code: refused.code, message: refused.message });
      }
      const res = await library.update(current.id, req.user!.id, isAdmin(req), patch);
      if (res.ok && gated) await gate.passed(req.user!.id, words ? screened(res.post) : null);
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
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: [requireBirthMonth, requireUnrestricted('post')] },
    async (req, reply) => {
      const current = await editable(req, reply);
      if (!current) return reply;
      // a draft going up is a post reaching readers for the first time. Staff
      // putting up somebody's draft are not posting: nothing is counted
      // against them, and the author's words are screened as the author's
      const goingUp = current.status === 'draft';
      const own = current.authorId === req.user!.id;
      // its pictures and voice note go up with it: a feature limit stops that
      // as it stops attaching them, or a draft saved before the limit (or a
      // post unpublished for the purpose) would be the way round it
      if (goingUp && (current.media.length > 0 || current.audioMediaId)) {
        await assertUnrestricted(app.db, req.user!.id, 'media');
      }
      if (goingUp && own) {
        const refused = await gate.check(req.user!.id, postWords(current));
        if (refused) return reply.code(refused.status).send({ code: refused.code, message: refused.message });
      }
      const res = await library.setStatus(current.id, req.user!.id, isAdmin(req), 'published');
      if (res.ok && goingUp) {
        if (own) await gate.passed(req.user!.id, screened(res.post));
        else await gate.screen(current.authorId, screened(res.post));
      }
      return respond(reply, res);
    },
  );

  /** Soft-remove (author or admin); retained for moderation (#285). */
  app.delete(
    '/library/posts/:id',
    { schema: { params: idParam }, config: { skipValidation: true }, preHandler: requireAuth },
    async (req, reply) => respond(reply, await library.setStatus((req.params as { id: string }).id, req.user!.id, isAdmin(req), 'removed')),
  );

  /**
   * Your server drafts, so one saved by an app installed before drafts moved
   * onto the device can be found, finished and published.
   */
  app.get('/me/library/drafts', { schema: { querystring: page }, preHandler: requireAuth }, async (req) => {
    const { limit, offset } = req.query as z.infer<typeof page>;
    const drafts = await library.drafts(req.user!.id, { limit, offset });
    const withAuthor = await library.withAuthors(drafts, publicUrl);
    return { posts: withAuthor.map(withAudioUrl) };
  });
}

/** What the screening reads of a post that went up: every word on it. */
function screened(post: LibraryPost): { surface: 'library'; contentType: 'post'; contentRef: string; text: string } {
  return { surface: 'library', contentType: 'post', contentRef: post.id, text: postWords(post) };
}

/**
 * A refused post: 422 with the code the composer knows (`@kurda/shared`
 * POST_ERROR_CODES), and what to point at — the field and its limit, or the
 * picture.
 */
function refuse(reply: FastifyReply, problem: PostRejection): FastifyReply {
  return reply.code(422).send({ ...problem, message: refusalMessage(problem) });
}

function refusalMessage(problem: PostRejection): string {
  switch (problem.code) {
    case 'EMPTY_POST':
      return 'a post needs words or a picture';
    case 'TITLE_REQUIRED':
      return 'a story or a poem needs a title';
    case 'TOO_LONG':
      return `${problem.field} is longer than ${problem.max} characters`;
    case 'TOO_MANY_PICTURES':
      return `a post can have at most ${problem.max} pictures`;
    case 'MEME_NEEDS_PICTURE':
      return 'only a post with pictures can be a meme';
    case 'INVALID_MEDIA':
      return 'attach pictures you uploaded via /images/upload';
    case 'MEDIA_IN_USE':
      return 'this picture is already on a post';
  }
}
