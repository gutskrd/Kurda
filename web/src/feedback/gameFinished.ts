import { useEffect, useRef } from 'react';

/**
 * "A game just finished" — the one signal the rating box listens for.
 *
 * Every game's results screen says it in one line, and the box (FeedbackHost,
 * mounted once in the app shell) decides whether to come up: after the
 * player's first finished game, once per account, never for a game given up.
 * The games know nothing about the box, and the box nothing about the games.
 *
 * It has to be said on the transition into finished, not whenever a finished
 * screen is on view: a daily Wordle opened again after it was played, or a
 * battle's results opened from a link, is not a game just finished
 * (map3-rating §2). `useGameFinished` keeps that rule for a game whose state
 * arrives from the server; a game that knows the moment itself (the race's
 * finish answer) calls `reportGameFinished` there.
 */

/** Every game a player can finish. */
export type FinishedGameKind = 'wordle' | 'wordle-battle' | 'rhyme' | 'rhyme-match' | 'race' | 'stories';

export interface GameFinished {
  game: FinishedGameKind;
  /** the player gave the game up rather than finished it: no rating box */
  gaveUp?: boolean;
}

type Listener = (event: GameFinished) => void;
const listeners = new Set<Listener>();

/** Say that a game has just finished, on its results screen. */
export function reportGameFinished(event: GameFinished): void {
  for (const l of [...listeners]) l(event);
}

/** Hear every game that finishes from now on; returns the way to stop. */
export function onGameFinished(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Report a game whose state comes from the server, once, when it goes from
 * unfinished to finished while on screen.
 *
 * `round` names the game being looked at (its id): a different one starts the
 * watch again, and one already finished the first time it is seen is never
 * reported — that is a finished game reopened.
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
      return;
    }
    if (!finished) {
      s.playing = true;
      return;
    }
    if (s.playing && !s.reported) {
      s.reported = true;
      reportGameFinished({ game, gaveUp });
    }
  }, [game, round, finished, gaveUp]);
}
