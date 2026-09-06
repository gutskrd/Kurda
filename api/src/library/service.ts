import type pg from 'pg';
import { stripControlChars } from '@kurda/shared';
import type { PublicUrl } from '../cosmetics/access.js';
import { loadAuthors, unknownAuthor, type Author } from '../social/authors.js';

// posts and comments both re-export these, so a caller importing from here
// still gets the one shared loader
export { loadAuthors, unknownAuthor, type Author };

/**
 * What a written post is.
 *
 * A çîrok and a helbest are pieces of work — titled, and looked for by name. A
 * gotin is a saying: a line or two, read in passing and no title needed.
 */
export type PostType = 'gotin' | 'story' | 'poem';

export const POST_TYPES: readonly PostType[] = ['gotin', 'story', 'poem'];

/** Only a gotin may go without a name; the database enforces this too. */
export function titleRequired(type: PostType): boolean {
  return type !== 'gotin';
}
export type AuthorRole = 'user' | 'admin';
export type PostStatus = 'draft' | 'published' | 'removed';

export const MAX_TITLE_LEN = 200;
export const MAX_BODY_LEN = 50_000;

export interface CreateInput {
  type: PostType;
  /** required for a çîrok or a helbest; a gotin has none */
  title?: string | null;
  body: string;
  audioMediaId?: string | null;
  language?: string;
  publish?: boolean; // default true; false = draft
}

export interface UpdateInput {
  title?: string;
  body?: string;
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
  body: string;
  audioMediaId: string | null;
  language: string;
  status: PostStatus;
  viewCount: number;
  commentCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
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
}

export type CreateResult = { ok: true; post: LibraryPost } | { ok: false; reason: 'invalid' };
export type MutateResult = { ok: true; post: LibraryPost } | { ok: false; reason: 'not-found' | 'forbidden' };

interface Row {
  id: string; author_id: string; author_role: AuthorRole; type: PostType; title: string | null; body: string;
  audio_media_id: string | null; language: string; status: PostStatus; view_count: number;
  comment_count: number; created_at: Date; updated_at: Date; published_at: Date | null;
}

/**
 * Community library authoring + browsing (KUR-281). Text is required, audio
 * optional; admins and signed-in users author, guests only read. Text is
 * control-char-stripped on input (#108, newlines preserved for poems); web/admin
 * surfaces escape on render. Removal is soft (retained for moderation #285).
 */
export class LibraryService {
  constructor(private readonly pool: pg.Pool) {}

  async create(authorId: string, authorRole: AuthorRole, input: CreateInput): Promise<CreateResult> {
    const title = input.title ? clean(input.title, MAX_TITLE_LEN) : '';
    const body = clean(input.body, MAX_BODY_LEN);
    if (!body || !POST_TYPES.includes(input.type)) return { ok: false, reason: 'invalid' };
    // a story or a poem without a name is a mistake; a gotin without one is not
    if (titleRequired(input.type) && !title) return { ok: false, reason: 'invalid' };
    const publish = input.publish !== false;
    const res = await this.pool.query<Row>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, audio_media_id, language, status, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, CASE WHEN $8 = 'published' THEN now() ELSE NULL END)
       RETURNING *`,
      [authorId, authorRole, input.type, title || null, body, input.audioMediaId ?? null, input.language ?? 'kmr', publish ? 'published' : 'draft'],
    );
    return { ok: true, post: toPost(res.rows[0]!) };
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
    const conds = [`status = 'published'`];
    const params: unknown[] = [];
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
    return res.rows.map(toPost);
  }

  /** Read a single published post and increment its view count. */
  async get(id: string): Promise<LibraryPost | null> {
    const res = await this.pool.query<Row>(
      `UPDATE library_posts SET view_count = view_count + 1
       WHERE id = $1 AND status = 'published' RETURNING *`,
      [id],
    );
    return res.rows[0] ? toPost(res.rows[0]) : null;
  }

  /** Author or admin edits a post. */
  async update(id: string, actorId: string, actorIsAdmin: boolean, patch: UpdateInput): Promise<MutateResult> {
    return this.owned(id, actorId, actorIsAdmin, async (client) => {
      const sets: string[] = [];
      const params: unknown[] = [id];
      const push = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
      if (patch.title !== undefined) {
        const t = clean(patch.title, MAX_TITLE_LEN);
        if (!t) return { ok: false as const, reason: 'forbidden' as const }; // invalid title
        push('title', t);
      }
      if (patch.body !== undefined) {
        const b = clean(patch.body, MAX_BODY_LEN);
        if (!b) return { ok: false as const, reason: 'forbidden' as const };
        push('body', b);
      }
      if (patch.audioMediaId !== undefined) push('audio_media_id', patch.audioMediaId);
      if (patch.language !== undefined) push('language', patch.language);
      if (sets.length === 0) {
        const cur = await client.query<Row>(`SELECT * FROM library_posts WHERE id = $1`, [id]);
        return { ok: true as const, post: toPost(cur.rows[0]!) };
      }
      const res = await client.query<Row>(
        `UPDATE library_posts SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`,
        params,
      );
      return { ok: true as const, post: toPost(res.rows[0]!) };
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
      return { ok: true as const, post: toPost(res.rows[0]!) };
    });
  }

  /** Run `fn` only if the actor owns the post or is an admin. */
  private async owned(
    id: string,
    actorId: string,
    actorIsAdmin: boolean,
    fn: (client: pg.PoolClient) => Promise<MutateResult>,
  ): Promise<MutateResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{ author_id: string }>(
        `SELECT author_id FROM library_posts WHERE id = $1 AND status <> 'removed' FOR UPDATE`,
        [id],
      );
      const post = row.rows[0];
      if (!post) { await client.query('ROLLBACK'); return { ok: false, reason: 'not-found' }; }
      if (post.author_id !== actorId && !actorIsAdmin) { await client.query('ROLLBACK'); return { ok: false, reason: 'forbidden' }; }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

/** Strip control chars (keep newlines/tabs), trim, enforce a max length. */
function clean(input: string, max: number): string {
  return stripControlChars(input).trim().slice(0, max);
}

function toPost(r: Row): LibraryPost {
  return {
    id: r.id, authorId: r.author_id, authorRole: r.author_role, type: r.type, title: r.title, body: r.body,
    audioMediaId: r.audio_media_id, language: r.language, status: r.status, viewCount: r.view_count,
    commentCount: r.comment_count, createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
  };
}

