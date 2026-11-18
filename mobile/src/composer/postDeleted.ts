import { useCallback } from 'react';
import { createHiddenSet } from '../api/optimistic';
import type { FeedItem } from '../feed/types';

/**
 * "This post is gone", from wherever it was deleted to every list showing it. A post's page sits over the list it was
 * opened from, and some lists only reload on focus or not at all, so each list drops the card as soon as it hears (as
 * postSaved.ts tells a post's page about an edit). While the delete is on its way the lists leave it out as they draw
 * (`useDeleting`), so a refused one returns in its place.
 */
export type DeletedPost = Pick<FeedItem, 'targetType' | 'id'>;

type Listener = (post: DeletedPost) => void;

const listeners = new Set<Listener>();

export function postDeleted(post: DeletedPost): void {
  for (const l of listeners) l(post);
}

/**
 * Whether a card shows the deleted post. By table and id, not the card's key: a repost is a card with its own key and
 * the same post.
 */
export function samePost(item: DeletedPost, gone: DeletedPost): boolean {
  return item.targetType === gone.targetType && item.id === gone.id;
}

/** Hear about deleted posts. Returns how to stop. */
export function onPostDeleted(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// Posts being deleted from this phone: every list leaves them out at once and shows them again if the delete is refused.
const deleting = createHiddenSet();
const keyOf = (post: DeletedPost): string => `${post.targetType}:${post.id}`;

export function hideDeleting(post: DeletedPost): void {
  deleting.hide(keyOf(post));
}

export function unhideDeleting(post: DeletedPost): void {
  deleting.unhide(keyOf(post));
}

/** Whether a list should leave a post out as it draws, its delete being on its way. */
export function useDeleting(): (post: DeletedPost) => boolean {
  const hidden = deleting.useHidden();
  return useCallback((post: DeletedPost) => hidden.has(keyOf(post)), [hidden]);
}
