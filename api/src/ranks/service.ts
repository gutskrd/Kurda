import type pg from 'pg';
import {
  FEW_PLAYERS,
  LEAVE_LADDER_HOURS,
  NEW_ACCOUNT_RULE,
  PLACEMENT_GAMES,
  PROVISIONAL_SIGMA,
  RANKED_GAMES,
  REPEAT_WINDOW_HOURS,
  RESTING_DAYS,
  STERK_RULE,
  divisionOf,
  leaveCooldownMinutes,
  pointsOf,
  progressToNext,
  repeatWeight,
  seasonDaysLeft,
  seasonOf,
  tierIndex,
  tierOf,
  type Division,
  type ExpectedGains,
  type FriendlyReason,
  type GameAccess,
  type MyRanks,
  type PointsTier,
  type ProfileRank,
  type RankBoard,
  type RankBoardEntry,
  type RankBoardScope,
  type RankCard,
  type RankReason,
  type RankResult,
  type RankTier,
  type RankedGame,
} from '@kurda/shared';
import { afterCommit } from '../db/after-commit.js';
import { pairEvidence } from '../net/evidence.js';
import { areFriendsSql, notKnownAdultSql } from '../users/age.js';
import { expectedExtremes, expectedVs, freshState, rateGame, seasonReset, weightParts, type PlayerState, type RateOutcome } from './engine.js';
import { RankEvents } from './events.js';
import { isInGame, loadLobby, tablesOf, type LobbySeat } from './games.js';
import {
  fromStored,
  insertEvent,
  lockGameRatings,
  lockStates,
  stateOf,
  writeState,
  type Executor,
  type RatingRow,
  type StoredState,
} from './store.js';

/** What the start decided: it counts ('damped': with less weight), or why it plays as friendly. */
export type RatedDecision = 'rated' | 'damped' | FriendlyReason;

/** One player's standing as the rated-game rules read it. */
interface Eligibility {
  userId: string;
  restricted: boolean;
  verified: boolean;
  hasBirthMonth: boolean;
  cooldownUntil: Date | null;
  newAccount: boolean;
}

/** The judgement on a lobby: what it would be if it started now, and on whom it turns. */
interface Judgement {
  decision: RatedDecision;
  weight: number;
  /** who the friendly reason is about (empty for 'chosen', 'need-two', 'solo') */
  about: string[];
  eligibility: Map<string, Eligibility>;
}

/** The order the reasons are told in when several apply: the most lasting first. */
const ELIGIBILITY_ORDER: Array<[FriendlyReason, (e: Eligibility, at: Date) => boolean]> = [
  ['restricted', (e) => e.restricted],
  ['unverified', (e) => !e.verified],
  ['no-birth-month', (e) => !e.hasBirthMonth],
  ['cooldown', (e, at) => e.cooldownUntil !== null && e.cooldownUntil > at],
];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** An account barred from rated play: closed, banned now, a confirmed bot, or held for a cheat review. */
const RESTRICTED_SQL = (u: string) => `(
  ${u}.deleted_at IS NOT NULL
  OR (${u}.banned_at IS NOT NULL AND (${u}.banned_until IS NULL OR ${u}.banned_until > now()))
  OR EXISTS (SELECT 1 FROM bot_scores b WHERE b.user_id = ${u}.id AND b.status = 'confirmed')
  OR EXISTS (SELECT 1 FROM cheat_reviews c WHERE c.user_id = ${u}.id AND c.shadow_flagged))`;

export interface RankServiceDeps {
  now?: () => Date;
  events?: RankEvents;
  log?: { warn: (obj: unknown, msg: string) => void };
}

/** Where a game was started from, for the host's default choice. */
export interface StartedFrom {
  /** from a direct or group chat */
  fromChat: boolean;
  access: GameAccess;
}

/**
 * Game Ranks (contract-4 §R): Rated or Friendly per game, decided at the
 * start; the rating applied when a rated game finishes, in the game's own
 * transaction; leaving and its cooldown; and every read the apps make — your
 * ranks, a result's reason line, the lobby's expected gains, the boards.
 *
 * The games call in at four moments (each inside their own transaction, with
 * the game row locked): `defaultRated` and `rememberChoice` when a lobby is
 * made or its badge changed, `decideAtStart` when it starts, `recordLeave`
 * when a player leaves a started game, and `finish` when it ends. The maths
 * is engine.ts; the seasons, admin tools and replay are next to this file.
 */
export class RankService {
  readonly events: RankEvents;
  private readonly now: () => Date;

  constructor(
    private readonly pool: pg.Pool,
    deps: RankServiceDeps = {},
  ) {
    this.now = deps.now ?? (() => new Date());
    this.events = deps.events ?? new RankEvents(deps.log);
  }

  clock(): Date {
    return this.now();
  }

  // -------------------------------------------------------------------------
  // the badge: Rated or Friendly

  /**
   * The badge a new lobby gets when the host did not say: their last choice in
   * this game; with none yet, Friendly for a game started from a chat or among
   * friends, Rated for one opened to everyone.
   */
  async defaultRated(db: Executor, hostId: string, game: RankedGame, from: StartedFrom): Promise<boolean> {
    const pref = await db.query<{ rated: boolean }>(`SELECT rated FROM rank_preferences WHERE user_id = $1 AND game = $2`, [
      hostId,
      game,
    ]);
    if (pref.rows[0]) return pref.rows[0].rated;
    return from.access === 'open' && !from.fromChat;
  }

  /** The host chose: remembered for their next game of this kind. */
  async rememberChoice(db: Executor, hostId: string, game: RankedGame, rated: boolean): Promise<void> {
    await db.query(
      `INSERT INTO rank_preferences (user_id, game, rated) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, game) DO UPDATE SET rated = EXCLUDED.rated, updated_at = now()`,
      [hostId, game, rated],
    );
  }

  // -------------------------------------------------------------------------
  // the start

  /**
   * Decide at the start whether a game the host set to Rated counts (R2):
   * two or more players, every one with a confirmed email and a birth month,
   * none restricted or on a leave cooldown, and the same players not past
   * their rated games together for today. A game that counts is recorded,
   * with its players and weight, for its finish. Returns what to store in the
   * game's `rated_state`. Call inside the transaction that starts the game.
   */
  async decideAtStart(
    client: pg.PoolClient,
    game: RankedGame,
    gameRef: string,
    seats: readonly LobbySeat[],
    rated: boolean,
    opts: { solo?: boolean } = {},
  ): Promise<RatedDecision> {
    const at = this.now();
    const j = await this.judge(client, game, gameRef, seats, rated, opts.solo ?? false, at);
    if (j.decision !== 'rated' && j.decision !== 'damped') return j.decision;
    const inserted = await client.query(
      `INSERT INTO rated_games (game, game_ref, season_id, weight, decided_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (game, game_ref) DO NOTHING`,
      [game, gameRef, seasonOf(at).id, j.weight, at],
    );
    if (!inserted.rowCount) return j.decision;
    for (const s of seats) {
      await client.query(
        `INSERT INTO rated_game_players (game, game_ref, user_id, seat, new_account, decided_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [game, gameRef, s.userId, s.seat, j.eligibility.get(s.userId)?.newAccount ?? false, at],
      );
    }
    return j.decision;
  }

  /** The rules of `decideAtStart`, without writing anything. */
  private async judge(
    db: Executor,
    game: RankedGame,
    gameRef: string,
    seats: readonly LobbySeat[],
    rated: boolean,
    solo: boolean,
    at: Date,
  ): Promise<Judgement> {
    const ids = seats.map((s) => s.userId);
    const none = new Map<string, Eligibility>();
    if (!rated) return { decision: 'chosen', weight: 0, about: [], eligibility: none };
    if (solo) return { decision: 'solo', weight: 0, about: [], eligibility: none };
    if (new Set(ids).size < 2) return { decision: 'need-two', weight: 0, about: [], eligibility: none };
    const eligibility = await this.eligibility(db, ids, at);
    for (const [reason, fails] of ELIGIBILITY_ORDER) {
      const about = ids.filter((id) => {
        const e = eligibility.get(id);
        return !e || fails(e, at);
      });
      if (about.length) return { decision: reason, weight: 0, about, eligibility };
    }
    const pairs = await this.pairCounts(db, game, ids, at, gameRef);
    const weight = Math.min(1, ...[...pairs.values()].map((n) => repeatWeight(n + 1)));
    if (weight <= 0) {
      const about = [...pairs.entries()].filter(([, n]) => repeatWeight(n + 1) <= 0).flatMap(([k]) => k.split(':'));
      return { decision: 'repeat-opponent', weight: 0, about, eligibility };
    }
    return { decision: weight < 1 ? 'damped' : 'rated', weight, about: [], eligibility };
  }

  private async eligibility(db: Executor, userIds: readonly string[], at: Date): Promise<Map<string, Eligibility>> {
    const rows = await db.query<{
      id: string;
      restricted: boolean;
      verified: boolean;
      has_birth: boolean;
      cooldown_until: Date | null;
      new_account: boolean;
    }>(
      `SELECT u.id, ${RESTRICTED_SQL('u')} AS restricted,
              u.email_verified_at IS NOT NULL AS verified,
              u.birth_month IS NOT NULL AS has_birth,
              (SELECT max(l.cooldown_until) FROM rated_leaves l WHERE l.user_id = u.id) AS cooldown_until,
              (u.created_at > $2::timestamptz - make_interval(days => $3)
                OR (SELECT count(*) FROM (SELECT 1 FROM xp_ledger x WHERE x.user_id = u.id AND x.amount > 0 LIMIT $4) a) < $4)
                AS new_account
         FROM users u WHERE u.id = ANY($1::uuid[])`,
      [userIds, at, NEW_ACCOUNT_RULE.days, NEW_ACCOUNT_RULE.activities],
    );
    return new Map(
      rows.rows.map((r) => [
        r.id,
        {
          userId: r.id,
          restricted: r.restricted,
          verified: r.verified,
          hasBirthMonth: r.has_birth,
          cooldownUntil: r.cooldown_until,
          newAccount: r.new_account,
        },
      ]),
    );
  }

  /**
   * For each pair of `userIds`, how many rated games of this game they played
   * together in the last 24 h (key `lo:hi`; pairs with none are 0). Voided
   * games, and the game being decided, do not count.
   */
  private async pairCounts(
    db: Executor,
    game: RankedGame,
    userIds: readonly string[],
    at: Date,
    exceptRef: string | null,
  ): Promise<Map<string, number>> {
    const ids = [...new Set(userIds)].sort();
    const out = new Map<string, number>();
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.set(`${ids[i]}:${ids[j]}`, 0);
    const rows = await db.query<{ a: string; b: string; n: number }>(
      `SELECT a.user_id AS a, b.user_id AS b, count(*)::int AS n
         FROM rated_game_players a
         JOIN rated_game_players b ON b.game = a.game AND b.game_ref = a.game_ref AND b.user_id > a.user_id
         JOIN rated_games g ON g.game = a.game AND g.game_ref = a.game_ref
        WHERE a.game = $1 AND a.user_id = ANY($2::uuid[]) AND b.user_id = ANY($2::uuid[])
          AND a.decided_at > $3::timestamptz - make_interval(hours => $4) AND a.decided_at <= $3
          AND g.voided_at IS NULL AND g.game_ref IS DISTINCT FROM $5::uuid
        GROUP BY 1, 2`,
      [game, ids, at, REPEAT_WINDOW_HOURS, exceptRef],
    );
    for (const r of rows.rows) out.set(`${r.a}:${r.b}`, r.n);
    return out;
  }

  // -------------------------------------------------------------------------
  // leaving

  /**
   * A player left a started game. In a game that counts it is last place (at
   * the finish) and a step on the leave ladder (R3): the second leave within
   * 24 h of the one before brings a 10-minute rated cooldown, then 30 minutes,
   * then 2 hours; 24 h without one starts the ladder again. Anything else — a
   * friendly game, a player already finished — is not a leave. Call inside
   * the game's transaction.
   */
  async recordLeave(client: Executor, game: RankedGame, gameRef: string, userId: string): Promise<void> {
    const at = this.now();
    const counted = await client.query(
      `SELECT 1 FROM rated_game_players p JOIN rated_games g ON g.game = p.game AND g.game_ref = p.game_ref
        WHERE p.game = $1 AND p.game_ref = $2 AND p.user_id = $3 AND g.applied_at IS NULL AND g.voided_at IS NULL`,
      [game, gameRef, userId],
    );
    if (!counted.rowCount) return;
    const prev = await client.query<{ step: number; left_at: Date }>(
      `SELECT step, left_at FROM rated_leaves WHERE user_id = $1 ORDER BY left_at DESC, id DESC LIMIT 1`,
      [userId],
    );
    const last = prev.rows[0];
    const step = last && at.getTime() - last.left_at.getTime() < LEAVE_LADDER_HOURS * HOUR ? last.step + 1 : 1;
    const minutes = leaveCooldownMinutes(step);
    await client.query(
      `INSERT INTO rated_leaves (user_id, game, game_ref, step, cooldown_until, left_at) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, game, game_ref) DO NOTHING`,
      [userId, game, gameRef, step, minutes > 0 ? new Date(at.getTime() + minutes * 60_000) : null, at],
    );
  }

  // -------------------------------------------------------------------------
  // the finish

  /**
   * Apply a finished game's ratings, in the transaction that finished it.
   * `places` is the game's own result (1 = first, equal places tie) for
   * everyone still in it; a player who left is last whatever it says, and one
   * the host removed (absent from `places`) is not rated. Does nothing for a
   * game that did not count, or twice. The rest of the API hears of it after
   * the commit (`events`).
   */
  async finish(
    client: pg.PoolClient,
    game: RankedGame,
    gameRef: string,
    places: ReadonlyArray<{ userId: string; place: number }>,
  ): Promise<RateOutcome[] | null> {
    const at = this.now();
    await lockGameRatings(client, game);
    const header = (
      await client.query<{ weight: number; applied_at: Date | null; voided_at: Date | null }>(
        `SELECT weight, applied_at, voided_at FROM rated_games WHERE game = $1 AND game_ref = $2 FOR UPDATE`,
        [game, gameRef],
      )
    ).rows[0];
    if (!header || header.applied_at || header.voided_at) return null;
    const players = await client.query<{ user_id: string; new_account: boolean }>(
      `SELECT user_id, new_account FROM rated_game_players WHERE game = $1 AND game_ref = $2 AND user_id IS NOT NULL`,
      [game, gameRef],
    );
    const left = new Set(
      (
        await client.query<{ user_id: string }>(`SELECT user_id FROM rated_leaves WHERE game = $1 AND game_ref = $2`, [
          game,
          gameRef,
        ])
      ).rows.map((r) => r.user_id),
    );
    const placeOf = new Map(places.map((p) => [p.userId, p.place]));
    const rated = players.rows.filter((p) => placeOf.has(p.user_id) || left.has(p.user_id));
    if (rated.length < 2) {
      await client.query(`UPDATE rated_games SET applied_at = $3, outcome = 'void' WHERE game = $1 AND game_ref = $2`, [
        game,
        gameRef,
        at,
      ]);
      return null;
    }
    const states = await lockStates(
      client,
      game,
      rated.map((p) => p.user_id),
      at,
    );
    const maxPlace = Math.max(1, ...places.map((p) => p.place));
    const outcomes = rateGame({
      entries: rated.map((p) => ({
        userId: p.user_id,
        state: states.get(p.user_id)!,
        place: placeOf.get(p.user_id) ?? maxPlace + 1,
        left: left.has(p.user_id),
        newAccount: p.new_account,
      })),
      weight: Number(header.weight),
      at,
    });
    for (const o of outcomes) {
      await writeState(client, o.userId, game, o.after);
      await insertEvent(client, {
        userId: o.userId,
        game,
        gameRef,
        kind: 'game',
        reason: o.reason,
        before: o.before,
        after: o.after,
        place: o.place,
        weight: o.weight,
      });
      await client.query(
        `UPDATE rated_game_players SET place = $4, left_game = $5, mu_before = $6, sigma_before = $7
          WHERE game = $1 AND game_ref = $2 AND user_id = $3`,
        [game, gameRef, o.userId, o.place, o.left, o.before.mu, o.before.sigma],
      );
    }
    await client.query(
      `UPDATE rated_games SET applied_at = $3, outcome = 'rated', season_id = $4 WHERE game = $1 AND game_ref = $2`,
      [game, gameRef, at, seasonOf(at).id],
    );
    await this.recordPairs(client, game, outcomes, at);

    const event = {
      game,
      gameRef,
      seasonId: seasonOf(at).id,
      at,
      players: outcomes.map((o) => ({
        userId: o.userId,
        place: o.place,
        won: o.won,
        left: o.left,
        pointsBefore: o.pointsBefore,
        pointsAfter: o.pointsAfter,
        tierBefore: o.tierBefore,
        tierAfter: o.tierAfter,
        ratedGames: o.after.ratedGames,
        seasonGames: o.after.seasonGames,
        placedNow: !o.before.placementDone && o.after.placementDone,
        beatTierGap: o.beatTierGap,
      })),
    };
    afterCommit(client, () => this.events.emitRatedGameFinished(event));
    return outcomes;
  }

  /**
   * The signals behind the admin's "suspicious pairs" (R3): games together,
   * who won, the busiest 24 h, and a shared device or network — by the same
   * rules as the moderators' linked accounts (net/evidence.ts), looked up again
   * each time the pair plays, so the flags follow what is true now. Stored,
   * never acted on by themselves.
   */
  private async recordPairs(client: Executor, game: RankedGame, outcomes: readonly RateOutcome[], at: Date): Promise<void> {
    const sorted = [...outcomes].sort((a, b) => (a.userId < b.userId ? -1 : 1));
    const counts = await this.pairCounts(
      client,
      game,
      sorted.map((o) => o.userId),
      at,
      null,
    );
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const lo = sorted[i]!;
        const hi = sorted[j]!;
        // indexed lookups that start from the two accounts' own rows
        const shared = await pairEvidence(client, lo.userId, hi.userId);
        const device = shared.device !== null;
        const network = shared.network !== null;
        const loWin = lo.place < hi.place ? 1 : 0;
        const hiWin = hi.place < lo.place ? 1 : 0;
        await client.query(
          `INSERT INTO rating_pair_signals (game, user_lo, user_hi, games, lo_wins, hi_wins, draws, peak_24h, shared_device, shared_ip, last_game_at)
           VALUES ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (game, user_lo, user_hi) DO UPDATE SET
             games = rating_pair_signals.games + 1,
             lo_wins = rating_pair_signals.lo_wins + EXCLUDED.lo_wins,
             hi_wins = rating_pair_signals.hi_wins + EXCLUDED.hi_wins,
             draws = rating_pair_signals.draws + EXCLUDED.draws,
             peak_24h = GREATEST(rating_pair_signals.peak_24h, EXCLUDED.peak_24h),
             shared_device = EXCLUDED.shared_device,
             shared_ip = EXCLUDED.shared_ip,
             last_game_at = EXCLUDED.last_game_at`,
          [
            game,
            lo.userId,
            hi.userId,
            loWin,
            hiWin,
            1 - loWin - hiWin,
            Math.max(1, counts.get(`${lo.userId}:${hi.userId}`) ?? 1),
            device,
            network,
            at,
          ],
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // reading: your ranks

  /** `GET /ranks/me`: your rank in every game, your cooldown, the season. */
  async myRanks(userId: string): Promise<MyRanks> {
    const at = this.now();
    const ranks: RankCard[] = [];
    for (const game of RANKED_GAMES) ranks.push(await this.card(userId, game));
    const cd = await this.pool.query<{ until: Date | null }>(
      `SELECT max(cooldown_until) AS until FROM rated_leaves WHERE user_id = $1`,
      [userId],
    );
    const until = cd.rows[0]?.until ?? null;
    const season = seasonOf(at);
    return {
      ranks,
      cooldownUntil: until && until > at ? until.toISOString() : null,
      season: { ...season, daysLeft: seasonDaysLeft(season, at) },
    };
  }

  /** Your rank in one game (a fresh one before your first rated game). */
  async card(userId: string, game: RankedGame): Promise<RankCard> {
    const at = this.now();
    const state = await this.currentState(this.pool, userId, game, at);
    const points = pointsOf(state.mu, state.sigma);
    const placing = !state.placementDone;
    const tier: RankTier | null = placing ? null : (await this.isSterk(this.pool, game, state, at)) ? 'sterk' : tierOf(points);
    return {
      game,
      points,
      tier,
      division: tier === null || tier === 'sterk' ? null : divisionOf(points),
      placement: placing ? { played: state.ratedGames, of: PLACEMENT_GAMES } : null,
      provisional: !placing && state.sigma > PROVISIONAL_SIGMA,
      shieldGames: state.shieldGames,
      progress: placing ? null : progressToNext(points),
      ratedGames: state.ratedGames,
      wins: state.wins,
      season: {
        id: state.seasonId,
        ratedGames: state.seasonGames,
        wins: state.seasonWins,
        peakPoints: state.peakPoints,
        peakTier: placing || state.seasonGames === 0 ? null : tierOf(state.peakPoints),
      },
      bestPoints: state.bestPoints,
      resting: isResting(state, at),
      lastRatedAt: state.lastRatedAt ? state.lastRatedAt.toISOString() : null,
    };
  }

  /**
   * A standing as of now, without writing: a fresh one before the first game,
   * and one still in an earlier season as the season job will roll it.
   */
  private async currentState(db: Executor, userId: string, game: RankedGame, at: Date): Promise<PlayerState> {
    const row = (
      await db.query<RatingRow>(`SELECT * FROM game_ratings WHERE user_id = $1 AND game = $2`, [userId, game])
    ).rows[0];
    const seasonId = seasonOf(at).id;
    if (!row) return freshState(seasonId);
    const state = stateOf(row);
    return state.seasonId < seasonId ? seasonReset(state, seasonId) : state;
  }

  /**
   * Stêrk (R4): Lûtke I, 30 rated games, one in the last 14 days, and a place
   * in the top 1% (at least the top 20) of the game's active rated players —
   * judged only once the game has FEW_PLAYERS of them.
   */
  private async isSterk(db: Executor, game: RankedGame, state: PlayerState, at: Date): Promise<boolean> {
    const points = pointsOf(state.mu, state.sigma);
    if (points < STERK_RULE.minPoints || state.ratedGames < STERK_RULE.minGames) return false;
    if (!state.lastRatedAt || at.getTime() - state.lastRatedAt.getTime() > STERK_RULE.activeDays * DAY) return false;
    const standing = await db.query<{ active: number; above: number }>(
      `SELECT count(*)::int AS active, count(*) FILTER (WHERE r.points > $2)::int AS above
         FROM game_ratings r JOIN users u ON u.id = r.user_id
        WHERE r.game = $1 AND r.placement_done AND r.last_rated_at > $3::timestamptz - make_interval(days => $4)
          AND NOT ${RESTRICTED_SQL('u')}`,
      [game, points, at, RESTING_DAYS],
    );
    const { active, above } = standing.rows[0]!;
    if (active < FEW_PLAYERS) return false;
    return above + 1 <= Math.max(STERK_RULE.minTop, Math.ceil(active * STERK_RULE.topShare));
  }

  // -------------------------------------------------------------------------
  // reading: a result

  /**
   * `GET /ranks/results/:game/:ref`: what a finished game did to the
   * viewer's rank and why, in one line. Null when the viewer was not in it
   * (the route answers 404, as for a game that does not exist).
   */
  async result(viewerId: string, game: RankedGame, gameRef: string): Promise<RankResult | null> {
    if (!(await isInGame(this.pool, game, gameRef, viewerId))) return null;
    const ev = (
      await this.pool.query<{
        reason: RankReason;
        weight: number | null;
        damping: number | null;
        voided_at: Date | null;
        state_before: StoredState;
        state_after: StoredState;
      }>(
        // the event keeps the weight this player's change was applied with;
        // the game keeps its repeat-opponent damping, so the two can be told apart
        `SELECT e.reason, e.weight, g.weight AS damping, e.voided_at, e.state_before, e.state_after
           FROM rating_events e
           LEFT JOIN rated_games g ON g.game = e.game AND g.game_ref = e.game_ref
          WHERE e.user_id = $1 AND e.game = $2 AND e.game_ref = $3 AND e.kind = 'game'`,
        [viewerId, game, gameRef],
      )
    ).rows[0];
    if (ev && !ev.voided_at) {
      return countedResult(game, gameRef, fromStored(ev.state_before), fromStored(ev.state_after), ev.reason, ev.weight, ev.damping);
    }
    if (ev) return { game, gameRef, counted: false, friendlyReason: null, voided: true };
    const row = (
      await this.pool.query<{ rated_state: string | null; applied_at: Date | null; voided_at: Date | null; mine: boolean }>(
        `SELECT t.rated_state, g.applied_at, g.voided_at,
                EXISTS (SELECT 1 FROM rated_game_players p WHERE p.game = $1 AND p.game_ref = t.id AND p.user_id = $3) AS mine
           FROM ${tablesOf(game).table} t
           LEFT JOIN rated_games g ON g.game = $1 AND g.game_ref = t.id
          WHERE t.id = $2`,
        [game, gameRef, viewerId],
      )
    ).rows[0];
    if (!row) return null;
    if (row.voided_at) return { game, gameRef, counted: false, friendlyReason: null, voided: true };
    if (row.mine && !row.applied_at) return { game, gameRef, counted: false, friendlyReason: null, pending: true };
    const decided = row.rated_state;
    const friendly = decided === null || decided === 'rated' || decided === 'damped' ? null : (decided as FriendlyReason);
    return { game, gameRef, counted: false, friendlyReason: friendly };
  }

  // -------------------------------------------------------------------------
  // reading: the lobby's expected gains

  /**
   * `GET /ranks/expected/:game/:lobbyId`: the chess.com line in the lobby —
   * per opponent, by seat, roughly what a win and a loss would do to your
   * points, from the ratings as they are now; and whether the game would
   * count if it started now, and if not why ("This game is friendly: …").
   * Members only (null otherwise).
   */
  async expected(viewerId: string, game: RankedGame, lobbyId: string): Promise<ExpectedGains | null> {
    const at = this.now();
    const lobby = await loadLobby(this.pool, game, lobbyId);
    if (!lobby || !lobby.seats.some((s) => s.userId === viewerId)) return null;
    const j = await this.judge(this.pool, game, lobbyId, lobby.seats, lobby.rated, lobby.solo, at);
    const counts = j.decision === 'rated' || j.decision === 'damped';
    // the eligibility is read only when the badge is Rated; the new-account rule still shapes the numbers
    const eligibility = j.eligibility.size ? j.eligibility : await this.eligibility(this.pool, lobby.seats.map((s) => s.userId), at);
    const states = new Map<string, PlayerState>();
    for (const s of lobby.seats) states.set(s.userId, await this.currentState(this.pool, s.userId, game, at));
    const contender = (id: string) => ({ state: states.get(id)!, newAccount: eligibility.get(id)?.newAccount ?? false });
    const me = contender(viewerId);
    const pairs = counts ? await this.pairCounts(this.pool, game, lobby.seats.map((s) => s.userId), at, lobbyId) : new Map<string, number>();
    const opponents = lobby.seats
      .filter((s) => s.userId !== viewerId)
      .map((s) => {
        const key = viewerId < s.userId ? `${viewerId}:${s.userId}` : `${s.userId}:${viewerId}`;
        const weight = counts ? repeatWeight((pairs.get(key) ?? 0) + 1) : 0;
        const { win, lose } = expectedVs(me, contender(s.userId), weight, at);
        const theirs = states.get(s.userId)!;
        const pts = pointsOf(theirs.mu, theirs.sigma);
        return {
          seat: s.seat,
          tier: theirs.placementDone ? tierOf(pts) : null,
          division: theirs.placementDone ? divisionOf(pts) : null,
          placing: !theirs.placementDone,
          win,
          lose,
        };
      });
    let first: number | null = null;
    let last: number | null = null;
    if (lobby.seats.length >= 3) {
      const everyone = [me, ...lobby.seats.filter((s) => s.userId !== viewerId).map((s) => contender(s.userId))];
      ({ first, last } = expectedExtremes(everyone, counts ? j.weight : 0, at));
    }
    const mine = me.state;
    const myPoints = pointsOf(mine.mu, mine.sigma);
    return {
      game,
      lobbyId,
      rated: lobby.rated,
      wouldCount: counts,
      friendlyReason: counts ? null : (j.decision as FriendlyReason),
      self: j.about.includes(viewerId),
      me: {
        points: myPoints,
        tier: mine.placementDone ? tierOf(myPoints) : null,
        division: mine.placementDone ? divisionOf(myPoints) : null,
        placing: !mine.placementDone,
      },
      opponents,
      first,
      last,
    };
  }

  // -------------------------------------------------------------------------
  // reading: boards (R6)

  /**
   * `GET /ranks/boards/:game?scope=`:
   * - `friends`: you and your friends, minors included (friends see each
   *   other), not anyone who hid their profile from everyone;
   * - `top`: the top 50 active players — known adults only, named only when
   *   their profile is public (everyone else is "Player") — hidden while the
   *   game has fewer than FEW_PLAYERS active rated players.
   * Your own place comes back to you alone, in `me`.
   */
  async board(viewerId: string, game: RankedGame, scope: RankBoardScope): Promise<RankBoard> {
    const at = this.now();
    return scope === 'friends' ? this.friendsBoard(viewerId, game, at) : this.topBoard(viewerId, game, at);
  }

  private async friendsBoard(viewerId: string, game: RankedGame, at: Date): Promise<RankBoard> {
    const rows = await this.pool.query<RatingRow & { name: string }>(
      `SELECT r.*, COALESCE(u.display_name, u.username::text) AS name
         FROM game_ratings r JOIN users u ON u.id = r.user_id
        WHERE r.game = $1 AND (r.rated_games > 0 OR r.placement_done) AND u.deleted_at IS NULL
          AND (r.user_id = $2 OR (${areFriendsSql('r.user_id', '$2::uuid')} AND u.profile_visibility <> 'nobody'))
        ORDER BY r.points DESC, r.user_id
        LIMIT 200`,
      [game, viewerId],
    );
    const entries = await this.entries(game, rows.rows, viewerId, at);
    const mine = entries.find((e) => e.isMe);
    return {
      game,
      scope: 'friends',
      entries,
      me: mine ? { position: mine.position, points: mine.points } : null,
      hidden: false,
      activePlayers: null,
    };
  }

  private async topBoard(viewerId: string, game: RankedGame, at: Date): Promise<RankBoard> {
    // who may be on the public board: active, placed, a known adult in good standing
    const listed = `r.game = $1 AND r.placement_done AND r.last_rated_at > $2::timestamptz - make_interval(days => $3)
                    AND NOT ${notKnownAdultSql('u')} AND NOT ${RESTRICTED_SQL('u')}`;
    const active = (
      await this.pool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM game_ratings r JOIN users u ON u.id = r.user_id
          WHERE r.game = $1 AND r.placement_done AND r.last_rated_at > $2::timestamptz - make_interval(days => $3)
            AND NOT ${RESTRICTED_SQL('u')}`,
        [game, at, RESTING_DAYS],
      )
    ).rows[0]!.n;
    if (active < FEW_PLAYERS) {
      return { game, scope: 'top', entries: [], me: null, hidden: true, activePlayers: active };
    }
    const rows = await this.pool.query<RatingRow & { name: string | null }>(
      `SELECT r.*, CASE WHEN u.profile_visibility = 'everyone' THEN COALESCE(u.display_name, u.username::text) END AS name
         FROM game_ratings r JOIN users u ON u.id = r.user_id
        WHERE ${listed}
        ORDER BY r.points DESC, r.user_id
        LIMIT 50`,
      [game, at, RESTING_DAYS],
    );
    const entries = await this.entries(game, rows.rows, viewerId, at);
    // your own place among the same people, whether or not you made the top 50
    const me = (
      await this.pool.query<{ points: number; above: number }>(
        `SELECT m.points, (SELECT count(*)::int FROM game_ratings r JOIN users u ON u.id = r.user_id
                            WHERE ${listed} AND r.points > m.points) AS above
           FROM game_ratings m JOIN users mu ON mu.id = m.user_id
          WHERE m.user_id = $4 AND m.game = $1 AND m.placement_done
            AND m.last_rated_at > $2::timestamptz - make_interval(days => $3)
            AND NOT ${notKnownAdultSql('mu')} AND NOT ${RESTRICTED_SQL('mu')}`,
        [game, at, RESTING_DAYS, viewerId],
      )
    ).rows[0];
    return {
      game,
      scope: 'top',
      entries,
      me: me ? { position: me.above + 1, points: me.points } : null,
      hidden: false,
      activePlayers: active,
    };
  }

  private async entries(
    game: RankedGame,
    rows: ReadonlyArray<RatingRow & { name: string | null }>,
    viewerId: string,
    at: Date,
  ): Promise<RankBoardEntry[]> {
    const out: RankBoardEntry[] = [];
    let position = 0;
    let prev: number | null = null;
    rows.forEach((r, i) => {
      // competition ranking: equal points share a place
      if (prev === null || r.points !== prev) position = i + 1;
      prev = r.points;
      out.push({ position, name: r.user_id === viewerId ? null : r.name, isMe: r.user_id === viewerId, points: r.points, tier: null, division: null, placing: !r.placement_done, resting: false });
    });
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      let state = stateOf(r);
      if (state.seasonId < seasonOf(at).id) state = seasonReset(state, seasonOf(at).id);
      const e = out[i]!;
      const resting = isResting(state, at);
      e.resting = resting && !e.isMe;
      if (e.placing) continue;
      e.tier = (await this.isSterk(this.pool, game, state, at)) ? 'sterk' : tierOf(r.points);
      e.division = e.tier === 'sterk' ? null : divisionOf(r.points);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // reading: someone's profile

  /**
   * The ranks someone's profile shows (the profile's own visibility rules
   * decide whether it is shown at all): per game played, or carried over from
   * the old Elo, the tier now — or "Resting" after 28 days without a rated
   * game, to anyone but its owner — and the best this season and ever.
   */
  async profileRanks(userId: string, viewerIsOwner: boolean): Promise<ProfileRank[]> {
    const at = this.now();
    const rows = await this.pool.query<RatingRow>(
      `SELECT * FROM game_ratings WHERE user_id = $1 AND (rated_games > 0 OR placement_done) ORDER BY game`,
      [userId],
    );
    const out: ProfileRank[] = [];
    for (const row of rows.rows) {
      let state = stateOf(row);
      if (state.seasonId < seasonOf(at).id) state = seasonReset(state, seasonOf(at).id);
      const points = pointsOf(state.mu, state.sigma);
      const placing = !state.placementDone;
      const resting = isResting(state, at) && !viewerIsOwner;
      const hidden = placing || resting;
      const tier: RankTier | null = hidden ? null : (await this.isSterk(this.pool, row.game, state, at)) ? 'sterk' : tierOf(points);
      out.push({
        game: row.game,
        tier,
        division: tier === null || tier === 'sterk' ? null : divisionOf(points),
        points: hidden ? null : points,
        resting,
        placing,
        placement: placing ? { played: Math.min(state.ratedGames, PLACEMENT_GAMES), of: PLACEMENT_GAMES } : null,
        seasonPeakTier: placing || state.seasonGames === 0 ? null : tierOf(state.peakPoints),
        bestTier: placing ? null : tierOf(state.bestPoints),
      });
    }
    return out;
  }
}

function isResting(state: PlayerState, at: Date): boolean {
  return state.lastRatedAt !== null && at.getTime() - state.lastRatedAt.getTime() > RESTING_DAYS * DAY;
}

function shownTier(state: PlayerState, points: number): PointsTier | null {
  return state.placementDone ? tierOf(points) : null;
}

/** A counted result, as the player it belongs to sees it. */
export function countedResult(
  game: RankedGame,
  gameRef: string,
  before: PlayerState,
  after: PlayerState,
  reason: RankReason,
  weight: number | null,
  damping: number | null,
): RankResult {
  const pointsBefore = pointsOf(before.mu, before.sigma);
  const pointsAfter = pointsOf(after.mu, after.sigma);
  const tierBefore = shownTier(before, pointsBefore);
  const tierAfter = shownTier(after, pointsAfter);
  const divisionBefore: Division | null = tierBefore ? divisionOf(pointsBefore) : null;
  const divisionAfter: Division | null = tierAfter ? divisionOf(pointsAfter) : null;
  const tierUp = !!tierBefore && !!tierAfter && tierIndex(tierAfter) > tierIndex(tierBefore);
  const divisionUp =
    tierUp || (!!tierBefore && tierBefore === tierAfter && divisionAfter !== null && divisionBefore !== null && divisionAfter < divisionBefore);
  return {
    game,
    gameRef,
    counted: true,
    pointsBefore,
    pointsAfter,
    delta: pointsAfter - pointsBefore,
    reason,
    tierBefore,
    tierAfter,
    divisionBefore,
    divisionAfter,
    tierUp,
    divisionUp,
    placement: after.placementDone ? null : { played: after.ratedGames, of: PLACEMENT_GAMES },
    shieldGames: after.shieldGames,
    ...weightParts(weight, damping),
    progress: after.placementDone ? progressToNext(pointsAfter) : null,
  };
}
