import { useEffect, useSyncExternalStore } from 'react';

/**
 * While a game is being played, or a lesson, the invite banner keeps out of
 * the way.
 *
 * A player twenty seconds into a thirty-second question needs the timer and
 * the Story button the banner would sit over; a learner in a lesson needs the
 * Check button it would sit over, and the quiet to think. An invite can wait:
 * it stays pending for its whole life and shows again the moment the game or
 * the lesson (results and all) is over. A plain counter rather than a
 * context, so a screen marks itself with one call wherever it is mounted.
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

/** Call from a game or lesson screen: `active` while a round, or the lesson, is being played. */
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
