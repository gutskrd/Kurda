/**
 * The poem and the story you pin to your profile. Browsing is in `library/api.ts`, which already lists published posts
 * by type.
 */
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { PostType } from '../library/types';
import type { TranslationKey } from '../i18n/translations';

/** `PostType` rather than a new union of the same two words: a favourite is a library post of that type. */
export type FavoriteKind = PostType;

/** The two slots, in the order a profile shows them. */
export const FAVORITE_KINDS: readonly FavoriteKind[] = ['poem', 'story'];

/** What a slot is called, and what to say when there is nothing to choose from. */
export interface FavoriteCopy {
  /** The slot's heading ("Favorite poem"). */
  readonly label: TranslationKey;
  /** Shown when the library has nothing published of this type yet. */
  readonly empty: TranslationKey;
}

/** One table for both slots, so the keys are in one place a test can reach. */
export function favoriteCopy(kind: FavoriteKind): FavoriteCopy {
  return kind === 'poem'
    ? { label: 'profile.favoritePoem', empty: 'favorites.noPoems' }
    : { label: 'profile.favoriteStory', empty: 'favorites.noStories' };
}

/**
 * Pin a post to the slot. The client sends only an id; whether the post exists, is that type and is published is the
 * server's to check (`cosmetics/routes.ts`).
 */
export function setFavorite(client: ApiClient, kind: FavoriteKind, postId: string): Promise<ApiResult<unknown>> {
  return client.put(`/me/favorites/${kind}`, { postId });
}

/** Unpin it, leaving the slot empty. */
export function clearFavorite(client: ApiClient, kind: FavoriteKind): Promise<ApiResult<unknown>> {
  return client.delete(`/me/favorites/${kind}`);
}
