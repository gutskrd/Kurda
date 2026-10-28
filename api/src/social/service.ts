import type pg from 'pg';
import { foldDiacritics, normalizeKurdish, toLeagueTier, type LeagueTier, type ProfileLeague, type ProfileRank, type ShowcaseBadge } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { FriendService } from '../friends/service.js';
import { resolveAvatarUrl } from '../cosmetics/access.js';
import type { EquippedItem, PublicUrl } from '../cosmetics/access.js';
import { isOnline } from './presence.js';
import { RankService } from '../ranks/service.js';
import { escapeLike } from '../db/like.js';
import { inLeaguesSql } from '../leagues/service.js';
import { profileShowcase } from '../badges/service.js';
import { birthDateRequired, isKnownAdultRow, isMinorRow, notKnownAdultSql, shownToSql, writtenForSql } from '../users/age.js';
import { notBlockedSql } from '../friends/blocked.js';

/** A favorite poem/story reference, as joined from library_posts (raw). */
export interface FavoriteRef {
  id: string;
  title: string;
  type: string;
  status: string;
}

/**
 * Who may read a profile, widest first.
 *
 * 'members' is the meaningful one: signed in, but not necessarily a friend. It
 * exists because the app is readable without an account, so 'everyone' now
 * genuinely means the public web — a wider audience than most people want, and
 * not one they should land in without choosing it.
 */
export const VISIBILITIES = ['everyone', 'members', 'friends', 'nobody'] as const;

export type Visibility = (typeof VISIBILITIES)[number];
export type FriendStatus = 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self';

export interface SearchHit {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** already friends with whoever searched, which is also why they are near the top */
  friend: boolean;
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
  premiumIconEnabled?: boolean;
  country?: string | null;
  favoritePoem?: FavoriteRef | null;
  favoriteStory?: FavoriteRef | null;
  xp?: number;
  streak?: number;
  /**
   * Their league tier key (translated by the apps), or null for someone who
   * has never been in a league or does not take part — never a made-up
   * "bronze". Same as `league?.tier`, kept for the apps that read it.
   */
  tier?: LeagueTier | null;
  league?: ProfileLeague | null;
  /**
   * Their Game Ranks, per game played (contract-4 §U): the tier now — or
   * "Resting" after 28 days without a rated game, to anyone but them — and the
   * best this season and ever. Replaces the frozen all-time `rating`/`rank`.
   */
  ranks?: ProfileRank[];
  /** the season frame they wear around their avatar (a SKU they own), or null */
  frameSku?: string | null;
  /** badges earned (and the legacy tournament win) */
  achievements?: number;
  /** the three badges they chose to show; a minor's only to themselves and friends */
  badges?: ShowcaseBadge[];
  /** presence — only populated for the user themselves or their friends */
  online?: boolean;
}

const MIN_QUERY = 2;
/**
 * The shortest query looked for in the middle of a name. Two letters are found
 * where a name or one of its words starts: inside names they match most of the
 * table, and a trigram index cannot narrow a two-letter piece down.
 */
const MIN_ANYWHERE = 3;
/** The shortest query that is also matched loosely, so a typo still finds someone. */
const MIN_FUZZY = 4;

/** Fold the search form the same way the folded username index does (KUR-044). */
function foldForm(input: string): string {
  return foldDiacritics(normalizeKurdish(input)).toLowerCase();
}

/** A username and a display name as the trigram indexes hold them (1751000203000). */
const FOLDED_USERNAME = `translate(lower(u.username::text), 'êîûçş', 'eiucs')`;
const FOLDED_NAME = `translate(lower(u.display_name), 'êîûçş', 'eiucs')`;

/**
 * User search + public profiles (KUR-082). Username prefix search is
 * diacritic-folded (so "se" finds "sê"/"şev") and never surfaces users blocked
 * in either direction or those hidden from search. A profile's detail respects
 * its owner's visibility (everyone / members / friends / nobody), while identity
 * + the friend-relationship are always enough to send a request.
 *
 * Minors are never found by search, and their profile is never on the public
 * web: 'everyone' is refused when they set it and read as 'members' if an
 * older setting says so. Both are worked out from age at the moment of asking,
 * and both treat an account whose age is not on record yet the same way (see
 * users/age.ts): nobody is taken for an adult before they have said so.
 */
export class SocialService {
  private readonly ranks: Pick<RankService, 'profileRanks'>;

  constructor(
    private readonly pool: pg.Pool,
    private readonly friends: FriendService,
    ranks?: Pick<RankService, 'profileRanks'>,
  ) {
    this.ranks = ranks ?? new RankService(pool);
  }

  /**
   * People by username or display name, excluding self, blocks, and non-searchable users.
   *
   * Found wherever the query sits in a name — "serk" finds "berserker" — and,
   * from four letters, when no name holds it, by the names nearest to it, so a
   * slip of the thumb still finds the person. Diacritics are folded on both
   * sides.
   *
   * Ranked the way a search for a person is meant: the exact username first,
   * then friends whose name matches (the person you are looking for is usually
   * someone you know), then everyone else by how well they match — a name that
   * starts with the query, a word in it that starts with it, the query inside
   * the username, inside the display name — and near misses closest first. One
   * query: the friendship is read in the same pass.
   */
  async search(viewerId: string, query: string, publicUrl: PublicUrl = () => null, limit = 20): Promise<SearchHit[]> {
    const folded = foldForm(query).trim();
    if (folded.length < MIN_QUERY) return [];
    // the query taken literally inside a pattern: usernames hold underscores,
    // and `_` or `%` left as wildcards would list names that do not hold it
    const startsOrWordStarts = `${FOLDED_USERNAME} LIKE $3 || '%' OR ${FOLDED_NAME} LIKE $3 || '%'
            OR ${FOLDED_NAME} LIKE '% ' || $3 || '%' OR ${FOLDED_USERNAME} LIKE '%\\_' || $3 || '%'`;
    const anywhere = `${FOLDED_USERNAME} LIKE '%' || $3 || '%' OR ${FOLDED_NAME} LIKE '%' || $3 || '%'`;
    const nearly = `${FOLDED_USERNAME} % $2 OR $2 <% ${FOLDED_USERNAME} OR ${FOLDED_NAME} % $2 OR $2 <% ${FOLDED_NAME}`;
    const matched = [folded.length >= MIN_ANYWHERE ? anywhere : startsOrWordStarts, ...(folded.length >= MIN_FUZZY ? [nearly] : [])].join(' OR ');
    const rows = await this.pool.query<{
      id: string;
      username: string;
      display_name: string | null;
      profile_photo_key: string | null;
      selected_avatar_key: string | null;
      friend: boolean;
    }>(
      `SELECT * FROM (SELECT hit.*, count(*) FILTER (WHERE tier < 5) OVER () AS holding FROM (
         SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key,
                EXISTS (
                  SELECT 1 FROM friendships f
                   WHERE f.user_lo = LEAST($1::uuid, u.id) AND f.user_hi = GREATEST($1::uuid, u.id) AND f.status = 'accepted'
                ) AS friend,
                CASE
                  WHEN ${FOLDED_USERNAME} = $2 THEN 0
                  WHEN ${FOLDED_USERNAME} LIKE $3 || '%' THEN 1
                  WHEN ${startsOrWordStarts} THEN 2
                  WHEN ${FOLDED_USERNAME} LIKE '%' || $3 || '%' THEN 3
                  WHEN ${FOLDED_NAME} LIKE '%' || $3 || '%' THEN 4
                  ELSE 5
                END AS tier,
                greatest(similarity(${FOLDED_USERNAME}, $2), word_similarity($2, ${FOLDED_USERNAME}),
                         coalesce(similarity(${FOLDED_NAME}, $2), 0), coalesce(word_similarity($2, ${FOLDED_NAME}), 0)) AS closeness
           FROM users u
          WHERE u.deleted_at IS NULL AND u.id <> $1
            AND u.profile_visibility <> 'nobody'
            -- strangers cannot look a minor up (they reach friends another way),
            -- nor anyone whose age is not on record yet
            AND NOT ${notKnownAdultSql('u')}
            AND (${matched})
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
               WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1)
            )
       ) hit) ranked
       -- near misses only when no name holds what was typed: a list that has
       -- the person asked for is not improved by names merely like theirs
       WHERE tier < 5 OR holding = 0
       ORDER BY (tier = 0) DESC, (friend AND tier < 5) DESC, tier, closeness DESC, length(username), username
       LIMIT $4`,
      [viewerId, folded, escapeLike(folded), limit],
    );
    return rows.rows.map((r) => ({
      userId: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: resolveAvatarUrl(r.profile_photo_key, r.selected_avatar_key, publicUrl),
      friend: r.friend,
    }));
  }

  /**
   * Update the caller's profile visibility. A minor's profile cannot be put on
   * the public web, nor can one whose age is not on record yet (that is asked
   * first); every other rung is theirs to choose.
   */
  async setVisibility(userId: string, visibility: Visibility): Promise<void> {
    if (visibility === 'everyone') {
      const age = await this.pool.query<{ birth_year: number | null; birth_month: number | null }>(
        `SELECT birth_year, birth_month FROM users WHERE id = $1`,
        [userId],
      );
      const row = age.rows[0];
      if (row && isMinorRow(row)) {
        throw new AppError('VISIBILITY_NOT_ALLOWED', 403, 'a profile under 18 cannot be public to everyone');
      }
      if (row && !isKnownAdultRow(row)) throw birthDateRequired();
    }
    await this.pool.query(`UPDATE users SET profile_visibility = $2 WHERE id = $1`, [userId, visibility]);
  }

  /** A user's public profile, gated by their privacy setting + blocks. */
  /**
   * Someone's public profile.
   *
   * `viewerId` is null for a signed-out reader. That is not a special case so
   * much as the least-privileged one: no blocks apply, nobody is a friend, and
   * so a profile set to friends-only or nobody shows a stranger exactly what it
   * shows any other non-friend.
   */
  async profile(viewerId: string | null, targetId: string): Promise<PublicProfile> {
    const row = await this.pool.query<{
      username: string;
      display_name: string | null;
      bio: string | null;
      profile_photo_key: string | null;
      selected_avatar_key: string | null;
      last_seen_at: Date | null;
      premium_until: Date | null;
      xp: number;
      profile_visibility: Visibility;
      birth_year: number | null;
      birth_month: number | null;
      streak: number;
      tier: string | null;
      frame_sku: string | null;
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
      premium_icon_enabled: boolean;
      country: string | null;
      fp_title: string | null;
      fp_type: string | null;
      fp_status: string | null;
      fs_title: string | null;
      fs_type: string | null;
      fs_status: string | null;
      favorite_poem_id: string | null;
      favorite_story_id: string | null;
      bg_gifter_id: string | null;
      bg_gifter_name: string | null;
      ic_gifter_id: string | null;
      ic_gifter_name: string | null;
    }>(
      // Single query: profile + stats + equipped cosmetics (with the owner's
      // ownership of each) + favorites. No N+1; the route resolves keys → URLs.
      // Who sent a gift being worn, and whose post is a favourite, are other
      // people showing up on this profile: a minor among them is named to the
      // viewer only as a friend ($2, users/age.ts), or an adult's profile on
      // the public web would be a way to find them. A favourite written by
      // somebody with a block between them and the viewer is not shown either.
      `SELECT u.username, u.display_name, u.bio, u.profile_photo_key, u.selected_avatar_key,
              u.last_seen_at, u.premium_until, u.xp, u.profile_visibility, u.country,
              u.birth_year, u.birth_month,
              u.equipped_background_sku, u.equipped_icon_sku, u.premium_icon_enabled,
              u.favorite_poem_id, u.favorite_story_id,
              COALESCE(s.current_streak, 0) AS streak,
              -- the league tier only while they take part, and only once they have one
              CASE WHEN ${inLeaguesSql('u')} THEN ul.tier END AS tier,
              -- a frame is worn only while owned (a grant taken back takes it off)
              CASE WHEN EXISTS (SELECT 1 FROM user_entitlements ef
                                 WHERE ef.user_id = u.id AND ef.sku = u.equipped_frame_sku)
                   THEN u.equipped_frame_sku END AS frame_sku,
              -- badges earned, and the one old award no badge replaced (the tournament win)
              ((SELECT count(*)::int FROM user_badges ub WHERE ub.user_id = u.id AND ub.tier > 0)
               + (SELECT count(*)::int FROM user_achievements ua
                   WHERE ua.user_id = u.id AND ua.achievement_id = 'tournament-win')) AS achievements,
              bg.asset_key AS bg_asset, bg.category AS bg_cat, bg.active AS bg_active,
              bg.premium_only AS bg_premium, (ebg.user_id IS NOT NULL) AS bg_owned,
              ic.asset_key AS ic_asset, ic.category AS ic_cat, ic.active AS ic_active,
              ic.premium_only AS ic_premium, (eic.user_id IS NOT NULL) AS ic_owned,
              CASE WHEN bgg.shown THEN bgg.id END AS bg_gifter_id,
              CASE WHEN bgg.shown THEN bgg.username END AS bg_gifter_name,
              CASE WHEN icg.shown THEN icg.id END AS ic_gifter_id,
              CASE WHEN icg.shown THEN icg.username END AS ic_gifter_name,
              fp.title AS fp_title, fp.type AS fp_type, fp.status AS fp_status,
              fs.title AS fs_title, fs.type AS fs_type, fs.status AS fs_status
         FROM users u
         LEFT JOIN user_streaks s ON s.user_id = u.id
         LEFT JOIN user_league ul ON ul.user_id = u.id
         LEFT JOIN shop_items bg ON bg.sku = u.equipped_background_sku
         LEFT JOIN user_entitlements ebg ON ebg.user_id = u.id AND ebg.sku = u.equipped_background_sku
         LEFT JOIN shop_items ic ON ic.sku = u.equipped_icon_sku
         LEFT JOIN user_entitlements eic ON eic.user_id = u.id AND eic.sku = u.equipped_icon_sku
         -- who sent each equipped item, when it arrived as a gift. LATERAL with
         -- LIMIT 1 because the same SKU can have been gifted more than once over
         -- time; the latest sender is the one who gave the one being worn.
         LEFT JOIN LATERAL (
           SELECT gu.id, gu.username, ${shownToSql('gu', '$2::uuid')} AS shown
             FROM gifts g
             JOIN users gu ON gu.id = g.from_user_id
            WHERE g.to_user_id = u.id AND g.sku = u.equipped_background_sku
            ORDER BY g.created_at DESC
            LIMIT 1
         ) bgg ON true
         LEFT JOIN LATERAL (
           SELECT gu.id, gu.username, ${shownToSql('gu', '$2::uuid')} AS shown
             FROM gifts g
             JOIN users gu ON gu.id = g.from_user_id
            WHERE g.to_user_id = u.id AND g.sku = u.equipped_icon_sku
            ORDER BY g.created_at DESC
            LIMIT 1
         ) icg ON true
         LEFT JOIN library_posts fp ON fp.id = u.favorite_poem_id AND ${writtenForSql('fp.author_id', '$2::uuid')}
               AND ${notBlockedSql('fp.author_id', '$2::uuid')}
         LEFT JOIN library_posts fs ON fs.id = u.favorite_story_id AND ${writtenForSql('fs.author_id', '$2::uuid')}
               AND ${notBlockedSql('fs.author_id', '$2::uuid')}
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [targetId, viewerId],
    );
    const u = row.rows[0];
    if (!u) throw new AppError('USER_NOT_FOUND', 404, 'no such user');

    const isSelf = viewerId !== null && viewerId === targetId;
    // a block hides the profile entirely — never reveal the block itself
    if (viewerId !== null && !isSelf && (await this.friends.areBlocked(viewerId, targetId))) {
      throw new AppError('USER_NOT_FOUND', 404, 'no such user');
    }

    const friendStatus: FriendStatus =
      isSelf ? 'self' : viewerId === null ? 'none' : await this.friends.statusBetween(viewerId, targetId);
    // an 'everyone' stored before we knew their age is read as 'members' for a
    // minor, or for anyone whose age is not on record yet: never the open web
    const visibility: Visibility =
      u.profile_visibility === 'everyone' && !isKnownAdultRow(u) ? 'members' : u.profile_visibility;
    const canSeeDetail =
      isSelf ||
      visibility === 'everyone' ||
      (visibility === 'members' && viewerId !== null) ||
      (visibility === 'friends' && friendStatus === 'friends');

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
          giftedBy:
            u.bg_gifter_id && u.bg_gifter_name ? { id: u.bg_gifter_id, username: u.bg_gifter_name } : null,
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
          giftedBy:
            u.ic_gifter_id && u.ic_gifter_name ? { id: u.ic_gifter_id, username: u.ic_gifter_name } : null,
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
      premiumIconEnabled: u.premium_icon_enabled,
      country: u.country,
      favoritePoem,
      favoriteStory,
      xp: u.xp,
      streak: u.streak,
      tier: toLeagueTier(u.tier),
      league: toLeagueTier(u.tier) ? { tier: toLeagueTier(u.tier)! } : null,
      ranks: await this.ranks.profileRanks(targetId, isSelf),
      frameSku: u.frame_sku,
      achievements: u.achievements,
      // a minor's showcase only to themselves and their friends
      badges: await profileShowcase(this.pool, targetId, viewerId),
      // presence is private: only the user themselves and their friends see it
      online: isSelf || friendStatus === 'friends' ? isOnline(u.last_seen_at) : undefined,
    };
  }
}
