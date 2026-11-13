/**
 * The solo round every learning game played alone shares, as practice
 * sessions are made: the server makes the round, keeps the answers, checks
 * every try and pays once.
 *
 *   POST /games/solo/sessions            make a round: its items, without their answers
 *   GET  /games/solo/sessions/:id        come back to it: the items and how far it got
 *   POST /games/solo/sessions/:id/answers  one try at one item: right or not, a hint or the correction
 *   POST /games/solo/sessions/:id/finish   pay it (once), record the learning, say how it went
 *   POST /games/solo/sessions/:id/hints    spend a hint, for a game whose rounds have them (Detective)
 *   POST /games/solo/sessions/:id/begin    { index }: what an item shows while it is studied gives way to what it is answered with (The Memory Thief)
 *
 * A game plugs in an engine (`SoloEngine`): how a round is made from its
 * approved pool, what an item looks like to the player, how a try is graded,
 * the nudge after a wrong first try and the correction once an item is done.
 * Everything else — sessions, tries, expiry, resuming, paying — is here, the
 * same for every game.
 *
 * A round can be come back to for SOLO_SESSION_HOURS; after that it takes no
 * more answers and pays nothing. A try is a row of its own keyed by its
 * number, so a try sent twice (a retry after a dropped connection) is answered
 * the same twice and counted once; the finish claims the round with one
 * UPDATE, so it pays once however often it is asked for.
 *
 * A learner has at most one open round of a game in a variety. A new one
 * replaces the round left open, which is given up: it takes no more answers
 * (it is expired at once), it pays nothing, and what it covered is recorded
 * in `game_seen` as a finished round's is — so the corrections a round showed
 * cannot be read, the round dropped, and the same items played again first
 * as if never met. (Detective also carries the hints spent on a case
 * into the next round of that case until a round has paid for them:
 * detective.ts.)
 *
 * A game's item view never carries anything worked out from its answer: no
 * key hashed from the sentence, no stable id of the identity behind a tile.
 * What an item is known by is its place in the round.
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
  type SoloAnswerResult,
  type SoloItemState,
  type SoloResults,
  type SoloSessionView,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { payRound, type ItemOutcome, type RewardDeps } from './rewards.js';

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

/** A game's rules for a solo round. */
export interface SoloEngine<Item extends StoredItem, View, Answer, Hint, Correction> {
  game: LearnGameId;
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
   * What the whole round shares beside its items, as the player is sent it,
   * from what the round decided and how far it has got (Detective's
   * case board). Sent with the round when it is made and when it is read.
   */
  board?(items: Item[], meta: Record<string, unknown>, states: SoloItemState[]): unknown;
  /**
   * For a game whose items are studied before they are answered (The Memory
   * Thief): the player is ready to answer this item, and what it shows while
   * it is studied gives way, for good, to what it is answered with. The
   * round's new `meta`, or null when the item had already begun. An answer
   * begins its item too, so a try is never judged on an item whose study is
   * still on show.
   */
  begin?(round: { items: Item[]; meta: Record<string, unknown> }, index: number): Record<string, unknown> | null;
  /** what a request for a hint may ask for, for a game whose rounds have hints to spend */
  hintAsk?: z.ZodType<unknown>;
  /**
   * Spend one hint on the round as a whole: what the round decides from now
   * on (its new `meta`), or an AppError when there is none to give.
   */
  spendHint?(round: { items: Item[]; meta: Record<string, unknown>; states: SoloItemState[] }, ask: unknown): Record<string, unknown>;
  /** after the round is paid, inside the same transaction (Build a Sentence moves its ladder) */
  finished?(client: pg.PoolClient, round: { userId: string; dialect: GameDialect; meta: Record<string, unknown>; items: readonly Item[]; results: SoloResults }): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEngine = SoloEngine<StoredItem, any, any, any, any>;

interface SessionRow {
  id: string;
  user_id: string;
  game: LearnGameId;
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
  log?: { warn: (obj: unknown, msg: string) => void };
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
  private readonly engines = new Map<LearnGameId, AnyEngine>();

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: SoloDeps,
  ) {}

  register(engine: AnyEngine): void {
    this.engines.set(engine.game, engine);
  }

  /** The games a round can be made of here. */
  games(): LearnGameId[] {
    return [...this.engines.keys()];
  }

  private engine(game: LearnGameId): AnyEngine {
    const engine = this.engines.get(game);
    if (!engine) throw new AppError('GAME_NOT_FOUND', 404, 'no such game to play alone');
    return engine;
  }

  /**
   * Give up every round of this game and variety the learner left open: each
   * is expired now and marked given up, and the items it covered go into
   * `game_seen` as a finished round's do (`recordSeen`: tried, and when last
   * answered right). One statement, so it costs a round no more than one
   * trip; the UPDATE's row locks make two at once give a round up once.
   */
  private async replaceOpen(db: Pick<pg.Pool, 'query'>, userId: string, game: LearnGameId, dialect: GameDialect): Promise<void> {
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
   * A new round of a game, in a variety, at a difficulty, in place of any
   * round of it left open (`replaceOpen`). 409 NOT_ENOUGH_CONTENT when there
   * is too little approved content.
   *
   * The round left open is given up before the new one is built, so what it
   * covered already counts as seen; the build runs outside any transaction
   * (it reads the pools on connections of its own), and the insert gives up
   * again whatever round a request racing this one opened meanwhile.
   */
  async create(userId: string, game: LearnGameId, dialect: GameDialect, difficulty: GameDifficulty): Promise<SoloSessionView<unknown>> {
    const engine = this.engine(game);
    if (!learnGame(game).dialects.includes(dialect)) throw new AppError('BAD_REQUEST', 400, 'this game is not played in that variety');
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
  async open(userId: string, game: LearnGameId, dialect: GameDialect): Promise<string | null> {
    const res = await this.pool.query<{ id: string }>(
      `SELECT id FROM game_sessions
        WHERE user_id = $1 AND game = $2 AND dialect = $3 AND finished_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [userId, game, dialect],
    );
    return res.rows[0]?.id ?? null;
  }

  /**
   * One try at one item. `attempt`, when sent, is which try this is: a try
   * already recorded under it is answered again as it was, so a retry after a
   * lost response is never a second try.
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
          xp: paysAlone(row.game) ? answerXp(item.level, { correct, firstTry, repeat: item.repeat === true }) : 0,
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
   * The player is ready to answer an item that is studied first: its study
   * gives way to what it is answered with, for good (The Memory Thief's
   * passage, then its gaps). Answered with the item as it now is; asking
   * again answers the same.
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
   * Spend a hint on an open round, under the round's lock so two at once are
   * two hints, never one counted twice. Answered with the round's board as it
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
   * Close the round and pay it, once. A round asked to finish again answers
   * with the results it was paid with. Items never tried count as missed: a
   * round is scored out of all of it.
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
      const source = paysAlone(row.game) ? learnGame(row.game).xpSources[0]! : null;
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
   * Housekeeping: rounds long finished or long expired, and what learners saw
   * long ago. Idempotent deletes, so several instances may run it at once.
   */
  async housekeeping(): Promise<{ sessions: number; seen: number }> {
    const sessions = await this.pool.query(
      `DELETE FROM game_sessions WHERE (finished_at IS NOT NULL AND finished_at < now() - interval '90 days')
          OR (finished_at IS NULL AND expires_at < now() - interval '7 days')`,
    );
    const seen = await this.pool.query(`DELETE FROM game_seen WHERE last_seen_at < now() - interval '365 days'`);
    return { sessions: sessions.rowCount ?? 0, seen: seen.rowCount ?? 0 };
  }
}
