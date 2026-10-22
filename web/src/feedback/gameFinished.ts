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
 * screen is on view: a daily Peyvok opened again after it was played, or a
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
  /**
   * These results already ask the player something else (the race's keyboard
   * guide, say): no rating box on top of it — the next finished game asks.
   */
  deferred?: boolean;
}

type Listener = (event: GameFinished) => void;
const listeners = new Set<Listener>();
const startListeners = new Set<() => void>();

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
 * Say that a new round has begun — "Race again", Peyvok's "Play again", the
 * next Rhyme round. They stay on the same page, so without this a rating box
 * still on its way from the last results would rise over the new game, and on
 * a phone over the soft keyboard and the text being typed.
 */
export function reportGameStarted(): void {
  for (const l of [...startListeners]) l();
}

/** Hear every round that begins from now on; returns the way to stop. */
export function onGameStarted(listener: () => void): () => void {
  startListeners.add(listener);
  return () => {
    startListeners.delete(listener);
  };
}

/**
 * Report a game whose state comes from the server, once, when it goes from
 * unfinished to finished while on screen.
 *
 * `round` names the game being looked at (its id): a different one starts the
 * watch again, and one already finished the first time it is seen is never
 * reported — that is a finished game reopened. A round seen unfinished is
 * reported as begun.
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
      // a new round on screen, still to be played, has begun
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
