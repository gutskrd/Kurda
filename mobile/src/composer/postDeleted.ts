import type { FeedItem } from '../feed/types';

/**
 * "This post is gone", from wherever it was deleted to every list showing it. A post's page sits over the list it was
 * opened from, and some lists only reload on focus or not at all, so each list drops the card as soon as it hears (as
 * postSaved.ts tells a post's page about an edit).
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
