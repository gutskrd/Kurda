import { useEffect, useSyncExternalStore } from 'react';

/**
 * Hides the invite banner while a game or lesson is being played, where it would cover the timer or the Check
 * button. Invites stay pending, so the banner shows again once the game or lesson is over. A plain counter rather
 * than a context, so a screen opts in with one call wherever it is mounted.
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

/** Call from a game or lesson screen; `active` while a round or the lesson is being played. */
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

/** True while a screen has asked the banner to keep out of the way. */
export function useInvitesQuieted(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
