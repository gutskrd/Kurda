import type { ComposerPost } from './api';

/**
 * "This post was just saved" — from the composer to a screen showing it.
 *
 * The post's own page loads once, when it opens; reloading every time it
 * came back into focus counted a view each time (the API counts one per
 * read). It reloads when it hears that its post was edited instead.
 */
type Listener = (post: ComposerPost) => void;

const listeners = new Set<Listener>();

export function postSaved(post: ComposerPost): void {
  for (const l of listeners) l(post);
}

/** Hear about saved posts. Returns how to stop. */
export function onPostSaved(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
