import { useEffect, useSyncExternalStore } from 'react';

/**
 * While a game is being played, the invite banner keeps out of the way.
 *
 * A player twenty seconds into a thirty-second question needs the timer and
 * the Story button the banner would sit over, and an invite can wait: it
 * stays pending for its whole life and shows again the moment the game is
 * over. A plain counter rather than a context, so a game screen marks itself
 * with one call wherever it is mounted.
 */
let holders = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = (): boolean => holders > 0;

/** Call from a game screen: `active` while a round is being played. */
export function useQuietInvites(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    holders += 1;
    emit();
    return () => {
      holders -= 1;
      emit();
    };
  }, [active]);
}

/** True while some game on screen asked the banner to keep out of the way. */
export function useInvitesQuieted(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
