/**
 * The poem and the story you pin to your profile (KUR profile cosmetics).
 *
 * `ProfileScreen` has rendered both of these since the profile was built, and
 * the phone had no way to set either — so the two slots could only ever be
 * empty, and the code that draws them had never once drawn anything. The
 * endpoints existed; nothing called them.
 *
 * Browsing is not here on purpose: `library/api.ts` already lists published
 * posts by type, which is exactly the list to choose from.
 */
import type { ApiClient } from '../api/client';
import type { ApiResult } from '../api/types';
import type { PostType } from '../library/types';
import type { TranslationKey } from '../i18n/translations';

/**
 * Which slot is being set. This is `PostType` rather than a new union of the
 * same two words: a favourite *is* a library post of that type, and a second
 * spelling of 'poem' | 'story' is a second thing to keep in step.
 */
export type FavoriteKind = PostType;

/** The two slots, in the order a profile shows them. */
export const FAVORITE_KINDS: readonly FavoriteKind[] = ['poem', 'story'];

/** What a slot is called, and what to say when there is nothing to choose from. */
export interface FavoriteCopy {
  /** the slot's heading ("Favorite poem") */
  readonly label: TranslationKey;
  /** shown when the library has nothing published of this type yet */
  readonly empty: TranslationKey;
}

/**
 * One table for both slots.
 *
 * The alternative — `kind === 'poem' ? t('profile.favoritePoem') : …` at each of
 * the several call sites — is how the browser ended up asking the same question
 * in two places, and it puts the key strings somewhere a test cannot reach them.
 */
export function favoriteCopy(kind: FavoriteKind): FavoriteCopy {
  return kind === 'poem'
    ? { label: 'profile.favoritePoem', empty: 'favorites.noPoems' }
    : { label: 'profile.favoriteStory', empty: 'favorites.noStories' };
}

/**
 * Pin a post to the slot.
 *
 * The client sends an id and nothing else. Whether the post exists, is that
 * type, and is published is the server's to decide — `cosmetics/routes.ts`
 * checks all three, and a client that decided would be a client that could be
 * argued with.
 */
export function setFavorite(client: ApiClient, kind: FavoriteKind, postId: string): Promise<ApiResult<unknown>> {
  return client.put(`/me/favorites/${kind}`, { postId });
}

/** Unpin it, leaving the slot empty. */
export function clearFavorite(client: ApiClient, kind: FavoriteKind): Promise<ApiResult<unknown>> {
  return client.delete(`/me/favorites/${kind}`);
}
