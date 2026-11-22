/**
 * The solo round shared by every learning game played alone, made like practice sessions: the server makes the round,
 * keeps the answers, checks every try and pays once.
 *
 *   POST /games/solo/sessions            make a round: its items, without their answers
 *   GET  /games/solo/sessions/:id        come back to it: the items and how far it got
 *   POST /games/solo/sessions/:id/answers  one try at one item: right or not, a hint or the correction
 *   POST /games/solo/sessions/:id/finish   pay it (once), record the learning, say how it went
 *   POST /games/solo/sessions/:id/hints    spend a hint, for a game whose rounds have them (Detective)
 *   POST /games/solo/sessions/:id/begin    { index }: what an item shows while it is studied gives way to what it is answered with (The Memory Thief)
 *
 * A game plugs in an engine (`SoloEngine`): how a round is made from its approved pool, how an item looks to the player,
 * how a try is graded, the nudge after a wrong first try and the correction once done. Sessions, tries, expiry,
 * resuming and paying are here, the same for every game.
 *
 * A round can be resumed for SOLO_SESSION_HOURS; after that it takes no answers and pays nothing. Each try is its own
 * row keyed by number, so a resent try is answered the same and counted once; the finish claims the round with one
 * UPDATE, so it pays once.
 *
 * A learner has at most one open round per game and variety. A new one gives up the open one: expired at once, paid
 * nothing, and its coverage recorded in `game_seen` like a finished round's, so its corrections cannot be read and the
 * same items replayed as unseen. (Detective also carries spent hints into the next round of a case: detective.ts.)
 *
 * An item's view never carries anything derived from its answer (no hash of the sentence, no stable id of a tile's
 * identity); an item is known by its place in the round.
 *
 * Most engines are registry games and take their varieties and solo pay from their entries. An engine outside the
 * registry (the Stories' proverbs round, lore/proverb-round.ts) brings those two rules itself (`rules`).
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { z } from 'zod';
import {
  SOLO_MAX_ATTEMPTS,
  SOLO_SESSION_HOURS,
  answerXp,
  learnGame,
  paysAlone,
  type GameDialect,
  type GameDifficulty,
  type LearnGameId,
  type ProverbRoundGame,
  type SoloAnswerResult,
  type SoloItemState,
  type SoloResults,
  type SoloSessionView,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { payRound, type ItemOutcome, type RewardDeps } from './rewards.js';
import { deleteInBatches } from '../db/batches.js';
import { secondsToUtcMidnight, takeDaily, type CounterRedis } from '../limits/counters.js';

/** Rounds one learner may start a day (UTC), every game together: far past a long day's play, short of a loop's. */
export const SOLO_ROUNDS_PER_DAY = 300;

/** What every stored item has, whatever the game: its stable key, its level, and whether it was answered right lately. */
export interface StoredItem {
  key: string;
  level: number;
  /** answered right within GAME_REPEAT_XP_DAYS when the round was made: shown as paying nothing (the finish checks again) */
  repeat?: boolean;
}

/** What a round is made with. */
export interface RoundAsk {
  userId: string;
  dialect: GameDialect;
  difficulty: GameDifficulty;
  /** shuffles are seeded with it, so the round is the same however often it is read */
  seed: string;
}

/** What a round can be made of: a registry game, or a round of the Stories' proverbs. */
export type SoloGameId = LearnGameId | ProverbRoundGame;

/** What a registry game's entry says of its rounds, and an engine outside the registry says itself. */
export interface SoloRules {
  dialects: readonly GameDialect[];
  /** the XP ledger source a round pays from; null for a round that pays no XP */
  source: string | null;
}

/** A game's rules for a solo round. */
export interface SoloEngine<Item extends StoredItem, View, Answer, Hint, Correction> {
  game: SoloGameId;
  /** for an engine that is not a registry game: its varieties and what it pays (a registry game's come from its entry) */
  rules?: SoloRules;
  /** how a try is sent (validated before it is graded) */
  answer: z.ZodType<Answer>;
  /** a round's items and what it decided about the round as a whole; null when there is not enough approved content */
  build(ask: RoundAsk, db: Pick<pg.Pool, 'query'>): Promise<{ items: Item[]; meta: Record<string, unknown> } | null>;
  /** an item as the player is sent it: never its answer, nor anything worked out from it; `meta` is what the round decided so far */
  view(item: Item, index: number, meta: Record<string, unknown>): View;
  grade(item: Item, answer: Answer, dialect: GameDialect): boolean;
  /** after a wrong try with one left */
  hint(item: Item, answer: Answer, dialect: GameDialect): Hint;
  /** once the item is done; `last` is the last try, null when there was none */
  correction(item: Item, last: Answer | null, dialect: GameDialect): Correction;
  /** the key of the explanation the apps word */
  why(item: Item): string | null;
  /**
   * What the whole round shares besides its items, as sent to the player, from the round's decisions and progress
   * (Detective's case board). Sent when the round is made and read.
   */
  board?(items: Item[], meta: Record<string, unknown>, states: SoloItemState[]): unknown;
  /**
   * For games whose items are studied before answering (The Memory Thief): the player is ready to answer this item, and
   * its study view gives way for good to its answer view. Returns the round's new `meta`, or null if the item had
   * already begun. An answer begins its item too, so a try is never judged while the study is still shown.
   */
  begin?(round: { items: Item[]; meta: Record<string, unknown> }, index: number): Record<string, unknown> | null;
  /** what a request for a hint may ask for, for a game whose rounds have hints to spend */
  hintAsk?: z.ZodType<unknown>;
  /** Spend one hint on the round as a whole: the round's new `meta`, or an AppError when none is left. */
  spendHint?(round: { items: Item[]; meta: Record<string, unknown>; states: SoloItemState[] }, ask: unknown): Record<string, unknown>;
  /** after the round is paid, inside the same transaction (Build a Sentence moves its ladder) */
  finished?(client: pg.PoolClient, round: { userId: string; dialect: GameDialect; meta: Record<string, unknown>; items: readonly Item[]; results: SoloResults }): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEngine = SoloEngine<StoredItem, any, any, any, any>;

interface SessionRow {
  id: string;
  user_id: string;
  game: SoloGameId;
  dialect: GameDialect;
  difficulty: GameDifficulty;
  items: StoredItem[];
  meta: Record<string, unknown>;
  results: SoloResults | null;
  total_count: number;
  expires_at: Date;
  finished_at: Date | null;
  expired: boolean;
}

interface AnswerRow {
  item_index: number;
  attempt: number;
  answer: unknown;
  correct: boolean;
}

export interface SoloDeps extends RewardDeps {
  milestones?: MilestoneRecorder;
  log?: { warn: (obj: unknown, msg?: string) => void };
  /** where the day's rounds are counted (`SOLO_ROUNDS_PER_DAY`); without it they are not */
  redis?: CounterRedis;
}

/** Where each item stands, from its tries. */
function statesOf(total: number, answers: readonly AnswerRow[]): SoloItemState[] {
  return Array.from({ length: total }, (_, index) => {
    const tries = answers.filter((a) => a.item_index === index).sort((a, b) => a.attempt - b.attempt);
    const correct = tries.some((t) => t.correct);
    return {
      index,
      attempts: tries.length,
      correct,
      firstTry: tries[0]?.correct === true,
      done: correct || tries.length >= SOLO_MAX_ATTEMPTS,
    };
  });
}

export class SoloService {
  private readonly engines = new Map<SoloGameId, AnyEngine>();

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: SoloDeps,
  ) {}

  register(engine: AnyEngine): void {
    this.engines.set(engine.game, engine);
  }

  /** The games a round can be made of here. */
  games(): SoloGameId[] {
    return [...this.engines.keys()];
  }

  private engine(game: SoloGameId): AnyEngine {
    const engine = this.engines.get(game);
    if (!engine) throw new AppError('GAME_NOT_FOUND', 404, 'no such game to play alone');
    return engine;
  }

  /**
   * Where an engine's rounds are played and what one pays: its registry entry's (only the lessons' exercises pay alone,
   * `paysAlone`) or the engine's own.
   */
  private rules(engine: AnyEngine): SoloRules {
    if (engine.rules) return engine.rules;
    const game = learnGame(engine.game as LearnGameId);
    return { dialects: game.dialects, source: paysAlone(game.id) ? game.xpSources[0]! : null };
  }

  /**
   * Give up every round of this game and variety the learner left open: each is expired and marked given up, and its
   * items go into `game_seen` like a finished round's (`recordSeen`). One statement; the UPDATE's row locks make
   * concurrent calls give a round up once.
   */
  private async replaceOpen(db: Pick<pg.Pool, 'query'>, userId: string, game: SoloGameId, dialect: GameDialect): Promise<void> {
    await db.query(
      `WITH gone AS (
         UPDATE game_sessions SET expires_at = now(), meta = meta || '{"abandoned": true}'::jsonb
          WHERE user_id = $1 AND game = $2 AND dialect = $3 AND finished_at IS NULL AND expires_at > now()
          RETURNING id, items
       ), tried AS (
         SELECT g.items -> a.item_index::int ->> 'key' AS key, bool_or(a.correct) AS correct
           FROM gone g JOIN game_session_answers a ON a.session_id = g.id
          GROUP BY 1
       )
       INSERT INTO game_seen (user_id, game, item_key, attempts, correct, last_seen_at, last_correct_at)
       SELECT $1::uuid, $2::text, t.key, 1, CASE WHEN t.correct THEN 1 ELSE 0 END, now(), CASE WHEN t.correct THEN now() END
         FROM tried t WHERE t.key IS NOT NULL
       ON CONFLICT (user_id, game, item_key) DO UPDATE SET
         attempts = game_seen.attempts + 1,
         correct = game_seen.correct + EXCLUDED.correct,
         last_seen_at = EXCLUDED.last_seen_at,
         last_correct_at = COALESCE(EXCLUDED.last_correct_at, game_seen.last_correct_at)`,
      [userId, game, dialect],
    );
  }

  private async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * A new round of a game, in a variety, at a difficulty, replacing any open round (`replaceOpen`). 409
   * NOT_ENOUGH_CONTENT when there is too little approved content, 429 past the day's `SOLO_ROUNDS_PER_DAY`.
   *
   * The open round is given up before the new one is built, so its coverage already counts as seen; the build runs
   * outside any transaction (reading pools on its own connections), and the insert gives up any round a racing request
   * opened meanwhile.
   */
  async create(userId: string, game: SoloGameId, dialect: GameDialect, difficulty: GameDifficulty): Promise<SoloSessionView<unknown>> {
    const engine = this.engine(game);
    if (!this.rules(engine).dialects.includes(dialect)) throw new AppError('BAD_REQUEST', 400, 'this game is not played in that variety');
    // before the open round is given up, so a refused round leaves it as it was
    if (!(await takeDaily(this.deps.redis, 'solo-rounds', userId, SOLO_ROUNDS_PER_DAY, this.deps.log))) {
      throw new AppError('RATE_LIMITED', 429, 'too many rounds today; try again tomorrow', { retryAfterSec: secondsToUtcMidnight() });
    }
    await this.replaceOpen(this.pool, userId, game, dialect);
    const id = randomUUID();
    const round = await engine.build({ userId, dialect, difficulty, seed: id }, this.pool);
    if (!round || round.items.length === 0) {
      throw new AppError('NOT_ENOUGH_CONTENT', 409, 'there is not enough approved content for this game at this difficulty yet');
    }
    const res = await this.tx(async (client) => {
      // one new round at a time per learner, game and variety: a request racing this one waits here, and gives this round up in turn
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('game-round:' || $1 || ':' || $2 || ':' || $3, 0))`, [userId, game, dialect]);
      await this.replaceOpen(client, userId, game, dialect);
      return client.query<{ expires_at: Date }>(
        `INSERT INTO game_sessions (id, user_id, game, dialect, difficulty, items, meta, total_count, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, now() + make_interval(hours => $9))
         RETURNING expires_at`,
        [id, userId, game, dialect, difficulty, JSON.stringify(round.items), JSON.stringify(round.meta), round.items.length, SOLO_SESSION_HOURS],
      );
    });
    const states = statesOf(round.items.length, []);
    return {
      id,
      game,
      dialect,
      difficulty,
      items: round.items.map((item, i) => engine.view(item, i, round.meta)),
      states,
      maxAttempts: SOLO_MAX_ATTEMPTS,
      finished: false,
      expiresAt: res.rows[0]!.expires_at.toISOString(),
      ...(engine.board ? { board: engine.board(round.items, round.meta, states) } : {}),
    };
  }

  private async load(db: Pick<pg.Pool, 'query'>, id: string, userId: string, lock = false): Promise<SessionRow> {
    const res = await db.query<SessionRow>(
      `SELECT id, user_id, game, dialect, difficulty, items, meta, results, total_count, expires_at, finished_at, (expires_at <= now()) AS expired
         FROM game_sessions WHERE id = $1 AND user_id = $2 ${lock ? 'FOR UPDATE' : ''}`,
      [id, userId],
    );
    const row = res.rows[0];
    if (!row) throw new AppError('GAME_SESSION_NOT_FOUND', 404, 'no such round');
    return row;
  }

  private async answersOf(db: Pick<pg.Pool, 'query'>, id: string): Promise<AnswerRow[]> {
    const res = await db.query<AnswerRow>(
      `SELECT item_index, attempt, answer, correct FROM game_session_answers WHERE session_id = $1 ORDER BY item_index, attempt`,
      [id],
    );
    return res.rows;
  }

  /** A round as it stands, to come back to. */
  async view(id: string, userId: string): Promise<SoloSessionView<unknown> & { expired: boolean; results: SoloResults | null }> {
    const row = await this.load(this.pool, id, userId);
    const engine = this.engine(row.game);
    const answers = await this.answersOf(this.pool, row.id);
    const states = statesOf(row.total_count, answers);
    return {
      id: row.id,
      game: row.game,
      dialect: row.dialect,
      difficulty: row.difficulty,
      items: row.items.map((item, i) => engine.view(item, i, row.meta)),
      states,
      maxAttempts: SOLO_MAX_ATTEMPTS,
      finished: row.finished_at !== null,
      expiresAt: row.expires_at.toISOString(),
      expired: row.expired && row.finished_at === null,
      results: row.results,
      ...(engine.board ? { board: engine.board(row.items, row.meta, states) } : {}),
    };
  }

  /** The newest round of a game in a variety this learner left unfinished and can still come back to. */
  async open(userId: string, game: SoloGameId, dialect: GameDialect): Promise<string | null> {
    const res = await this.pool.query<{ id: string }>(
      `SELECT id FROM game_sessions
        WHERE user_id = $1 AND game = $2 AND dialect = $3 AND finished_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [userId, game, dialect],
    );
    return res.rows[0]?.id ?? null;
  }

  /**
   * One try at one item. `attempt`, when sent, numbers the try: a try already recorded under it is answered again as
   * before, so a retry after a lost response is never a second try.
   */
  async answer(id: string, userId: string, index: number, raw: unknown, attempt?: number): Promise<SoloAnswerResult<unknown, unknown>> {
    return this.tx(async (client) => {
      const row = await this.load(client, id, userId, true);
      if (row.finished_at) throw new AppError('GAME_SESSION_FINISHED', 409, 'this round is finished');
      if (row.expired) throw new AppError('GAME_SESSION_EXPIRED', 410, 'this round has expired; start a new one');
      const engine = this.engine(row.game);
      const item = row.items[index];
      if (!item) throw new AppError('ITEM_NOT_IN_SESSION', 404, 'no such item in this round');
      const parsed = engine.answer.safeParse(raw);
      if (!parsed.success) throw new AppError('BAD_REQUEST', 400, 'that answer is not one this game takes');
      const tries = (await this.answersOf(client, row.id)).filter((a) => a.item_index === index);
      // an answer ends the item's study for good, as asking for its gaps does
      const begun = engine.begin?.({ items: row.items, meta: row.meta }, index) ?? null;
      if (begun) await client.query(`UPDATE game_sessions SET meta = $2::jsonb WHERE id = $1`, [row.id, JSON.stringify(begun)]);

      const respond = (n: number, correct: boolean, last: unknown): SoloAnswerResult<unknown, unknown> => {
        const firstTry = correct && n === 1;
        const done = correct || n >= SOLO_MAX_ATTEMPTS;
        return {
          index,
          attempt: n,
          correct,
          firstTry,
          done,
          hint: !done ? engine.hint(item, last, row.dialect) : null,
          correction: done ? engine.correction(item, last, row.dialect) : null,
          why: done ? engine.why(item) : null,
          // what it would pay, before the finish checks the repeat window again and that the round was learning; nothing in a game that pays none
          xp: this.rules(engine).source !== null ? answerXp(item.level, { correct, firstTry, repeat: item.repeat === true }) : 0,
          repeat: item.repeat === true,
        };
      };

      if (attempt !== undefined) {
        const earlier = tries.find((t) => t.attempt === attempt);
        if (earlier) return respond(earlier.attempt, earlier.correct, earlier.answer);
      }
      if (tries.some((t) => t.correct) || tries.length >= SOLO_MAX_ATTEMPTS) {
        throw new AppError('ITEM_DONE', 409, 'this item has had its tries');
      }
      const n = tries.length + 1;
      if (attempt !== undefined && attempt !== n) throw new AppError('BAD_REQUEST', 400, `this is try ${n} at this item`);
      const correct = engine.grade(item, parsed.data, row.dialect);
      await client.query(
        `INSERT INTO game_session_answers (session_id, item_index, attempt, answer, correct) VALUES ($1, $2, $3, $4::jsonb, $5)`,
        [row.id, index, n, JSON.stringify(parsed.data), correct],
      );
      if (correct) {
        await client.query(
          `UPDATE game_sessions SET correct_count = correct_count + 1, first_try_count = first_try_count + $2 WHERE id = $1`,
          [row.id, n === 1 ? 1 : 0],
        );
      }
      return respond(n, correct, parsed.data);
    });
  }

  /**
   * The player is ready to answer a studied item: its study view gives way for good to its answer view (The Memory
   * Thief's passage, then its gaps). Answered with the item as it now is; asking again answers the same.
   */
  async begin(id: string, userId: string, index: number): Promise<{ item: unknown }> {
    return this.tx(async (client) => {
      const row = await this.load(client, id, userId, true);
      const engine = this.engine(row.game);
      if (!engine.begin) throw new AppError('NO_STUDY', 409, 'this game’s items are not studied first');
      if (row.finished_at) throw new AppError('GAME_SESSION_FINISHED', 409, 'this round is finished');
      if (row.expired) throw new AppError('GAME_SESSION_EXPIRED', 410, 'this round has expired; start a new one');
      const item = row.items[index];
      if (!item) throw new AppError('ITEM_NOT_IN_SESSION', 404, 'no such item in this round');
      const meta = engine.begin({ items: row.items, meta: row.meta }, index);
      if (meta) await client.query(`UPDATE game_sessions SET meta = $2::jsonb WHERE id = $1`, [row.id, JSON.stringify(meta)]);
      return { item: engine.view(item, index, meta ?? row.meta) };
    });
  }

  /**
   * Spend a hint on an open round under the round's lock, so two at once are two hints. Answered with the board as it
   * now stands.
   */
  async hint(id: string, userId: string, raw: unknown): Promise<{ board: unknown }> {
    return this.tx(async (client) => {
      const row = await this.load(client, id, userId, true);
      const engine = this.engine(row.game);
      if (!engine.spendHint || !engine.hintAsk) throw new AppError('NO_HINTS', 409, 'this game has no hints to spend');
      if (row.finished_at) throw new AppError('GAME_SESSION_FINISHED', 409, 'this round is finished');
      if (row.expired) throw new AppError('GAME_SESSION_EXPIRED', 410, 'this round has expired; start a new one');
      const ask = engine.hintAsk.safeParse(raw ?? {});
      if (!ask.success) throw new AppError('BAD_REQUEST', 400, 'that is not a hint this game gives');
      const states = statesOf(row.total_count, await this.answersOf(client, row.id));
      const meta = engine.spendHint({ items: row.items, meta: row.meta, states }, ask.data);
      await client.query(`UPDATE game_sessions SET meta = $2::jsonb WHERE id = $1`, [row.id, JSON.stringify(meta)]);
      return { board: engine.board ? engine.board(row.items, meta, states) : null };
    });
  }

  /**
   * Close and pay the round, once. Finishing again returns the results it was paid with. Untried items count as missed:
   * a round is scored out of all of it.
   */
  async finish(id: string, userId: string): Promise<SoloResults> {
    const now = new Date();
    const out = await this.tx(async (client) => {
      const row = await this.load(client, id, userId, true);
      if (row.finished_at) return { results: row.results!, fresh: false };
      if (row.expired) throw new AppError('GAME_SESSION_EXPIRED', 410, 'this round has expired; start a new one');
      const engine = this.engine(row.game);
      const states = statesOf(row.total_count, await this.answersOf(client, row.id));
      const items: ItemOutcome[] = row.items.map((item, i) => ({
        index: i,
        key: item.key,
        level: item.level,
        answered: states[i]!.attempts > 0,
        correct: states[i]!.correct,
        firstTry: states[i]!.firstTry,
      }));
      // only the lessons' exercises pay; a game played alone is scored and counted, and earns no XP
      const source = this.rules(engine).source;
      const results = await payRound(client, this.deps, { sessionId: row.id, userId, game: row.game, source, items, now });
      await engine.finished?.(client, { userId, dialect: row.dialect, meta: row.meta, items: row.items, results });
      await client.query(
        `UPDATE game_sessions SET finished_at = $2, results = $3::jsonb, xp_awarded = $4, learning_counted = $5 WHERE id = $1`,
        [row.id, now, JSON.stringify(results), results.xp, results.learningCounted],
      );
      return { results, fresh: true };
    });
    // best-effort, after the commit, idempotent
    if (out.fresh && out.results.streak !== null && this.deps.milestones) {
      await this.deps.milestones.recordStreak(userId, out.results.streak).catch((err) => this.deps.log?.warn({ err }, 'streak milestone not recorded'));
    }
    return out.results;
  }

  /**
   * Housekeeping: delete rounds long finished or expired and old `game_seen` rows. Idempotent, so several instances may
   * run it at once.
   */
  async housekeeping(): Promise<{ sessions: number; seen: number }> {
    const sessions = await deleteInBatches(
      this.pool,
      'game_sessions',
      `(finished_at IS NOT NULL AND finished_at < now() - interval '90 days') OR (finished_at IS NULL AND expires_at < now() - interval '7 days')`,
    );
    const seen = await deleteInBatches(this.pool, 'game_seen', `last_seen_at < now() - interval '365 days'`);
    return { sessions, seen };
  }
}
