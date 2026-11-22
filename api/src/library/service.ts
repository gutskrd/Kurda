import type pg from 'pg';
import {
  MAX_OPEN_DRAFTS,
  cleanPostText,
  derivePostType,
  limitDetails,
  postProblems,
  titleRequiredFor,
  type PostContent,
  type PostProblem,
  type WrittenPostType,
} from '@kurda/shared';
import type { PublicUrl } from '../cosmetics/access.js';
import { AppError } from '../plugins/errors.js';
import { lockPersonFor } from '../limits/limits.js';
import { claimPostPictures, releasePostPictures, type PictureClaimFailure } from '../media/postMedia.js';
import { OPEN_CASE_PREDICATE } from '../moderation/reports-service.js';
import { attachPostContext } from '../moderation/pictures-service.js';
import { loadAuthors, unknownAuthor, type Author } from '../social/authors.js';
import { writtenForSql } from '../users/age.js';
import { notBlockedSql } from '../friends/blocked.js';

// Re-exported so callers importing from here get the one shared loader.
export { loadAuthors, unknownAuthor, type Author };

/**
 * What a written post is. A çîrok and a helbest are titled works, found by name; a gotin is a saying of a line or two
 * with no title. Any can carry up to four pictures.
 */
export type PostType = WrittenPostType;

/** Only a gotin may go without a name; the database enforces this too. */
export function titleRequired(type: PostType): boolean {
  return titleRequiredFor(type);
}
export type AuthorRole = 'user' | 'admin';
/** `held`: one of its pictures waits for a person, and only its author sees it meanwhile */
export type PostStatus = 'draft' | 'published' | 'removed' | 'held';

/**
 * Unfinished server drafts one person may keep (@kurda/shared). Drafts reach nobody and are not gated like posts, so
 * this bounds them; only older apps save drafts on the server.
 */
export { MAX_OPEN_DRAFTS };

/** A picture as a request names it: an upload, and what it shows. */
export interface PostMediaInput {
  mediaKey: string;
  altText?: string | null;
}

/** A picture on a post, in its position. */
export interface PostMedia {
  mediaKey: string;
  altText: string | null;
  /** The stored size in pixels; null when unrecorded. */
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
  /** the author's own copy of a post whose pictures a person is checking; nobody else is shown it */
  review?: 'held';
}


/** A post with its author attached; a separate type because read paths always fill it and write paths never do. */
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

/** Why a post was refused: its shape (the composer's check) or one of its pictures. */
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

/** Every word a post shows as one block, for the spam check and screening: title, text, alt texts and credit, empty ones left out. */
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
 * Only the words an edit adds or changes: a different title, text or credit, or a new alt text. Empty for reorders,
 * removals and resends, since re-screening unchanged words would count them as spam repeats.
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

/** Posts and drafts one member may start a day (rolling 24 hours): a prolific writer's day, never a script's. */
export const POSTS_PER_DAY = 30;

/**
 * Library writing and browsing. A post is words, up to four of its author's own pictures, or both, with optional
 * audio. Text is stripped of control characters on input (newlines kept for poems) and escaped by the apps. Removal
 * is soft and kept for moderation, pictures included. A minor's posts are read only by them and their friends
 * (users/age.ts `writtenForSql`), decided at read time so it ends at 18, and nothing is read across a block in either
 * direction (friends/blocked.ts).
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
      // A member's new posts and drafts are counted under their lock, so a burst cannot pass POSTS_PER_DAY together;
      // staff writing for the library are not counted.
      if (authorRole !== 'admin') {
        await lockPersonFor(client, 'posts', authorId);
        const today = await client.query<{ n: number; wait: number | null }>(
          `SELECT count(*)::int AS n, ceil(extract(epoch FROM min(created_at) + interval '24 hours' - now()))::int AS wait
             FROM library_posts WHERE author_id = $1 AND created_at > now() - interval '24 hours'`,
          [authorId],
        );
        const { n, wait } = today.rows[0]!;
        if (n >= POSTS_PER_DAY) {
          throw new AppError('RATE_LIMITED', 429, 'too many posts today; try again later', { retryAfterSec: Math.max(1, wait ?? 3_600) });
        }
      }
      // New drafts are counted under the author's lock, so a burst of saves cannot pass MAX_OPEN_DRAFTS together.
      if (!publish) {
        await lockPersonFor(client, 'drafts', authorId);
        const drafts = await client.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM library_posts WHERE author_id = $1 AND status = 'draft'`,
          [authorId],
        );
        if (drafts.rows[0]!.n >= MAX_OPEN_DRAFTS) {
          throw new AppError('DRAFT_LIMIT', 429, `you have ${MAX_OPEN_DRAFTS} unfinished drafts; publish or delete one first`, limitDetails('library_drafts'));
        }
      }
      // the pictures first: they are the part that can still be refused
      const claim = await claimPostPictures(client, authorId, media.map((m) => m.mediaKey));
      if (!claim.ok) return { ok: false, reason: 'invalid', problem: { code: claim.code, mediaKey: claim.mediaKey } };
      // a picture a person checks first makes the whole post wait, seen only by its author until then
      const held = claim.pictures.filter((p) => p.held).map((p) => p.key);

      const res = await client.query<Row>(
        `INSERT INTO library_posts
           (author_id, author_role, type, title, body, audio_media_id, language, status, published_at, is_meme, source_credit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 = 'published' THEN now() ELSE NULL END, $9, $10)
         RETURNING *`,
        [
          authorId, authorRole, type, cleanPostText(input.title) || null, cleanPostText(input.body),
          input.audioMediaId ?? null, input.language ?? 'kmr', publish ? (held.length > 0 ? 'held' : 'published') : 'draft',
          input.meme === true, cleanPostText(input.sourceCredit) || null,
        ],
      );
      const row = res.rows[0]!;
      await writeMedia(client, row.id, media);
      if (held.length > 0) await attachPostContext(client, held, postWords({ ...input, media }) || null, row.id);
      return { ok: true, post: toPost(row, await this.mediaFor(client, [row.id])) };
    });
  }

  /** Attaches authors in one extra query keyed by the ids in hand, rather than joining users into every post statement. */
  async withAuthors(posts: LibraryPost[], publicUrl: PublicUrl = () => null): Promise<LibraryPostWithAuthor[]> {
    const authors = await loadAuthors(this.pool, posts.map((p) => p.authorId), publicUrl);
    return posts.map((p) => ({ ...p, author: authors.get(p.authorId) ?? unknownAuthor(p.authorId) }));
  }

  /** Browse published posts (paginated, filterable). */

  async list(filters: ListFilters = {}): Promise<LibraryPost[]> {
    const params: unknown[] = [filters.viewerId ?? null];
    const conds = [
      // an author's own list shows them their posts still waiting for a person; nobody else ever sees those
      filters.authorId && filters.authorId === filters.viewerId ? `status IN ('published','held')` : `status = 'published'`,
      writtenForSql('library_posts.author_id', '$1::uuid'),
      notBlockedSql('library_posts.author_id', '$1::uuid'),
    ];
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

  /** Your own unpublished server drafts, most recently touched first, so older apps' drafts can be finished. */
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

  /** How many unfinished server drafts this person has. */
  async draftCount(authorId: string): Promise<number> {
    const res = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM library_posts WHERE author_id = $1 AND status = 'draft'`,
      [authorId],
    );
    return res.rows[0]!.n;
  }

  /** Reads a published post and counts the view, except the author's own, so authors cannot raise their own count. */
  async get(id: string, viewerId: string | null = null): Promise<LibraryPost | null> {
    const res = await this.pool.query<Row>(
      `UPDATE library_posts
          SET view_count = view_count + CASE WHEN author_id IS NOT DISTINCT FROM $2::uuid THEN 0 ELSE 1 END
       WHERE id = $1 AND (status = 'published' OR (status = 'held' AND author_id IS NOT DISTINCT FROM $2::uuid))
         AND ${writtenForSql('library_posts.author_id', '$2::uuid')}
         AND ${notBlockedSql('library_posts.author_id', '$2::uuid')}
       RETURNING *`,
      [id, viewerId],
    );
    return (await this.hydrate(res.rows))[0] ?? null;
  }

  /** A post as it stands, draft or published, for deciding what an edit needs: no view counted and no reader rules. */
  async current(id: string): Promise<LibraryPost | null> {
    const res = await this.pool.query<Row>(`SELECT * FROM library_posts WHERE id = $1 AND status <> 'removed'`, [id]);
    return (await this.hydrate(res.rows))[0] ?? null;
  }

  /**
   * An author or admin edits a post. The result is checked as a new post would be, so an invalid edit is refused, not
   * half-applied. New pictures must be the author's unused uploads, even for an admin; pictures left out go to the
   * orphan sweep unless a moderator still needs them.
   */
  async update(id: string, actorId: string, actorIsAdmin: boolean, patch: UpdateInput): Promise<MutateResult> {
    return this.owned(id, actorId, actorIsAdmin, async (client, row) => {
      const current = toPost(row, await this.mediaFor(client, [id]));
      // Nothing asked for, so nothing changes, not even the edit time.
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
        const held = claim.pictures.filter((p) => p.held).map((p) => p.key);
        if (held.length > 0) {
          // a picture a person checks first takes a published post back to waiting, seen only by its author until then
          await client.query(`UPDATE library_posts SET status = 'held' WHERE id = $1 AND status = 'published'`, [id]);
          await attachPostContext(client, held, postWords(mergeEdit(current, patch).content) || null, id);
        }
        // A reported post's removed pictures are kept for its moderator, as a removed post's are, so an author cannot clear
        // one away before the case is opened.
        const dropped = nowKeys.filter((k) => !nextKeys.includes(k));
        if (dropped.length > 0 && !(await underReport(client, id))) await releasePostPictures(client, dropped);
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
      // publishing waits for a person while any of its pictures does
      const res = await client.query<Row>(
        `WITH waiting AS (
           SELECT EXISTS (SELECT 1 FROM library_post_media pm JOIN media_uploads m ON m.key = pm.media_key
                           WHERE pm.post_id = $1 AND m.scan_status <> 'cleared') AS yes
         )
         UPDATE library_posts
            SET status = CASE WHEN $2 = 'published' AND (SELECT yes FROM waiting) THEN 'held' ELSE $2 END, updated_at = now(),
                published_at = CASE WHEN $2 = 'published' AND NOT (SELECT yes FROM waiting) AND published_at IS NULL THEN now()
                                    ELSE published_at END
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

  /** Runs `fn` with the post's row locked if the actor owns it or is an admin; a refusal from `fn` rolls back its work. */
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

/** The post an edit would make (the patch over the current post) as the shared check reads it, and its pictures. */
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
      // Removing the last picture from a meme makes it an ordinary post, unless the edit asks for a pictureless meme, which is refused.
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

/**
 * Whether a post has an unresolved report: its moderation case (`library_post:<id>`) is open, or the old table has an
 * open row the queue has not taken in yet.
 */
async function underReport(executor: Pick<pg.PoolClient, 'query'>, postId: string): Promise<boolean> {
  const res = await executor.query<{ reported: boolean }>(
    // "Open" is written as the partial unique index on (source, source_ref) writes it, so that index alone answers.
    `SELECT EXISTS (SELECT 1 FROM moderation_cases
                     WHERE source IN ('report', 'library_report') AND source_ref = 'library_post:' || $1::uuid::text
                       AND ${OPEN_CASE_PREDICATE})
         OR EXISTS (SELECT 1 FROM library_reports
                     WHERE target_type = 'library_post' AND target_id = $1::uuid AND status = 'open') AS reported`,
    [postId],
  );
  return res.rows[0]!.reported;
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

/** Writes a post's pictures in order with the size each was stored at. */
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
    ...(r.status === 'held' ? { review: 'held' as const } : {}),
  };
}
