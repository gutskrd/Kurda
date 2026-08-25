import type pg from 'pg';
import { foldDiacritics, normalizeKurdish } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { FriendService } from '../friends/service.js';

export type Visibility = 'everyone' | 'friends' | 'nobody';
export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self';

export interface SearchHit {
  userId: string;
  username: string;
  displayName: string | null;
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
  async search(viewerId: string, query: string, limit = 20): Promise<SearchHit[]> {
    const folded = foldForm(query);
    if (folded.length < MIN_QUERY) return [];
    const rows = await this.pool.query<{ id: string; username: string; display_name: string | null }>(
      `SELECT u.id, u.username, u.display_name FROM users u
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
    return rows.rows.map((r) => ({ userId: r.id, username: r.username, displayName: r.display_name }));
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
      xp: number;
      profile_visibility: Visibility;
      streak: number;
      tier: string;
      rating: number;
      achievements: number;
    }>(
      `SELECT u.username, u.display_name, u.bio, u.profile_photo_key, u.xp, u.profile_visibility,
              COALESCE(s.current_streak, 0) AS streak,
              COALESCE(ul.tier, 'bronze') AS tier,
              COALESCE(r.rating, 1000) AS rating,
              (SELECT count(*)::int FROM user_achievements ua WHERE ua.user_id = u.id) AS achievements
         FROM users u
         LEFT JOIN user_streaks s ON s.user_id = u.id
         LEFT JOIN user_league ul ON ul.user_id = u.id
         LEFT JOIN player_ratings r ON r.user_id = u.id
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
    return {
      ...base,
      bio: u.bio,
      profilePhotoKey: u.profile_photo_key,
      xp: u.xp,
      streak: u.streak,
      tier: u.tier,
      rating: u.rating,
      achievements: u.achievements,
    };
  }
}
