import type { MultiGame } from '@kurda/shared';
import { useEffect, useRef } from 'react';

/**
 * "A game just finished", the signal the rating box (FeedbackHost) listens for; games and box know nothing of each
 * other. It must fire on the transition into finished, not whenever a finished screen shows, so a reopened daily
 * Peyvok or a battle's results opened from a link do not count. `useGameFinished` applies that rule for games whose
 * state comes from the server; others call `reportGameFinished` at the moment they finish.
 */

/** Every game a player can finish. */
type FinishedGameKind = 'wordle' | 'wordle-battle' | 'rhyme' | 'rhyme-match' | 'race' | 'stories' | MultiGame;

export interface GameFinished {
  game: FinishedGameKind;
  /** The player gave up rather than finished, so no rating box. */
  gaveUp?: boolean;
  /** These results already ask something else, such as the race's keyboard guide, so the next finished game asks. */
  deferred?: boolean;
}

type Listener = (event: GameFinished) => void;
const listeners = new Set<Listener>();
const startListeners = new Set<() => void>();

/** Reports that a game has just finished, from its results screen. */
export function reportGameFinished(event: GameFinished): void {
  for (const l of [...listeners]) l(event);
}

/** Listens for every game that finishes from now on; returns an unsubscribe function. */
export function onGameFinished(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reports that a new round began on the same page, such as "Race again", so a rating box pending from the last
 * results does not rise over the new game.
 */
export function reportGameStarted(): void {
  for (const l of [...startListeners]) l();
}

/** Listens for every round that begins from now on; returns an unsubscribe function. */
export function onGameStarted(listener: () => void): () => void {
  startListeners.add(listener);
  return () => {
    startListeners.delete(listener);
  };
}

/**
 * Reports a server-driven game once, when it goes from unfinished to finished on screen. `round` is the game's id; a
 * round already finished when first seen is never reported, and one seen unfinished is reported as begun.
 */
export function useGameFinished(game: FinishedGameKind, round: string | null, finished: boolean, gaveUp = false): void {
  const seen = useRef<{ round: string | null; playing: boolean; reported: boolean }>({
    round: null,
    playing: false,
    reported: false,
  });
  useEffect(() => {
    if (round === null) return;
    const s = seen.current;
    if (s.round !== round) {
      seen.current = { round, playing: !finished, reported: false };
      // A new round on screen, still to be played, has begun.
      if (!finished) reportGameStarted();
      return;
    }
    if (!finished) {
      if (!s.playing) reportGameStarted();
      s.playing = true;
      return;
    }
    if (s.playing && !s.reported) {
      s.reported = true;
      reportGameFinished({ game, gaveUp });
    }
  }, [game, round, finished, gaveUp]);
}
