import { useSyncExternalStore } from 'react';

/**
 * "A game just finished": the one call every game's results make. The rating box comes once per account, after
 * the first finished game; the store prompt comes rarely, after a win or personal best. `GameFeedbackHost`
 * decides both, so a game only reports what happened:
 *
 *   reportGameFinished({ moment: won ? 'won' : 'other' });
 *
 * Call it on entering the finished state, when the answer that ended the game returns, never when a finished game
 * is merely shown again. Pass `gaveUp` when the player gave up; neither follows that. A game restarting on the
 * same screen calls `leftResults()` so the box does not sit over the next game; navigating away needs nothing.
 *
 * The box covers the bottom of the results, so a scrolling results screen adds `useRatingBoxInset()` below its
 * last card (0 when there is no box).
 */
export interface GameFinish {
  /** 'won' or 'personal_best' make a natural moment for the store prompt; anything else is 'other'. */
  moment: 'won' | 'personal_best' | 'other';
  gaveUp?: boolean;
}

type Listener = (finish: GameFinish) => void;

let listener: Listener | null = null;

export function reportGameFinished(finish: GameFinish): void {
  listener?.(finish);
}

/** For the host: hear about finished games. Returns how to stop. */
export function onGameFinished(l: Listener): () => void {
  listener = l;
  return () => {
    if (listener === l) listener = null;
  };
}

let leaveListener: (() => void) | null = null;

/** The results on this screen are gone: a new game started in their place. */
export function leftResults(): void {
  leaveListener?.();
}

/** For the host: subscribe to leaving the results. Returns an unsubscribe function. */
export function onResultsLeft(l: () => void): () => void {
  leaveListener = l;
  return () => {
    if (leaveListener === l) leaveListener = null;
  };
}

let boxInset = 0;
const insetListeners = new Set<() => void>();

/** For the host: how much of the screen's bottom the box covers now. */
export function setRatingBoxInset(height: number): void {
  if (height === boxInset) return;
  boxInset = height;
  for (const l of insetListeners) l();
}

/** How much room to leave under the results so they scroll clear of the box. */
export function useRatingBoxInset(): number {
  return useSyncExternalStore(
    (l) => {
      insetListeners.add(l);
      return () => insetListeners.delete(l);
    },
    () => boxInset,
    () => 0,
  );
}
