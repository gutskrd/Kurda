import type { FeedItem } from '../feed/types';

/**
 * "This post is gone" — from wherever it was deleted to every list showing it.
 *
 * A post can be deleted from its own page, which sits on top of the list it
 * was opened from: the wall, Saved, a profile, the library or the pictures.
 * Most of those load again when they come back into view, but the card would
 * still be there for the moment that takes, and a profile does not reload at
 * all. Each list drops the card as soon as it hears instead (the same way
 * postSaved.ts tells a post's page about an edit).
 */
export type DeletedPost = Pick<FeedItem, 'targetType' | 'id'>;

type Listener = (post: DeletedPost) => void;

const listeners = new Set<Listener>();

export function postDeleted(post: DeletedPost): void {
  for (const l of listeners) l(post);
}

/**
 * Whether a card shows the deleted post. By table and id, not by the card's
 * key: a repost of it is a card with a key of its own and the same post in it.
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
