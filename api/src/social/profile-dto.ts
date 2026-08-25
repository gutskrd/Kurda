import type { MediaStorage } from '../media/storage.js';
import { resolveCosmetics, levelInfo, type LevelInfo, type ResolvedBackground, type ResolvedIcon } from '../cosmetics/access.js';
import type { PublicProfile } from './service.js';

/** A safe public favorite (only id + title are exposed). */
interface FavoriteDto {
  id: string;
  title: string;
}

/**
 * The public profile as sent to clients: cosmetics resolved to URLs, level
 * derived from XP, favorites reduced to id+title (and only when published).
 * Raw keys (photo key, avatar key, equipped SKUs, premium_until, entitlement
 * flags) are intentionally dropped — never serialized to clients.
 */
export interface PublicProfileDto {
  userId: string;
  username: string;
  displayName: string | null;
  friendStatus: string;
  private: boolean;
  bio?: string | null;
  /** Uploaded photo only (null if none) — kept for backward compatibility; new
   *  clients should prefer `avatarUrl`, which also resolves the default avatar. */
  profilePhotoUrl: string | null;
  avatarUrl: string | null;
  background: ResolvedBackground | null;
  icon: ResolvedIcon | null;
  premium: boolean;
  level?: LevelInfo;
  streak?: number;
  tier?: string;
  rating?: number;
  achievements?: number;
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
    background: cosmetics.background,
    icon: cosmetics.icon,
    premium: cosmetics.premium,
    level: profile.xp != null ? levelInfo(profile.xp) : undefined,
    streak: profile.streak,
    tier: profile.tier,
    rating: profile.rating,
    achievements: profile.achievements,
    favoritePoem: fav(profile.favoritePoem),
    favoriteStory: fav(profile.favoriteStory),
  };
}
