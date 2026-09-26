/**
 * What `/me` and `/users/:id` say about a profile beyond its name.
 *
 * The same shapes the browser declares in `web/src/lib/types.ts` — both read
 * the same two endpoints, so the two declarations are of one thing and are
 * written the same way on purpose. Everything is optional because an older
 * response, or one hidden by somebody's privacy setting, is still a valid one.
 */

/** Whoever gave you what you are wearing. */
export interface Gifter {
  userId: string;
  username: string;
}

export interface ProfileBackground {
  sku: string;
  assetKey: string;
  type: 'image' | 'gif' | 'video';
  url: string;
  giftedBy?: Gifter | null;
}

export interface ProfileIcon {
  sku: string;
  assetKey: string;
  url: string;
  giftedBy?: Gifter | null;
}

/** Derived server-side from XP with the one shared formula, so the two apps agree. */
export interface LevelInfo {
  xp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progress: number;
}

/** A favourite poem or story, as exposed publicly: an id and a title. */
export interface FavoriteRef {
  id: string;
  title: string;
}

/** The cosmetic and progression fields shared by `/me` and `/users/:id`. */
export interface ProfileCosmetics {
  avatarUrl?: string | null;
  background?: ProfileBackground | null;
  icon?: ProfileIcon | null;
  level?: LevelInfo;
  premium?: boolean;
  /** Presence — only sent for yourself or a friend. */
  online?: boolean;
  favoritePoem?: FavoriteRef | null;
  favoriteStory?: FavoriteRef | null;
  /** ISO-3166 alpha-2, or `KU`, which is ours rather than ISO's. */
  country?: string | null;
}
