import type pg from 'pg';
import {
  POST_BODY_MAX,
  POST_TITLE_MAX,
  WRITTEN_POST_TYPES,
  cleanPostText,
  derivePostType,
  postProblems,
  titleRequiredFor,
  type PostContent,
  type PostProblem,
  type WrittenPostType,
} from '@kurda/shared';
import type { PublicUrl } from '../cosmetics/access.js';
import { claimPostPictures, releasePostPictures, type PictureClaimFailure } from '../media/postMedia.js';
import { loadAuthors, unknownAuthor, type Author } from '../social/authors.js';
import { writtenForSql } from '../users/age.js';

// posts and comments both re-export these, so a caller importing from here
// still gets the one shared loader
export { loadAuthors, unknownAuthor, type Author };

/**
 * What a written post is.
 *
 * A çîrok and a helbest are pieces of work — titled, and looked for by name. A
 * gotin is a saying: a line or two, read in passing and no title needed. Any of
 * them can carry up to four pictures.
 */
export type PostType = WrittenPostType;

export const POST_TYPES: readonly PostType[] = WRITTEN_POST_TYPES;

/** Only a gotin may go without a name; the database enforces this too. */
export function titleRequired(type: PostType): boolean {
  return titleRequiredFor(type);
}
export type AuthorRole = 'user' | 'admin';
export type PostStatus = 'draft' | 'published' | 'removed';

export const MAX_TITLE_LEN = POST_TITLE_MAX;
export const MAX_BODY_LEN = POST_BODY_MAX;

/** A picture as a request names it: an upload, and what it shows. */
export interface PostMediaInput {
  mediaKey: string;
  altText?: string | null;
}

/** A picture on a post, in its position. */
export interface PostMedia {
  mediaKey: string;
  altText: string | null;
  /** the size it was stored at, px; null for nothing recorded */
  width: number | null;
  height: number | null;
}

export interface CreateInput {
  /** left out, the title decides (`derivePostType`): a title makes a çîrok */
  type?: PostType;
  /** required for a çîrok or a helbest; a gotin has none */
  title?: string | null;
  /** may be empty when the post has a picture */
  body?: string | null;
  media?: PostMediaInput[];
  meme?: boolean;
  sourceCredit?: string | null;
  audioMediaId?: string | null;
  language?: string;
  publish?: boolean; // default true; false = draft
}

export interface UpdateInput {
  type?: PostType;
  /** null or empty clears it, which only a gotin may be without */
  title?: string | null;
  body?: string;
  /** the whole list, in order: kept keys stay, new ones are claimed, missing ones let go */
  media?: PostMediaInput[];
  meme?: boolean;
  sourceCredit?: string | null;
  audioMediaId?: string | null;
  language?: string;
}

export interface LibraryPost {
  id: string;
  authorId: string;
  authorRole: AuthorRole;
  type: PostType;
  /** null on a gotin, which has no name */
  title: string | null;
  /** '' on a post that is only its pictures */
  body: string;
  audioMediaId: string | null;
  language: string;
  status: PostStatus;
  viewCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  /** up to four, in order */
  media: PostMedia[];
  /** marked for the Memes filter; only ever true with pictures */
  meme: boolean;
  /** "Source / credit", shown under the post */
  sourceCredit: string | null;
}


/**
 * A post with its author attached.
 *
 * A separate type rather than optional fields on LibraryPost: the read paths
 * always populate it and the write paths never do, so making it optional would
 * push a "did this one come with an author?" check onto every caller.
 */
export interface LibraryPostWithAuthor extends LibraryPost {
  author: Author;
}

export interface ListFilters {
  type?: PostType;
  language?: string;
  authorId?: string;
  sort?: 'newest' | 'popular';
  limit?: number;
  offset?: number;
  /** who is reading: a minor's posts are listed only for them and their friends */
  viewerId?: string | null;
}

/**
 * Why a post was refused: its shape (the same check the composer runs, see
 * `@kurda/shared` post-composer) or one of the pictures it names.
 */
export type PostRejection = PostProblem | { code: PictureClaimFailure; mediaKey: string };

type Invalid = { ok: false; reason: 'invalid'; problem: PostRejection };
export type CreateResult = { ok: true; post: LibraryPost } | Invalid;
export type MutateResult = { ok: true; post: LibraryPost } | { ok: false; reason: 'not-found' | 'forbidden' } | Invalid;

interface Row {
  id: string; author_id: string; author_role: AuthorRole; type: PostType; title: string | null; body: string;
  audio_media_id: string | null; language: string; status: PostStatus; view_count: number;
  comment_count: number; created_at: Date; updated_at: Date; published_at: Date | null;
  is_meme: boolean; source_credit: string | null;
}

/** The shape check for a new post, before anything else is looked at. */
export function createProblem(input: CreateInput): PostProblem | null {
  return postProblems(contentOf(input))[0] ?? null;
}

/**
 * Every word a post shows, one block of text, for the spam check and the
 * screening: title, text, alt texts and credit, the empty ones left out. (The
 * title used to be interpolated as it came, so a gotin was screened as the word
 * "undefined" or "null" followed by its text.)
 */
export function postWords(post: {
  title?: string | null;
  body?: string | null;
  media?: ReadonlyArray<{ altText?: string | null }>;
  sourceCredit?: string | null;
}): string {
  return [post.title, post.body, ...(post.media ?? []).map((m) => m.altText), post.sourceCredit]
    .map(cleanPostText)
    .filter(Boolean)
    .join('\n');
}

/**
 * The words an edit adds or changes, and only those: a title, text or credit
 * that differs, an alt text that is new for its picture. Empty when an edit
 * only reorders, removes or re-sends what was there — re-screening unchanged
 * words would count them as repeats in the spam check.
 */
export function changedWords(current: LibraryPost, patch: UpdateInput): string {
  const changed = (next: string | null | undefined, now: string | null): string | null =>
    next !== undefined && cleanPostText(next) !== cleanPostText(now) ? next : null;
  const altNow = new Map(current.media.map((m) => [m.mediaKey, m.altText]));
  return postWords({
    title: changed(patch.title, current.title),
    body: changed(patch.body, current.body),
    media: (patch.media ?? []).map((m) => ({ altText: changed(m.altText ?? null, altNow.get(m.mediaKey) ?? null) })),
    sourceCredit: changed(patch.sourceCredit, current.sourceCredit),
  });
}

/**
 * Community library authoring + browsing (KUR-281). A post is words, pictures,
 * or both (up to four, each its author's own upload); audio is optional; admins
 * and signed-in users author, guests only read. Text is control-char-stripped
 * on input (#108, newlines preserved for poems); web/admin surfaces escape on
 * render. Removal is soft (retained for moderation #285), and so a removed
 * post keeps its pictures.
 *
 * What a minor publishes is read by them and their friends only: to anyone
 * else, signed in or not, it is not there (users/age.ts `writtenForSql`). A
 * public byline was a way to find minors, and a stranger's reply a way to
 * reach one. It is worked out when read, so it ends by itself at 18.
 */
export class LibraryService {
  constructor(private readonly pool: pg.Pool) {}

  async create(authorId: string, authorRole: AuthorRole, input: CreateInput): Promise<CreateResult> {
    const problem = createProblem(input);
    if (problem) return { ok: false, reason: 'invalid', problem };
    const content = contentOf(input);
    const type = derivePostType(content);
    const media = (input.media ?? []).map((m) => ({ mediaKey: m.mediaKey, altText: cleanPostText(m.altText) || null }));
    const publish = input.publish !== false;

    return this.inTransaction(async (client) => {
      // the pictures first: they are the part that can still be refused
      const claim = await claimPostPictures(client, authorId, media.map((m) => m.mediaKey));
      if (!claim.ok) return { ok: false, reason: 'invalid', problem: { code: claim.code, mediaKey: claim.mediaKey } };

      const res = await client.query<Row>(
        `INSERT INTO library_posts
           (author_id, author_role, type, title, body, audio_media_id, language, status, published_at, is_meme, source_credit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 = 'published' THEN now() ELSE NULL END, $9, $10)
         RETURNING *`,
        [
          authorId, authorRole, type, cleanPostText(input.title) || null, cleanPostText(input.body),
          input.audioMediaId ?? null, input.language ?? 'kmr', publish ? 'published' : 'draft',
          input.meme === true, cleanPostText(input.sourceCredit) || null,
        ],
      );
      const row = res.rows[0]!;
      await writeMedia(client, row.id, media);
      return { ok: true, post: toPost(row, await this.mediaFor(client, [row.id])) };
    });
  }

  /**
   * Attach authors to posts in one extra query.
   *
   * Every post statement selects whole rows from library_posts alone; joining
   * users into each of them would mean rewriting five statements to serve one
   * display concern. A single lookup keyed by the ids already in hand is both
   * smaller and easier to keep right.
   */
  async withAuthors(posts: LibraryPost[], publicUrl: PublicUrl = () => null): Promise<LibraryPostWithAuthor[]> {
    const authors = await loadAuthors(this.pool, posts.map((p) => p.authorId), publicUrl);
    return posts.map((p) => ({ ...p, author: authors.get(p.authorId) ?? unknownAuthor(p.authorId) }));
  }

  /** Browse published posts (paginated, filterable). */

  async list(filters: ListFilters = {}): Promise<LibraryPost[]> {
    const params: unknown[] = [filters.viewerId ?? null];
    const conds = [`status = 'published'`, writtenForSql('library_posts.author_id', '$1::uuid')];
    if (filters.type) { params.push(filters.type); conds.push(`type = $${params.length}`); }
    if (filters.language) { params.push(filters.language); conds.push(`language = $${params.length}`); }
    if (filters.authorId) { params.push(filters.authorId); conds.push(`author_id = $${params.length}`); }
    const order = filters.sort === 'popular' ? 'view_count DESC, created_at DESC' : 'created_at DESC';
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = Math.max(0, filters.offset ?? 0);
    params.push(limit, offset);
    const res = await this.pool.query<Row>(
      `SELECT * FROM library_posts WHERE ${conds.join(' AND ')}
       ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return this.hydrate(res.rows);
  }

  /**
   * Your own unpublished drafts, most recently touched first.
   *
   * The composer keeps drafts on the device now, but the apps installed before
   * it saved them on the server with no way to find them again; this is that
   * way, so a draft can be opened, finished and published.
   */
  async drafts(authorId: string, opts: { limit?: number; offset?: number } = {}): Promise<LibraryPost[]> {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = Math.max(0, opts.offset ?? 0);
    const res = await this.pool.query<Row>(
      `SELECT * FROM library_posts WHERE author_id = $1 AND status = 'draft'
        ORDER BY updated_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [authorId, limit, offset],
    );
    return this.hydrate(res.rows);
  }

  /** Read a single published post and increment its view count. */
  async get(id: string, viewerId: string | null = null): Promise<LibraryPost | null> {
    const res = await this.pool.query<Row>(
      `UPDATE library_posts SET view_count = view_count + 1
       WHERE id = $1 AND status = 'published' AND ${writtenForSql('library_posts.author_id', '$2::uuid')}
       RETURNING *`,
      [id, viewerId],
    );
    return (await this.hydrate(res.rows))[0] ?? null;
  }

  /**
   * A post as it stands, draft or published, for deciding what an edit or a
   * publish needs before it is made. Not for showing: no view counted, no
   * reader rules — the write that follows checks who may make it.
   */
  async current(id: string): Promise<LibraryPost | null> {
    const res = await this.pool.query<Row>(`SELECT * FROM library_posts WHERE id = $1 AND status <> 'removed'`, [id]);
    return (await this.hydrate(res.rows))[0] ?? null;
  }

  /**
   * Author or admin edits a post.
   *
   * The edit is checked as the post it makes — the same rules as a new one, so
   * clearing a story's title or taking the last picture off an empty post is
   * refused, not half-applied. New pictures must be unused uploads of the
   * post's author (an admin cannot put their own upload on someone's post);
   * pictures left out of `media` are let go to the orphan sweep.
   */
  async update(id: string, actorId: string, actorIsAdmin: boolean, patch: UpdateInput): Promise<MutateResult> {
    return this.owned(id, actorId, actorIsAdmin, async (client, row) => {
      const current = toPost(row, await this.mediaFor(client, [id]));
      // nothing asked for: nothing changes, not even when it was last edited
      if (Object.values(patch).every((v) => v === undefined)) return { ok: true as const, post: current };
      const { content: next, media: nextMedia } = mergeEdit(current, patch);
      const [problem] = postProblems(next);
      if (problem) return { ok: false as const, reason: 'invalid' as const, problem };

      if (patch.media) {
        const nowKeys = current.media.map((m) => m.mediaKey);
        const nextKeys = nextMedia.map((m) => m.mediaKey);
        const twice = nextKeys.find((k, i) => nextKeys.indexOf(k) !== i);
        if (twice) return { ok: false as const, reason: 'invalid' as const, problem: { code: 'MEDIA_IN_USE' as const, mediaKey: twice } };
        const claim = await claimPostPictures(client, row.author_id, addedPictures(current, patch));
        if (!claim.ok) {
          return { ok: false as const, reason: 'invalid' as const, problem: { code: claim.code, mediaKey: claim.mediaKey } };
        }
        await releasePostPictures(client, nowKeys.filter((k) => !nextKeys.includes(k)));
        await client.query(`DELETE FROM library_post_media WHERE post_id = $1`, [id]);
        await writeMedia(client, id, nextMedia);
      }

      const res = await client.query<Row>(
        `UPDATE library_posts
            SET type = $2, title = $3, body = $4, is_meme = $5, source_credit = $6,
                audio_media_id = $7, language = $8, updated_at = now()
          WHERE id = $1 RETURNING *`,
        [
          id, derivePostType(next), cleanPostText(next.title) || null, cleanPostText(next.body), next.meme === true,
          cleanPostText(next.sourceCredit) || null,
          patch.audioMediaId !== undefined ? patch.audioMediaId : current.audioMediaId,
          patch.language ?? current.language,
        ],
      );
      return { ok: true as const, post: toPost(res.rows[0]!, await this.mediaFor(client, [id])) };
    });
  }

  async setStatus(id: string, actorId: string, actorIsAdmin: boolean, status: 'published' | 'draft' | 'removed'): Promise<MutateResult> {
    return this.owned(id, actorId, actorIsAdmin, async (client) => {
      const res = await client.query<Row>(
        `UPDATE library_posts
         SET status = $2, updated_at = now(),
             published_at = CASE WHEN $2 = 'published' AND published_at IS NULL THEN now() ELSE published_at END
         WHERE id = $1 RETURNING *`,
        [id, status],
      );
      return { ok: true as const, post: toPost(res.rows[0]!, await this.mediaFor(client, [id])) };
    });
  }

  /** Rows to posts, with their pictures in one extra query. */
  private async hydrate(rows: Row[]): Promise<LibraryPost[]> {
    if (rows.length === 0) return [];
    const media = await this.mediaFor(this.pool, rows.map((r) => r.id));
    return rows.map((r) => toPost(r, media));
  }

  /** The pictures of these posts, by post, in order. */
  private async mediaFor(executor: Pick<pg.Pool, 'query'>, postIds: string[]): Promise<Map<string, PostMedia[]>> {
    const res = await executor.query<{
      post_id: string; media_key: string; alt_text: string | null; width: number | null; height: number | null;
    }>(
      `SELECT post_id, media_key, alt_text, width, height FROM library_post_media
        WHERE post_id = ANY($1::uuid[]) ORDER BY post_id, position`,
      [postIds],
    );
    const byPost = new Map<string, PostMedia[]>();
    for (const r of res.rows) {
      const list = byPost.get(r.post_id) ?? [];
      list.push({ mediaKey: r.media_key, altText: r.alt_text, width: r.width, height: r.height });
      byPost.set(r.post_id, list);
    }
    return byPost;
  }

  /** Run `fn` in a transaction; a refusal it returns rolls back whatever it had done. */
  private async inTransaction<T extends { ok: boolean }>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query(result.ok ? 'COMMIT' : 'ROLLBACK');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Run `fn` only if the actor owns the post or is an admin, with the post's
   * row locked. A refusal `fn` returns rolls back whatever it had done.
   */
  private async owned(
    id: string,
    actorId: string,
    actorIsAdmin: boolean,
    fn: (client: pg.PoolClient, row: Row) => Promise<MutateResult>,
  ): Promise<MutateResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<Row>(
        `SELECT * FROM library_posts WHERE id = $1 AND status <> 'removed' FOR UPDATE`,
        [id],
      );
      const post = found.rows[0];
      if (!post) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (post.author_id !== actorId && !actorIsAdmin) { await client.query('ROLLBACK'); return { ok: false, reason: 'forbidden' }; }
      const result = await fn(client, post);
      await client.query(result.ok ? 'COMMIT' : 'ROLLBACK');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * The post an edit would make — the patch laid over the post as it stands —
 * as the shared check reads it, and the pictures it would have.
 */
function mergeEdit(
  current: LibraryPost,
  patch: UpdateInput,
): { content: PostContent; media: Array<{ mediaKey: string; altText: string | null }> } {
  const media = patch.media
    ? patch.media.map((m) => ({ mediaKey: m.mediaKey, altText: cleanPostText(m.altText) || null }))
    : current.media;
  return {
    media,
    content: {
      type: patch.type ?? current.type,
      title: patch.title !== undefined ? patch.title : current.title,
      body: patch.body !== undefined ? patch.body : current.body,
      pictures: media,
      // taking the last picture off a meme makes it a post again, unless the
      // edit asks for a meme with no picture, which is refused
      meme: patch.meme ?? (current.meme && media.length > 0),
      sourceCredit: patch.sourceCredit !== undefined ? patch.sourceCredit : current.sourceCredit,
    },
  };
}

/** The shape check for an edit: the post it would leave, checked as a new one is. */
export function editProblem(current: LibraryPost, patch: UpdateInput): PostProblem | null {
  return postProblems(mergeEdit(current, patch).content)[0] ?? null;
}

/** The pictures an edit puts on a post that were not on it. */
export function addedPictures(current: LibraryPost, patch: UpdateInput): string[] {
  const now = new Set(current.media.map((m) => m.mediaKey));
  return (patch.media ?? []).map((m) => m.mediaKey).filter((k) => !now.has(k));
}

/** A create request as the shared check reads it. */
function contentOf(input: CreateInput): PostContent {
  return {
    type: input.type,
    title: input.title,
    body: input.body,
    pictures: input.media ?? [],
    meme: input.meme,
    sourceCredit: input.sourceCredit,
  };
}

/** Write a post's pictures in order, with the size each upload was stored at. */
async function writeMedia(
  executor: Pick<pg.PoolClient, 'query'>,
  postId: string,
  media: ReadonlyArray<{ mediaKey: string; altText: string | null }>,
): Promise<void> {
  if (media.length === 0) return;
  await executor.query(
    `INSERT INTO library_post_media (post_id, position, media_key, alt_text, width, height)
     SELECT $1, t.pos - 1, t.key, t.alt, m.width, m.height
       FROM unnest($2::text[], $3::text[]) WITH ORDINALITY AS t(key, alt, pos)
       LEFT JOIN media_uploads m ON m.key = t.key`,
    [postId, media.map((m) => m.mediaKey), media.map((m) => m.altText)],
  );
}

function toPost(r: Row, media: Map<string, PostMedia[]>): LibraryPost {
  return {
    id: r.id, authorId: r.author_id, authorRole: r.author_role, type: r.type, title: r.title, body: r.body,
    audioMediaId: r.audio_media_id, language: r.language, status: r.status, viewCount: r.view_count,
    commentCount: r.comment_count, createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
    media: media.get(r.id) ?? [], meme: r.is_meme, sourceCredit: r.source_credit,
  };
}
