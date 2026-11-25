/**
 * Gifts onto a post: which posts can take one, the small row a post shows, and who sent them. A post is a written post
 * (`library`) or an old picture post (`image`), as the wall knows them (feed/service.ts).
 */
import type pg from 'pg';
import type { PostGifts, PostGiftSender } from '@kurda/shared';
import { cosmeticAssetUrl, type PublicUrl } from '../cosmetics/access.js';
import { notBlockedSql } from '../friends/blocked.js';
import { notKnownAdultSql, writtenForSql } from '../users/age.js';
import { SENDER_COLUMNS, giftSenderShownSql, toSender, type SenderRow } from './cards.js';

type Executor = Pick<pg.Pool, 'query'>;

export const POST_TYPES = ['library', 'image'] as const;
export type PostType = (typeof POST_TYPES)[number];

/** A post a gift is given onto. */
export interface PostRef {
  type: PostType;
  id: string;
}

const TABLE: Record<PostType, string> = { library: 'library_posts', image: 'image_posts' };

/** The author of a published post `viewer` can read (no block either way, a minor's post only to their friends), or null. */
export async function visiblePostAuthor(db: Executor, post: PostRef, viewer: string | null): Promise<string | null> {
  const res = await db.query<{ author_id: string }>(
    `SELECT p.author_id FROM ${TABLE[post.type]} p
      WHERE p.id = $1 AND p.status = 'published'
        AND ${writtenForSql('p.author_id', '$2::uuid')} AND ${notBlockedSql('p.author_id', '$2::uuid')}`,
    [post.id, viewer],
  );
  return res.rows[0]?.author_id ?? null;
}

/**
 * The recipients a gift onto a post cannot reach (`toIds` holds its author): one becomes possible once the two have been
 * friends for `hours`, or at once when both are known adults. Read in the send's transaction.
 */
export async function postGiftBlocked(client: Executor, fromId: string, toIds: readonly string[], hours: number): Promise<Set<string>> {
  if (toIds.length === 0) return new Set();
  const rows = await client.query<{ id: string; blocked: boolean }>(
    `SELECT u.id,
            (${notKnownAdultSql('u')} OR ${notKnownAdultSql('s')})
            AND NOT EXISTS (
              SELECT 1 FROM friendships f
               WHERE f.status = 'accepted' AND f.user_lo = LEAST(u.id, s.id) AND f.user_hi = GREATEST(u.id, s.id)
                 AND COALESCE(f.responded_at, f.created_at) <= now() - make_interval(hours => $3)) AS blocked
       FROM users u JOIN users s ON s.id = $1
      WHERE u.id = ANY($2::uuid[])`,
    [fromId, toIds, hours],
  );
  return new Set(rows.rows.filter((r) => r.blocked).map((r) => r.id));
}

/**
 * The gift rows of many posts at once, for the wall, as one reader sees them: each post's count and items, most given
 * first, how many people gave, and the latest giver the reader may see (`giftSenderShownSql`).
 */
export async function postGiftsFor(db: Executor, posts: readonly PostRef[], viewer: string | null, publicUrl: PublicUrl): Promise<Map<string, PostGifts>> {
  const out = new Map<string, PostGifts>();
  if (posts.length === 0) return out;
  const on = [posts.map((p) => p.type), posts.map((p) => p.id)];
  const ON_POSTS = `(g.post_type, g.post_id) IN (SELECT * FROM unnest($1::text[], $2::uuid[]))`;
  const [items, givers] = await Promise.all([
    db.query<{ post_type: PostType; post_id: string; sku: string; name: string; category: string; asset_key: string | null; n: number }>(
      `SELECT g.post_type, g.post_id, g.sku, i.name, i.category, i.asset_key, count(*)::int AS n
         FROM gifts g JOIN shop_items i ON i.sku = g.sku
        WHERE ${ON_POSTS}
        GROUP BY g.post_type, g.post_id, g.sku, i.name, i.category, i.asset_key
        ORDER BY n DESC, min(g.created_at)`,
      on,
    ),
    db.query<SenderRow & { post_type: PostType; post_id: string; senders: number }>(
      `SELECT p.post_type, p.post_id, p.senders, latest.*
         FROM (SELECT g.post_type, g.post_id, count(DISTINCT g.from_user_id)::int AS senders
                 FROM gifts g WHERE ${ON_POSTS} GROUP BY g.post_type, g.post_id) p
         LEFT JOIN LATERAL (
           SELECT ${SENDER_COLUMNS}, true AS sender_shown
             FROM gifts g JOIN users s ON s.id = g.from_user_id
            WHERE g.post_type = p.post_type AND g.post_id = p.post_id AND ${giftSenderShownSql('s', '$3::uuid')}
            ORDER BY g.created_at DESC
            LIMIT 1
         ) latest ON true`,
      [...on, viewer],
    ),
  ]);
  for (const r of items.rows) {
    const key = `${r.post_type}:${r.post_id}`;
    const gifts = out.get(key) ?? { count: 0, items: [], senders: 0, from: null };
    gifts.count += r.n;
    gifts.items.push({ sku: r.sku, name: r.name, assetUrl: cosmeticAssetUrl(r.category, r.asset_key, publicUrl), count: r.n });
    out.set(key, gifts);
  }
  for (const r of givers.rows) {
    const gifts = out.get(`${r.post_type}:${r.post_id}`);
    if (!gifts) continue;
    gifts.senders = r.senders;
    gifts.from = toSender({ ...r, sender_shown: r.sender_shown ?? false }, publicUrl);
  }
  return out;
}

/** The most senders one list reads. */
const SENDERS_LIMIT = 100;

/**
 * Every gift on a post, newest first, for someone who can read the post, each with its sender as the reader may see
 * them (`giftSenderShownSql`): a sender who is blocked, closed or not someone the reader may see is "a Hevalo member",
 * so a minor who gave a friend a gift is never a name a stranger can collect.
 */
export async function postGiftSenders(db: Executor, post: PostRef, viewer: string | null, publicUrl: PublicUrl): Promise<PostGiftSender[]> {
  const res = await db.query<SenderRow & { sku: string; name: string; category: string; asset_key: string | null; created_at: Date }>(
    `SELECT ${SENDER_COLUMNS}, COALESCE(${giftSenderShownSql('s', '$3::uuid')}, false) AS sender_shown,
            g.sku, i.name, i.category, i.asset_key, g.created_at
       FROM gifts g
       LEFT JOIN users s ON s.id = g.from_user_id
       JOIN shop_items i ON i.sku = g.sku
      WHERE g.post_type = $1 AND g.post_id = $2
      ORDER BY g.created_at DESC
      LIMIT ${SENDERS_LIMIT}`,
    [post.type, post.id, viewer],
  );
  return res.rows.map((r) => ({
    from: toSender(r, publicUrl),
    sku: r.sku,
    itemName: r.name,
    assetUrl: cosmeticAssetUrl(r.category, r.asset_key, publicUrl),
    at: new Date(r.created_at).toISOString(),
  }));
}

/**
 * Why a gift to one person cannot go yet, for the picker's calm line: on a post the post rule (`postGiftBlocked`), in a
 * chat a friendship younger than a day where both are not known adults. Null when it can go.
 */
export async function giftHold(db: Executor, fromId: string, toId: string, onPost: boolean, hours: number): Promise<'new_friend' | 'friends_only' | null> {
  const res = await db.query<{ adults: boolean; friends: boolean; old: boolean }>(
    `SELECT NOT (${notKnownAdultSql('u')} OR ${notKnownAdultSql('s')}) AS adults,
            f.user_lo IS NOT NULL AS friends,
            COALESCE(COALESCE(f.responded_at, f.created_at) <= now() - make_interval(hours => $3), false) AS old
       FROM users u JOIN users s ON s.id = $1
       LEFT JOIN friendships f ON f.status = 'accepted' AND f.user_lo = LEAST(u.id, s.id) AND f.user_hi = GREATEST(u.id, s.id)
      WHERE u.id = $2`,
    [fromId, toId, hours],
  );
  const r = res.rows[0];
  if (!r || r.adults) return null;
  if (!r.friends) return onPost ? 'friends_only' : null;
  return r.old ? null : 'new_friend';
}
