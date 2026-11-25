import type pg from 'pg';
import {
  COLLECTION_LIST_MAX,
  COLLECTION_PEOPLE_MAX,
  type CollectionGift,
  type CollectionIcon,
  type CollectionList,
  type CollectionPerson,
  type CollectionResponse,
} from '@kurda/shared';
import { cosmeticAssetUrl, isPremiumActive, resolveAvatarUrl, type PublicUrl } from '../cosmetics/access.js';
import { notBlockedSql } from '../friends/blocked.js';
import { availableSql } from '../moderation/availability.js';
import { shownToSql } from '../users/age.js';
import type { SocialService } from './service.js';

/** The answer of a profile that keeps its detail from the viewer. */
const KEPT: CollectionResponse = { private: true, icons: { items: [], total: 0 }, received: { items: [], total: 0 } };

interface GiftRow {
  sku: string;
  name: string;
  category: string;
  asset_key: string | null;
  n: number;
  last_at: Date;
  total: number;
}

interface PersonRow {
  sku: string;
  at: Date;
  id: string | null;
  username: string | null;
  display_name: string | null;
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
  premium_until: Date | null;
}

/**
 * A profile's collection besides its badges: the icons they own, with the one they wear, and the gifts they were given,
 * as items with how many of each and who gave them. It follows the profile's own gate (`SocialService.access`), so a
 * block hides it and a private profile shows none of it. A giver is named to each viewer only as people are named
 * anywhere: not across a block with the viewer, not once their account is gone or not available, and a minor or an
 * account of unknown age only to themselves and their friends; otherwise the gift is from a member, unnamed. Only the
 * owner sees what they sent. Lists are cut at `COLLECTION_LIST_MAX` items and `COLLECTION_PEOPLE_MAX` people.
 */
export class CollectionService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly social: Pick<SocialService, 'access'>,
  ) {}

  async collection(viewerId: string | null, targetId: string, publicUrl: PublicUrl): Promise<CollectionResponse> {
    const { private: kept } = await this.social.access(viewerId, targetId);
    if (kept) return KEPT;
    const own = viewerId !== null && viewerId === targetId;
    const [icons, received, sent] = await Promise.all([
      this.icons(targetId, publicUrl),
      this.gifts('to', targetId, viewerId, publicUrl),
      own ? this.gifts('from', targetId, viewerId, publicUrl) : Promise.resolve(undefined),
    ]);
    return { private: false, icons, received, ...(sent ? { sent } : {}) };
  }

  /** The icons they own, the one worn first, then the newest. */
  private async icons(userId: string, publicUrl: PublicUrl): Promise<CollectionList<CollectionIcon>> {
    const r = await this.pool.query<{ sku: string; name: string; asset_key: string | null; worn: boolean; total: number }>(
      // worn as the profile shows it: equipped and not hidden (cosmetics/access.ts); an owned icon needs no premium
      `SELECT i.sku, i.name, i.asset_key, (u.equipped_icon_sku = i.sku AND u.premium_icon_enabled) AS worn, count(*) OVER ()::int AS total
         FROM user_entitlements e
         JOIN shop_items i ON i.sku = e.sku AND i.category = 'icon'
         JOIN users u ON u.id = e.user_id
        WHERE e.user_id = $1
        ORDER BY worn DESC, e.acquired_at DESC, i.sku
        LIMIT $2`,
      [userId, COLLECTION_LIST_MAX],
    );
    return {
      items: r.rows.map((row) => ({ sku: row.sku, name: row.name, assetUrl: cosmeticAssetUrl('icon', row.asset_key, publicUrl), worn: row.worn })),
      total: r.rows[0]?.total ?? 0,
    };
  }

  /**
   * Gifts as items, newest first: those sent to them (`to`), or those they sent (`from`), each with the newest few
   * people at the other end, named as `viewer` may see them.
   */
  private async gifts(side: 'to' | 'from', userId: string, viewer: string | null, publicUrl: PublicUrl): Promise<CollectionList<CollectionGift>> {
    const mine = side === 'to' ? 'g.to_user_id' : 'g.from_user_id';
    const theirs = side === 'to' ? 'g.from_user_id' : 'g.to_user_id';
    const r = await this.pool.query<GiftRow>(
      `SELECT g.sku, i.name, i.category, i.asset_key, count(*)::int AS n, max(g.created_at) AS last_at, count(*) OVER ()::int AS total
         FROM gifts g JOIN shop_items i ON i.sku = g.sku
        WHERE ${mine} = $1
        GROUP BY g.sku, i.name, i.category, i.asset_key
        ORDER BY last_at DESC, g.sku
        LIMIT $2`,
      [userId, COLLECTION_LIST_MAX],
    );
    const people = r.rows.length > 0 ? await this.people(mine, theirs, userId, viewer, r.rows.map((g) => g.sku), publicUrl) : null;
    return {
      items: r.rows.map((g) => ({
        sku: g.sku,
        name: g.name,
        category: g.category,
        assetUrl: cosmeticAssetUrl(g.category, g.asset_key, publicUrl),
        count: g.n,
        lastAt: g.last_at.toISOString(),
        people: people?.get(g.sku) ?? [],
      })),
      total: r.rows[0]?.total ?? 0,
    };
  }

  /** The newest people at the other end of each item, read in one statement for every item at once. */
  private async people(
    mine: string,
    theirs: string,
    userId: string,
    viewer: string | null,
    skus: string[],
    publicUrl: PublicUrl,
  ): Promise<Map<string, Array<{ person: CollectionPerson | null; at: string }>>> {
    const r = await this.pool.query<PersonRow>(
      `SELECT x.sku, x.created_at AS at, p.id, p.username, p.display_name, p.profile_photo_key, p.selected_avatar_key, p.premium_until
         FROM unnest($2::text[]) AS s(sku)
         CROSS JOIN LATERAL (
           SELECT g.sku, g.created_at, ${theirs} AS other FROM gifts g
            WHERE ${mine} = $1 AND g.sku = s.sku
            ORDER BY g.created_at DESC
            LIMIT $3
         ) x
         LEFT JOIN users p ON p.id = x.other AND p.deleted_at IS NULL AND ${availableSql('p')}
               AND ${notBlockedSql('p.id', '$4::uuid')} AND ${shownToSql('p', '$4::uuid')}
        ORDER BY x.sku, x.created_at DESC`,
      [userId, skus, COLLECTION_PEOPLE_MAX, viewer],
    );
    const out = new Map<string, Array<{ person: CollectionPerson | null; at: string }>>();
    for (const row of r.rows) {
      const list = out.get(row.sku) ?? [];
      list.push({
        person:
          row.id && row.username
            ? {
                id: row.id,
                username: row.username,
                displayName: row.display_name,
                avatarUrl: resolveAvatarUrl(row.profile_photo_key, row.selected_avatar_key, publicUrl, isPremiumActive(row.premium_until)),
              }
            : null,
        at: row.at.toISOString(),
      });
      out.set(row.sku, list);
    }
    return out;
  }
}
