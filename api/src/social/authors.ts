import type pg from 'pg';
import { resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';

/** Who wrote something: one loader for every posting surface, so each person has one face across the app. */
export interface Author {
  id: string;
  username: string;
  /** already resolved (uploaded photo -> chosen avatar) */
  avatarUrl: string | null;
}

/** Looks up a batch of authors in one query; callers pass every id on the page, duplicates included. */
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

/** A stand-in for an author whose account was deleted; the post survives, so it still needs a name. */
export function unknownAuthor(id: string): Author {
  return { id, username: 'Deleted account', avatarUrl: null };
}
