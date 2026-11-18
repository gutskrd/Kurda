import type { ComposerPost } from './api';

/**
 * "This post was just saved", from the composer to a screen showing it. The post's page loads once (every read counts a
 * view on the server) and reloads when it hears its post was edited.
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
