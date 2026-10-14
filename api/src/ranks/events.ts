import type { PointsTier, RankedGame } from '@kurda/shared';

/**
 * What Game Ranks tells the rest of the API, for the badges (contract-4 §B2:
 * evaluators "triggered by events … game finished … season closed").
 *
 * The badges subscribe in `listenToRanks` (badges/rank-hooks.ts), which
 * `createProgression` calls with the events of the RankService that rates the
 * process's games (app.ts, and the worker's standalone story games).
 *
 * Both are told only after the transaction that did it has committed, so a
 * listener reading the tables sees the game or the season; and each is told
 * once per game / season on the instance that did the work. A listener may be
 * async; a throw or a rejection is logged and never reaches the game. They are
 * prompts to re-evaluate from the tables (`game_ratings`, `rating_events`,
 * `rank_season_results`, `rated_leaves`), not a ledger: an evaluator must stay
 * idempotent and must not count events.
 */

/** One player of a rated game that has just been applied. */
export interface RatedPlayerOutcome {
  userId: string;
  place: number;
  won: boolean;
  /** left the game after it started (counted as last place) */
  left: boolean;
  pointsBefore: number;
  pointsAfter: number;
  /** null while placing */
  tierBefore: PointsTier | null;
  tierAfter: PointsTier | null;
  /** rated games in this game, ever and this season, after this one */
  ratedGames: number;
  seasonGames: number;
  /** placement just finished with this game */
  placedNow: boolean;
  /** how many tiers above them the strongest opponent they finished ahead of was (secret badge "Kewê çiyê") */
  beatTierGap: number;
}

export interface RatedGameFinished {
  game: RankedGame;
  gameRef: string;
  seasonId: string;
  at: Date;
  players: RatedPlayerOutcome[];
}

export interface SeasonClosed {
  /** e.g. '2026-Q3': its results are in `rank_season_results`, its rewards in `rank_season_rewards` */
  seasonId: string;
  /** the season that began (σ raised, season counters reset) */
  nextSeasonId: string;
  at: Date;
}

type Listener<E> = (event: E) => void | Promise<void>;

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

export class RankEvents {
  private readonly finished: Listener<RatedGameFinished>[] = [];
  private readonly closed: Listener<SeasonClosed>[] = [];

  constructor(private readonly log: Log = { warn: () => undefined }) {}

  /** Every rated game, once its ratings are written. Returns a function that stops listening. */
  onRatedGameFinished(listener: Listener<RatedGameFinished>): () => void {
    this.finished.push(listener);
    return () => this.finished.splice(this.finished.indexOf(listener) >>> 0, 1);
  }

  /** Every season, once it is closed and its rewards are handed out. Returns a function that stops listening. */
  onSeasonClosed(listener: Listener<SeasonClosed>): () => void {
    this.closed.push(listener);
    return () => this.closed.splice(this.closed.indexOf(listener) >>> 0, 1);
  }

  emitRatedGameFinished(event: RatedGameFinished): void {
    this.emit(this.finished, event, 'a rated-game listener failed');
  }

  emitSeasonClosed(event: SeasonClosed): void {
    this.emit(this.closed, event, 'a season-closed listener failed');
  }

  private emit<E>(listeners: Listener<E>[], event: E, msg: string): void {
    for (const listener of [...listeners]) {
      try {
        void Promise.resolve(listener(event)).catch((err: unknown) => this.log.warn({ err }, msg));
      } catch (err) {
        this.log.warn({ err }, msg);
      }
    }
  }
}
