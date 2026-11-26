import type { LeagueTier, ProfileBadge, ProfileLeague, ProfileWordTag, ShowcaseBadge } from '@kurda/shared';
import type { MediaStorage } from '../media/storage.js';
import { cosmeticArtUrl, resolveCosmetics, levelInfo, type LevelInfo, type ResolvedBackground, type ResolvedIcon } from '../cosmetics/access.js';
import type { PublicProfile } from './service.js';

/** A safe public favorite (only id + title are exposed). */
interface FavoriteDto {
  id: string;
  title: string;
}

/**
 * The public profile as sent to clients: cosmetics resolved to URLs, level derived from XP, favourites reduced to id
 * and title when published. Raw keys and entitlement or premium fields are never serialized.
 */
export interface PublicProfileDto {
  userId: string;
  username: string;
  displayName: string | null;
  friendStatus: string;
  private: boolean;
  bio?: string | null;
  /** The uploaded photo only, null if none, for older clients; newer ones use `avatarUrl`, which also resolves the default avatar. */
  profilePhotoUrl: string | null;
  avatarUrl: string | null;
  country: string | null;
  background: ResolvedBackground | null;
  icon: ResolvedIcon | null;
  premium: boolean;
  /** presence — only present for the user themselves or their friends */
  online?: boolean;
  level?: LevelInfo;
  streak?: number;
  /** league tier key, or null for someone not in the leagues (see `PublicProfile.tier`) */
  tier?: LeagueTier | null;
  league?: ProfileLeague | null;
  /** The frame around the avatar: a season frame or a shop frame; null for none. */
  frameSku?: string | null;
  /** A shop frame's picture to lay round the avatar; null for a season frame, which the apps draw. */
  frameUrl?: string | null;
  /** The word tag worn by the name, while it is owned; null for none. */
  tag?: ProfileWordTag | null;
  achievements?: number;
  badges?: ShowcaseBadge[];
  /** Every badge earned, newest first, for the profile's badge row; held back where the three are. */
  earnedBadges?: ProfileBadge[];
  favoritePoem?: FavoriteDto | null;
  favoriteStory?: FavoriteDto | null;
}

/** Build the public DTO from the raw profile + storage. Pure aside from publicUrl. */
export function toPublicProfileDto(
  profile: PublicProfile,
  storage: MediaStorage | undefined,
  now: Date = new Date(),
): PublicProfileDto {
  const publicUrl = (key: string): string | null => (storage ? storage.publicUrl(key) : null);
  const cosmetics = resolveCosmetics(
    {
      profilePhotoKey: profile.profilePhotoKey ?? null,
      selectedAvatarKey: profile.selectedAvatarKey ?? null,
      premiumUntil: profile.premiumUntil ?? null,
      background: profile.background ?? null,
      icon: profile.icon ?? null,
      premiumIconEnabled: profile.premiumIconEnabled ?? true,
    },
    publicUrl,
    now,
  );

  // favorites are exposed only when the referenced post is published
  const fav = (ref: PublicProfile['favoritePoem']): FavoriteDto | null =>
    ref && ref.status === 'published' ? { id: ref.id, title: ref.title } : null;

  return {
    userId: profile.userId,
    username: profile.username,
    displayName: profile.displayName,
    friendStatus: profile.friendStatus,
    private: profile.private,
    bio: profile.bio,
    profilePhotoUrl: profile.profilePhotoKey ? publicUrl(profile.profilePhotoKey) : null,
    avatarUrl: cosmetics.avatarUrl,
    country: profile.country ?? null,
    background: cosmetics.background,
    icon: cosmetics.icon,
    premium: cosmetics.premium,
    online: profile.online,
    level: profile.xp != null ? levelInfo(profile.xp) : undefined,
    streak: profile.streak,
    tier: profile.tier,
    league: profile.league,
    frameSku: profile.frameSku ?? null,
    frameUrl: profile.frameAssetKey ? cosmeticArtUrl(profile.frameAssetKey, publicUrl) : null,
    tag: profile.tag ?? null,
    achievements: profile.achievements,
    badges: profile.badges,
    earnedBadges: profile.earnedBadges,
    favoritePoem: fav(profile.favoritePoem),
    favoriteStory: fav(profile.favoriteStory),
  };
}
