import { useSyncExternalStore } from 'react';

/**
 * "A game just finished" — the one call every game's results make.
 *
 * The rating box comes once per account, after the first game somebody
 * finishes, whatever the game; the native store prompt comes (rarely) after a
 * game won or a personal best. Both are decided in one place
 * (`GameFeedbackHost`), so a game says only what happened:
 *
 *   reportGameFinished({ moment: won ? 'won' : 'other' });
 *
 * Call it on the transition into finished — when the answer that ended the game
 * comes back — never when a finished game is merely shown again (a daily Wordle
 * reopened, a battle opened from an old link). Pass `gaveUp` when the player
 * gave up: neither the box nor the store prompt follows that.
 *
 * A game that starts again on the same screen (Race again, a new word) calls
 * `leftResults()` as it does, so the box does not sit over the next game.
 * Going to another screen needs nothing: the host sees that itself.
 *
 * The box sits over the bottom of the results. A results screen that scrolls
 * adds `useRatingBoxInset()` to the space under its last card, so all of it
 * can be scrolled clear of the box (0 while there is no box).
 */
export interface GameFinish {
  /** 'won' or 'personal_best' make a natural moment for the store prompt; anything else is 'other' */
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

/** For the host: hear that the results were left. Returns how to stop. */
export function onResultsLeft(l: () => void): () => void {
  leaveListener = l;
  return () => {
    if (leaveListener === l) leaveListener = null;
  };
}

let boxInset = 0;
const insetListeners = new Set<() => void>();

/** For the host: how much of the bottom of the screen the box covers now. */
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
