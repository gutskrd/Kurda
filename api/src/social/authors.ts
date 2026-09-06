import type pg from 'pg';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';

/**
 * Who wrote something.
 *
 * Every surface where users post — library stories and poems, image posts, and
 * the comments under both — needs the same three fields, resolved the same way.
 * One loader means one face per person across the whole app; two would drift the
 * moment one of them forgot that an uploaded photo outranks a chosen avatar.
 */
export interface Author {
  id: string;
  username: string;
  /** already resolved (uploaded photo -> chosen avatar) */
  avatarUrl: string | null;
}

/**
 * Look up a batch of authors at once.
 *
 * Callers pass every id on the page — duplicates included, since a thread is
 * mostly the same few people — and get one query back rather than one per row.
 */
export async function loadAuthors(
  pool: pg.Pool,
  ids: readonly string[],
  publicUrl: PublicUrl = () => null,
): Promise<Map<string, Author>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await pool.query<{
    id: string;
    username: string;
    profile_photo_key: string | null;
    selected_avatar_key: string | null;
  }>(`SELECT id, username, profile_photo_key, selected_avatar_key FROM users WHERE id = ANY($1)`, [unique]);
  return new Map(
    rows.rows.map((r) => [
      r.id,
      { id: r.id, username: r.username, avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl) },
    ]),
  );
}

/**
 * Stand-in for an author whose row has gone (a deleted account).
 * The post survives deletion, so it still needs a name to show.
 */
export function unknownAuthor(id: string): Author {
  return { id, username: 'Deleted account', avatarUrl: null };
}
