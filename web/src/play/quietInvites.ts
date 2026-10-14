import { useEffect, useSyncExternalStore } from 'react';

/**
 * While a game is being played — a story's reading, a question, a word being
 * guessed — an invite to another game waits as a one-line chip instead of a
 * banner, so it never sits over the thing you are answering. A game screen
 * says so with `useQuietInvites(true)`; the banner asks `useInvitesQuiet()`.
 *
 * A count, not a flag: two screens saying it at once (a route changing) do
 * not undo each other.
 */
let holds = 0;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useQuietInvites(on: boolean): void {
  useEffect(() => {
    if (!on) return;
    holds += 1;
    emit();
    return () => {
      holds -= 1;
      emit();
    };
  }, [on]);
}

export function useInvitesQuiet(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => holds > 0,
    () => false,
  );
}
