import { useEffect, useSyncExternalStore } from 'react';

/**
 * While a game is played, an invite to another waits as a one-line chip instead of a banner. A game screen calls
 * `useQuietInvites(true)` and the banner asks `useInvitesQuiet()`. A count, so two screens overlapping during a route
 * change do not undo each other.
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
