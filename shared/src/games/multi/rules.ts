/**
 * The contract every multiplayer learning game's rules keep, so one engine (api/src/mp) runs them all. The engine owns
 * the lobby, seats, clock, waiting, views and places; the game decides what a move does.
 *
 * Rules are pure: they are given the time, draw randomness from their seed and never touch the database. A move that
 * needs a lookup (a dictionary check, Hevalo's choice) is decided by the game's server module before `apply`, so rules
 * test as plain functions and any replica can replay a state.
 *
 * Hidden information lives only in the state and leaves the server only through `viewFor`, per seat. Nothing a player
 * typed and the game refused ever reaches another player's view.
 */

/** A seat as the rules know it; who sits there is the engine's business. */
export interface RulesSeat {
  seat: number;
  /** the team this seat plays for, in a team game; null otherwise */
  team: number | null;
  /** a computer player ('hevalo'), or null for a person */
  bot: string | null;
}

/** What starting a game hands the rules. */
export interface RulesStart {
  /** the server's clock at the start, epoch milliseconds */
  now: number;
  /** the source of every random choice the game makes */
  seed: string;
}

/** A move the rules took: the new state, and what the mover is told about it. */
export interface Applied<State, Outcome> {
  ok: true;
  state: State;
  outcome: Outcome;
}

/** A move the rules would not take at all, such as out of turn: nothing changed. */
export interface Refused {
  ok: false;
  reason: string;
}

export type ApplyResult<State, Outcome> = Applied<State, Outcome> | Refused;

/** One seat's place at the end: 1 is first, equal places tie (1, 1, 3). */
export interface Placed {
  seat: number;
  place: number;
  score: number;
}

export interface GameRules<State, Move, Settings, View, Outcome = unknown> {
  /** The first state, for these seats in seat order. */
  init(settings: Settings, seats: readonly RulesSeat[], start: RulesStart): State;
  /** A seat's move, prepared by the game's module; a refusal changes nothing. */
  apply(state: State, seat: number, move: Move, now: number): ApplyResult<State, Outcome>;
  /** The seats the game is waiting on now; empty when it waits on nobody. */
  waitingFor(state: State): number[];
  /**
   * Whether a seat may move now. Left out, only the seats waited on may. A game where others may move without being waited
   * on, such as guessers while a describer's clock runs, says so here; only waited-on seats time out.
   */
  mayMove?(state: State, seat: number): boolean;
  /** Why these seats cannot start (teams too small, say), as a short reason the apps word; null when they can. */
  startProblem?(seats: readonly RulesSeat[]): string | null;
  /**
   * When the present wait ends by itself, in epoch ms, or null. A game waiting on nobody may still have one (a reveal shown
   * for a few seconds); then `timeout` is called with no seats.
   */
  dueAt(state: State): number | null;
  /** These seats ran out of time or are away and passed over. */
  timeout(state: State, seats: readonly number[], now: number): State;
  /** A seat left the game after it started, or its player's account closed. */
  drop(state: State, seat: number, now: number): State;
  /** Every person has gone: end it as it stands. */
  end(state: State, now: number): State;
  finished(state: State): boolean;
  /**
   * Whether a finished game counted, rather than being called off (everyone gone, too few left, the player it turned on
   * gone). One that did not count pays no placement and is not rated. Left out, every finished game counts.
   */
  counted?(state: State): boolean;
  /**
   * What one seat may see, or with null someone not playing. `hidden` are seats whose free text this viewer may not be
   * shown (a block between them, or a minor and a non-friend); a game that takes free text leaves it out.
   */
  viewFor(state: State, seat: number | null, hidden?: readonly number[]): View;
  /** Places once finished, for every seat in the game at the start. */
  places(state: State): readonly Placed[];
}

/** Whether a finished game counted (`counted`); yes for rules that do not say. */
export function gameCounted<State>(rules: Pick<GameRules<State, unknown, unknown, unknown>, 'counted'>, state: State): boolean {
  return rules.counted ? rules.counted(state) : true;
}
