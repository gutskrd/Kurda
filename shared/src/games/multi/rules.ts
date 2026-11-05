/**
 * The contract every multiplayer learning game's rules keep, so one engine
 * (api/src/mp) can run them all: the lobby, the seats, the clock, who is
 * waited for, what each player may see and who placed where are the engine's;
 * what a move does is the game's.
 *
 * Rules are pure. They are given the time rather than reading a clock, they
 * draw anything random from the seed they were started with, and they never
 * touch the database: a move that needs a lookup first (a word checked against
 * the dictionary, Hevalo choosing one) is prepared by the game's server module
 * and handed to `apply` already decided. So every rule can be tested as a plain
 * function, and the engine can replay or judge a state on any replica.
 *
 * Hidden information lives in the state and nowhere else. `viewFor` is the
 * only way any of it leaves the server, and it is asked per seat: a secret
 * word, an impostor's identity or a real definition is left out of every view
 * that may not have it. Nothing a player typed and the game refused is ever in
 * another player's view.
 */

/** A seat as the rules know it: who sits there is the engine's business, never the rules'. */
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
  /** every random choice the game makes comes from this */
  seed: string;
}

/** A move the rules took: the new state, and what the mover is told about it. */
export interface Applied<State, Outcome> {
  ok: true;
  state: State;
  outcome: Outcome;
}

/** A move the rules would not take at all (not this seat’s turn, the game moved on): nothing changed. */
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
  /** The first state, when the host starts the game with these seats (in seat order). */
  init(settings: Settings, seats: readonly RulesSeat[], start: RulesStart): State;
  /** A seat's move, prepared by the game's module; a refusal changes nothing. */
  apply(state: State, seat: number, move: Move, now: number): ApplyResult<State, Outcome>;
  /** The seats the game is waiting on now; empty when it waits on nobody. */
  waitingFor(state: State): number[];
  /**
   * Whether a seat may move now. Left out, only the seats waited on may: a
   * game where others may move too without being waited on (guessers while a
   * describer's clock runs) says so here, and only the seats waited on are
   * timed out.
   */
  mayMove?(state: State, seat: number): boolean;
  /**
   * Why these seats cannot start the game as they stand (teams too small, say),
   * as a short reason the apps word; null when they can. Left out, any seats
   * the lobby's player count allows can start.
   */
  startProblem?(seats: readonly RulesSeat[]): string | null;
  /** When the present wait ends by itself (a turn's time running out), epoch ms; null when it never does. */
  dueAt(state: State): number | null;
  /** These seats ran out of time, or are away and are passed over: what follows. */
  timeout(state: State, seats: readonly number[], now: number): State;
  /** A seat left the game after it started, or its player's account closed. */
  drop(state: State, seat: number, now: number): State;
  /** Every person has gone: end it here, as it stands. */
  end(state: State, now: number): State;
  finished(state: State): boolean;
  /** What one seat may see — or, for null, someone not playing (a lobby preview, a finished game read later). */
  viewFor(state: State, seat: number | null): View;
  /** Places once finished, for every seat that was in the game at the start. */
  places(state: State): readonly Placed[];
}
