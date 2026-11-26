import type pg from 'pg';
import {
  KURDISH_TAG_SKU,
  foldDiacritics,
  handleName,
  normalizeKurdish,
  toLeagueTier,
  type LeagueTier,
  type ProfileBadge,
  type ProfileLeague,
  type ProfileWordTag,
  type ShowcaseBadge,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { FriendService } from '../friends/service.js';
import { premiumUntilSql, resolveAvatarUrl } from '../cosmetics/access.js';
import type { EquippedItem, PublicUrl } from '../cosmetics/access.js';
import { isOnline } from './presence.js';
import { escapeLike } from '../db/like.js';
import { inLeaguesSql } from '../leagues/service.js';
import { profileBadges } from '../badges/service.js';
import { birthDateRequired, isKnownAdultRow, isMinorRow, notKnownAdultSql, shownToSql, writtenForSql } from '../users/age.js';
import { notBlockedSql } from '../friends/blocked.js';
import { unseenByOthersSql } from '../users/kind.js';
import { availableSql, accountUnavailable } from '../moderation/availability.js';
import { resolveSections, type SectionVisibility } from './profile-activity.js';

/** A favorite poem/story reference, as joined from library_posts (raw). */
export interface FavoriteRef {
  id: string;
  title: string;
  type: string;
  status: string;
}

/**
 * Who may read a profile, widest first. 'members' means signed in, not necessarily a friend; since the app is readable
 * without an account, 'everyone' means the public web and must be chosen.
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
  /** Their league tier key (translated by the apps), or null when never in a league or not taking part. Same as `league?.tier`, for older apps. */
  tier?: LeagueTier | null;
  league?: ProfileLeague | null;
  /** The frame they wear around their avatar (an owned season or shop frame), or null. */
  frameSku?: string | null;
  /** That frame's picture when it is a shop frame; season frames are drawn by the apps. */
  frameAssetKey?: string | null;
  /** The word tag they wear by their name, while they own it (shared shop-tags.ts). */
  tag?: ProfileWordTag | null;
  /** badges earned (and the legacy tournament win) */
  achievements?: number;
  /** the three badges they chose to show; a minor's only to themselves and friends */
  badges?: ShowcaseBadge[];
  /** every badge they earned, newest first, under the same rule as the three */
  earnedBadges?: ProfileBadge[];
  /** presence — only populated for the user themselves or their friends */
  online?: boolean;
}

const MIN_QUERY = 2;
/**
 * The shortest query searched for inside a name; two letters match only where a name or word starts, since inside
 * names they match most of the table and a trigram index cannot narrow them.
 */
const MIN_ANYWHERE = 3;
/** The shortest query that is also matched loosely, so a typo still finds someone. */
const MIN_FUZZY = 4;

/** Folds the search text the way the folded username index does. */
function foldForm(input: string): string {
  return foldDiacritics(normalizeKurdish(input)).toLowerCase();
}

/** A username and a display name as the trigram indexes hold them (1751000203000). */
const FOLDED_USERNAME = `translate(lower(u.username::text), 'êîûçş', 'eiucs')`;
const FOLDED_NAME = `translate(lower(u.display_name), 'êîûçş', 'eiucs')`;

/**
 * User search and public profiles. Search is diacritic-folded ("se" finds "sê" and "şev") and never shows users
 * blocked either way or hidden from search. Profile detail follows its owner's visibility, while identity and the
 * friend relationship always suffice to send a request. Minors, and accounts with no age on record (users/age.ts),
 * are never found by search or shown on the public web: 'everyone' is refused for them and read as 'members' if set
 * earlier.
 */
export class SocialService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly friends: FriendService,
  ) {}

  /**
   * People by username or display name, excluding self, blocks and unsearchable users. Matches anywhere in a name
   * ("serk" finds "berserker") and, from four letters when no name holds the query, the nearest names, diacritics
   * folded. Ranked for finding a person: the exact username, then matching friends, then everyone else by match quality,
   * near misses closest first. One query, with friendship read in the same pass.
   */
  async search(viewerId: string, query: string, publicUrl: PublicUrl = () => null, limit = 20): Promise<SearchHit[]> {
    // "@hamo." copied from a sentence is a search for hamo (shared/src/username.ts).
    const folded = foldForm(query.trim().startsWith('@') ? handleName(query) : query).trim();
    if (folded.length < MIN_QUERY) return [];
    // The query taken literally in the pattern: usernames hold underscores, and `_` or `%` as wildcards would match too much.
    const startsOrWordStarts = `${FOLDED_USERNAME} LIKE $3 || '%' OR ${FOLDED_NAME} LIKE $3 || '%'
            OR ${FOLDED_NAME} LIKE '% ' || $3 || '%' OR ${FOLDED_USERNAME} LIKE '%\\_' || $3 || '%'`;
    const anywhere = `${FOLDED_USERNAME} LIKE '%' || $3 || '%' OR ${FOLDED_NAME} LIKE '%' || $3 || '%'`;
    // Someone who may be found, with what ranks them; the caller adds how they match.
    const person = `SELECT u.id, u.username, u.display_name, u.profile_photo_key, u.selected_avatar_key,
                u.id IN (SELECT id FROM friends) AS friend,
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
            -- nobody finds a suspended or banned account (moderation/availability.ts)
            AND ${availableSql('u')}
            AND u.profile_visibility <> 'nobody'
            -- strangers cannot look a minor up (they reach friends another way),
            -- nor anyone whose age is not on record yet
            AND NOT ${notKnownAdultSql('u')}
            -- a guest (auth/guest.ts) is nobody's to find until the account is claimed, and a child's profile never is
            AND NOT ${unseenByOthersSql('u')}
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
               WHERE (b.blocker_id = $1 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $1)
            )`;
    // Each kind of near miss is its own index scan, gathered as ids. Tested in one OR, or joined back to the table, the
    // planner takes the similarity tests for nearly free and reads every user.
    const nearly = [`${FOLDED_USERNAME} % $2`, `$2 <% ${FOLDED_USERNAME}`, `${FOLDED_NAME} % $2`, `$2 <% ${FOLDED_NAME}`]
      .map((test) => `SELECT u.id FROM users u WHERE u.deleted_at IS NULL AND ${test}`)
      .join(' UNION ');
    // Near misses only when no name holds what was typed: a list that has the person asked for is not improved by names
    // merely like theirs.
    const nearMisses =
      folded.length >= MIN_FUZZY
        ? `UNION ALL
         ${person}
            AND NOT EXISTS (SELECT 1 FROM held)
            AND u.id = ANY (ARRAY(${nearly}))`
        : '';
    const rows = await this.pool.query<{
      id: string;
      username: string;
      display_name: string | null;
      profile_photo_key: string | null;
      selected_avatar_key: string | null;
      friend: boolean;
    }>(
      `WITH friends AS (
         SELECT CASE WHEN f.user_lo = $1 THEN f.user_hi ELSE f.user_lo END AS id
           FROM friendships f WHERE (f.user_lo = $1 OR f.user_hi = $1) AND f.status = 'accepted'
       ), held AS (
         ${person}
            AND (${folded.length >= MIN_ANYWHERE ? anywhere : startsOrWordStarts})
       )
       SELECT * FROM (
         SELECT * FROM held
         ${nearMisses}
       ) found
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

  /** Updates the caller's profile visibility; a minor's, or one with no age on record, cannot be put on the public web. */
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

  /**
   * Someone's public profile, gated by privacy and blocks. `viewerId` is null for a signed-out reader, the least
   * privileged case: no blocks, no friends, so friends-only and nobody profiles show what any stranger sees. Without
   * `badges` the showcase is left unread, for callers that do not show it.
   */
  async profile(viewerId: string | null, targetId: string, opts: { badges?: boolean } = {}): Promise<PublicProfile> {
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
      guest: boolean;
      unavailable: boolean;
      streak: number;
      tier: string | null;
      frame_sku: string | null;
      frame_asset: string | null;
      tag: ProfileWordTag | null;
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
      // One query for the profile, stats, equipped cosmetics with ownership, and favourites. A gift's sender and a
      // favourite's author are named to the viewer only as allowed for minors (users/age.ts), and favourites across a
      // block are not shown.
      `SELECT u.username, u.display_name, u.bio, u.profile_photo_key, u.selected_avatar_key,
              u.last_seen_at, ${premiumUntilSql('u')} AS premium_until, u.xp, u.profile_visibility, u.country,
              -- a child's profile is answered as a guest's is: nobody's but its own
              u.birth_year, u.birth_month, ${unseenByOthersSql('u')} AS guest, NOT ${availableSql('u')} AS unavailable,
              u.equipped_background_sku, u.equipped_icon_sku, u.premium_icon_enabled,
              u.favorite_poem_id, u.favorite_story_id,
              COALESCE(s.current_streak, 0) AS streak,
              -- the league tier only while they take part, and only once they have one
              CASE WHEN ${inLeaguesSql('u')} THEN ul.tier END AS tier,
              -- a frame is worn only while owned (a grant taken back takes it off)
              CASE WHEN EXISTS (SELECT 1 FROM user_entitlements ef
                                 WHERE ef.user_id = u.id AND ef.sku = u.equipped_frame_sku)
                   THEN u.equipped_frame_sku END AS frame_sku,
              -- and its picture, for a frame from the shop (a season frame has none)
              CASE WHEN EXISTS (SELECT 1 FROM user_entitlements ef
                                 WHERE ef.user_id = u.id AND ef.sku = u.equipped_frame_sku)
                   THEN (SELECT fr.asset_key FROM shop_items fr WHERE fr.sku = u.equipped_frame_sku AND fr.category = 'frame') END AS frame_asset,
              -- the word tag by the name, as a frame: worn only while owned, and never the Kurdish tag, a main tag of its own
              CASE WHEN EXISTS (SELECT 1 FROM user_entitlements et
                                 WHERE et.user_id = u.id AND et.sku = u.equipped_tag_sku)
                   THEN (SELECT jsonb_build_object('sku', tg.sku, 'label', tg.name, 'meaning', tg.description) FROM shop_items tg
                          WHERE tg.sku = u.equipped_tag_sku AND tg.category = 'tag' AND tg.sku <> '${KURDISH_TAG_SKU}') END AS tag,
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
    const found = row.rows[0];
    const isSelf = viewerId !== null && viewerId === targetId;
    const { u, friendStatus, canSeeDetail } = standing(found, viewerId, targetId, await this.statusOf(found, viewerId, targetId));

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
    // a minor's badges only to themselves and their friends
    const shown = opts.badges === false ? undefined : await profileBadges(this.pool, targetId, viewerId);
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
      frameSku: u.frame_sku,
      frameAssetKey: u.frame_asset,
      tag: u.tag,
      achievements: u.achievements,
      badges: shown?.showcase,
      earnedBadges: shown?.earned,
      // presence is private: only the user themselves and their friends see it
      online: isSelf || friendStatus === 'friends' ? isOnline(u.last_seen_at) : undefined,
    };
  }

  /**
   * Whether the viewer may see the detail of someone's profile, by the rules of `profile` and without reading the
   * rest of it, with the sections the owner shows: for the lists a profile leads to (friends, posts, tags).
   */
  async access(viewerId: string | null, targetId: string): Promise<{ private: boolean; sections: SectionVisibility }> {
    const row = await this.pool.query<GateRow & { profile_sections: unknown }>(
      `SELECT profile_visibility, birth_year, birth_month, ${unseenByOthersSql('users')} AS guest, NOT ${availableSql('users')} AS unavailable, profile_sections
         FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [targetId],
    );
    const found = row.rows[0];
    const { u, canSeeDetail } = standing(found, viewerId, targetId, await this.statusOf(found, viewerId, targetId));
    return { private: !canSeeDetail, sections: resolveSections(u.profile_sections) };
  }

  /** Where the viewer stands with a profile's owner, read only when it decides anything: someone else's live account, signed in. */
  private async statusOf(u: GateRow | undefined, viewerId: string | null, targetId: string): Promise<FriendStatus | null> {
    if (!u || u.guest || viewerId === null || viewerId === targetId) return null;
    return this.friends.statusBetween(viewerId, targetId);
  }
}

/** What deciding whether a profile shows takes from its owner's row. */
interface GateRow {
  profile_visibility: Visibility;
  birth_year: number | null;
  birth_month: number | null;
  guest: boolean;
  /** suspended or banned now (moderation/availability.ts) */
  unavailable: boolean;
}

/**
 * Where the viewer stands with a profile and whether its detail shows them; `status` is null for one's own profile or a
 * signed-out reader. A missing account, a guest's (to anyone but its owner) and one a block stands across are all
 * "no such user", so neither a block nor a guest is revealed; a suspended or banned one is 404 ACCOUNT_UNAVAILABLE.
 */
function standing<Row extends GateRow>(
  u: Row | undefined,
  viewerId: string | null,
  targetId: string,
  status: FriendStatus | null,
): { u: Row; friendStatus: FriendStatus; canSeeDetail: boolean } {
  if (!u) throw new AppError('USER_NOT_FOUND', 404, 'no such user');
  const isSelf = viewerId !== null && viewerId === targetId;
  if (u.guest && !isSelf) throw new AppError('USER_NOT_FOUND', 404, 'no such user');
  // a suspended or banned account's profile says only that it isn't available, to everyone, whatever its content
  if (u.unavailable && !isSelf) throw accountUnavailable(404);
  const friendStatus: FriendStatus = isSelf ? 'self' : (status ?? 'none');
  if (friendStatus === 'blocked') throw new AppError('USER_NOT_FOUND', 404, 'no such user');
  // An 'everyone' stored before their age was known reads as 'members' for a minor or unknown age.
  const visibility: Visibility = u.profile_visibility === 'everyone' && !isKnownAdultRow(u) ? 'members' : u.profile_visibility;
  const canSeeDetail =
    isSelf ||
    visibility === 'everyone' ||
    (visibility === 'members' && viewerId !== null) ||
    (visibility === 'friends' && friendStatus === 'friends');
  return { u, friendStatus, canSeeDetail };
}
