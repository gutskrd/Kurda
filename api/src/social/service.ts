import type pg from 'pg';
import { foldDiacritics, normalizeKurdish } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { FriendService } from '../friends/service.js';
import { resolveAvatarUrl } from '../cosmetics/access.js';
import type { EquippedItem, PublicUrl } from '../cosmetics/access.js';

/** A favorite poem/story reference, as joined from library_posts (raw). */
export interface FavoriteRef {
  id: string;
  title: string;
  type: string;
  status: string;
}

export type Visibility = 'everyone' | 'friends' | 'nobody';
export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self';

export interface SearchHit {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface PublicProfile {
  userId: string;
  username: string;
  displayName: string | null;
  friendStatus: FriendStatus;
  /** true when privacy hides the details (still shows identity to allow a request). */
  private: boolean;
  bio?: string | null;
  /** Stored R2/S3 object key; the route resolves it to a public URL and omits it. */
  profilePhotoKey?: string | null;
  /** Raw cosmetic references; the route resolves them to URLs and omits the raw fields. */
  selectedAvatarKey?: string | null;
  premiumUntil?: Date | null;
  background?: EquippedItem | null;
  icon?: EquippedItem | null;
  favoritePoem?: FavoriteRef | null;
  favoriteStory?: FavoriteRef | null;
  xp?: number;
  streak?: number;
  tier?: string;
  rating?: number;
  achievements?: number;
}

const MIN_QUERY = 2;

/** Fold the search form the same way the folded username index does (KUR-044). */
function foldForm(input: string): string {
  return foldDiacritics(normalizeKurdish(input)).toLowerCase();
}

/**
 * User search + public profiles (KUR-082). Username prefix search is
 * diacritic-folded (so "se" finds "sê"/"şev") and never surfaces users blocked
 * in either direction or those hidden from search. A profile's detail respects
 * its owner's visibility (everyone / friends / nobody), while identity + the
 * friend-relationship are always enough to send a request.
 */
export class SocialService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly friends: FriendService,
  ) {}

  /** Prefix search by username, excluding self, blocks, and non-searchable users. */
  async search(viewerId: string, query: string, publicUrl: PublicUrl = () => null, limit = 20): Promise<SearchHit[]> {
    const folded = foldForm(query);
    if (folded.length < MIN_QUERY) return [];
    const rows = await this.pool.query<{ id: string; username: string; display_name: string | null; profile_photo_key: string | null; selected_avatar_key: string | null }>(
      `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key FROM users u
        WHERE u.deleted_at IS NULL AND u.id <> $1
          AND u.profile_visibility <> 'nobody'
          AND translate(lower(u.username::text), 'êîûçş', 'eiucs') LIKE $2 || '%'
          AND NOT EXISTS (
            SELECT 1 FROM blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1)
          )
        ORDER BY u.username LIMIT $3`,
      [viewerId, folded, limit],
    );
    return rows.rows.map((r) => ({
      userId: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
    }));
  }

  /** Update the caller's profile visibility. */
  async setVisibility(userId: string, visibility: Visibility): Promise<void> {
    await this.pool.query(`UPDATE users SET profile_visibility = $2 WHERE id = $1`, [userId, visibility]);
  }

  /** A user's public profile, gated by their privacy setting + blocks. */
  async profile(viewerId: string, targetId: string): Promise<PublicProfile> {
    const row = await this.pool.query<{
      username: string;
      display_name: string | null;
      bio: string | null;
      profile_photo_key: string | null;
      selected_avatar_key: string | null;
      premium_until: Date | null;
      xp: number;
      profile_visibility: Visibility;
      streak: number;
      tier: string;
      rating: number;
      achievements: number;
      equipped_background_sku: string | null;
      bg_asset: string | null;
      bg_cat: string | null;
      bg_active: boolean | null;
      bg_premium: boolean | null;
      bg_owned: boolean;
      equipped_icon_sku: string | null;
      ic_asset: string | null;
      ic_cat: string | null;
      ic_active: boolean | null;
      ic_premium: boolean | null;
      ic_owned: boolean;
      fp_title: string | null;
      fp_type: string | null;
      fp_status: string | null;
      fs_title: string | null;
      fs_type: string | null;
      fs_status: string | null;
      favorite_poem_id: string | null;
      favorite_story_id: string | null;
    }>(
      // Single query: profile + stats + equipped cosmetics (with the owner's
      // ownership of each) + favorites. No N+1; the route resolves keys → URLs.
      `SELECT u.username, u.display_name, u.bio, u.profile_photo_key, u.selected_avatar_key,
              u.premium_until, u.xp, u.profile_visibility,
              u.equipped_background_sku, u.equipped_icon_sku,
              u.favorite_poem_id, u.favorite_story_id,
              COALESCE(s.current_streak, 0) AS streak,
              COALESCE(ul.tier, 'bronze') AS tier,
              COALESCE(r.rating, 1000) AS rating,
              (SELECT count(*)::int FROM user_achievements ua WHERE ua.user_id = u.id) AS achievements,
              bg.asset_key AS bg_asset, bg.category AS bg_cat, bg.active AS bg_active,
              bg.premium_only AS bg_premium, (ebg.user_id IS NOT NULL) AS bg_owned,
              ic.asset_key AS ic_asset, ic.category AS ic_cat, ic.active AS ic_active,
              ic.premium_only AS ic_premium, (eic.user_id IS NOT NULL) AS ic_owned,
              fp.title AS fp_title, fp.type AS fp_type, fp.status AS fp_status,
              fs.title AS fs_title, fs.type AS fs_type, fs.status AS fs_status
         FROM users u
         LEFT JOIN user_streaks s ON s.user_id = u.id
         LEFT JOIN user_league ul ON ul.user_id = u.id
         LEFT JOIN player_ratings r ON r.user_id = u.id
         LEFT JOIN shop_items bg ON bg.sku = u.equipped_background_sku
         LEFT JOIN user_entitlements ebg ON ebg.user_id = u.id AND ebg.sku = u.equipped_background_sku
         LEFT JOIN shop_items ic ON ic.sku = u.equipped_icon_sku
         LEFT JOIN user_entitlements eic ON eic.user_id = u.id AND eic.sku = u.equipped_icon_sku
         LEFT JOIN library_posts fp ON fp.id = u.favorite_poem_id
         LEFT JOIN library_posts fs ON fs.id = u.favorite_story_id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [targetId],
    );
    const u = row.rows[0];
    if (!u) throw new AppError('USER_NOT_FOUND', 404, 'no such user');

    const isSelf = viewerId === targetId;
    // a block hides the profile entirely — never reveal the block itself
    if (!isSelf && (await this.friends.areBlocked(viewerId, targetId))) {
      throw new AppError('USER_NOT_FOUND', 404, 'no such user');
    }

    const friendStatus: FriendStatus = isSelf ? 'self' : await this.friends.statusBetween(viewerId, targetId);
    const canSeeDetail =
      isSelf ||
      u.profile_visibility === 'everyone' ||
      (u.profile_visibility === 'friends' && friendStatus === 'friends');

    const base: PublicProfile = {
      userId: targetId,
      username: u.username,
      displayName: u.display_name,
      friendStatus,
      private: !canSeeDetail,
    };
    if (!canSeeDetail) return base;
    const background: EquippedItem | null = u.equipped_background_sku
      ? {
          sku: u.equipped_background_sku,
          assetKey: u.bg_asset,
          category: u.bg_cat ?? '',
          active: u.bg_active ?? false,
          premiumOnly: u.bg_premium ?? false,
          owned: u.bg_owned,
        }
      : null;
    const icon: EquippedItem | null = u.equipped_icon_sku
      ? {
          sku: u.equipped_icon_sku,
          assetKey: u.ic_asset,
          category: u.ic_cat ?? '',
          active: u.ic_active ?? false,
          premiumOnly: u.ic_premium ?? false,
          owned: u.ic_owned,
        }
      : null;
    const favoritePoem: FavoriteRef | null =
      u.favorite_poem_id && u.fp_title != null
        ? { id: u.favorite_poem_id, title: u.fp_title, type: u.fp_type ?? '', status: u.fp_status ?? '' }
        : null;
    const favoriteStory: FavoriteRef | null =
      u.favorite_story_id && u.fs_title != null
        ? { id: u.favorite_story_id, title: u.fs_title, type: u.fs_type ?? '', status: u.fs_status ?? '' }
        : null;
    return {
      ...base,
      bio: u.bio,
      profilePhotoKey: u.profile_photo_key,
      selectedAvatarKey: u.selected_avatar_key,
      premiumUntil: u.premium_until,
      background,
      icon,
      favoritePoem,
      favoriteStory,
      xp: u.xp,
      streak: u.streak,
      tier: u.tier,
      rating: u.rating,
      achievements: u.achievements,
    };
  }
}
