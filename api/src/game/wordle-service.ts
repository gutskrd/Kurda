import type pg from 'pg';
import { XpService } from '../xp/service.js';
import { StreakService } from '../streaks/service.js';
import {
  applyGuess,
  initGame,
  keyboardFromGuesses,
  normalizeWord,
  toLetters,
  InMemoryDictionary,
  type GuessRejection,
  type GuessRow,
  type GameStatus,
  type WordleGame,
} from './wordle.js';
import {
  applyGameResult,
  averageGuesses,
  emptyStats,
  filterByDifficulty,
  pickDailyWord,
  utcDayIndex,
  winPercentage,
  type Difficulty,
  type WordleStats,
} from './wordle-daily.js';

export type WordleMode = 'daily' | 'practice';

/** Difficulty fallback order when a difficulty's pool is empty. */
const HARDER_TO_EASIER: readonly Difficulty[] = ['hard', 'medium', 'easy'];

export type StartResult =
  | { ok: true; game: WordleGameView }
  | { ok: false; reason: 'empty-pool' };

export type GuessResult =
  | { ok: true; game: WordleGameView }
  | { ok: false; reason: GuessRejection | 'not-found' | 'finished' };

/**
 * Client-safe view of a game. `target` is only ever populated once the game is
 * over (won/lost) — while `status === 'playing'` it stays null so the answer
 * never leaks. Guesses carry only their scored feedback, not the target.
 */
export interface WordleGameView {
  id: string;
  mode: WordleMode;
  difficulty: Difficulty;
  status: GameStatus;
  targetLength: number;
  guesses: GuessRow[];
  keyboard: Record<string, import('./wordle.js').LetterFeedback>;
  remainingAttempts: number;
  /** revealed only when the game is finished */
  target: string | null;
  xpAwarded: number | null;
}

interface GameRow {
  id: string;
  user_id: string;
  mode: WordleMode;
  difficulty: Difficulty;
  day_index: number | null;
  target: string;
  target_length: number;
  guesses: GuessRow[];
  status: GameStatus;
  started_at: Date;
  finished_at: Date | null;
  time_ms: number | null;
}

const MAX_ATTEMPTS = 6;

/**
 * Daily & practice Wordle backend (KUR-304). Server-authoritative: the target
 * lives in `wordle_games` and guesses are scored here (via the #303 engine) so
 * the answer is withheld until the game ends. Finishing a game folds XP (#030),
 * the daily streak (#031), and per-player stats in one transaction.
 */
export class WordleService {
  private readonly xp: XpService;
  private readonly streaks: StreakService;
  private readonly now: () => Date;

  constructor(
    private readonly pool: pg.Pool,
    deps: { xp?: XpService; streaks?: StreakService; now?: () => Date } = {},
  ) {
    this.xp = deps.xp ?? new XpService(pool);
    this.streaks = deps.streaks ?? new StreakService(pool);
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Start (or resume) today's daily game. The word is the same for every player
   * on a given UTC day. A second call the same day returns the existing game
   * (resumes an unfinished one, or the finished result) — never a fresh word.
   */
  async startDaily(userId: string, difficulty: Difficulty): Promise<StartResult> {
    const dayIndex = utcDayIndex(this.now());

    const existing = await this.pool.query<GameRow>(
      `SELECT * FROM wordle_games WHERE user_id = $1 AND mode = 'daily' AND day_index = $2`,
      [userId, dayIndex],
    );
    const found = existing.rows[0];
    if (found) return { ok: true, game: this.toView(found) };

    const picked = await this.pickTarget(difficulty, dayIndex);
    if (!picked) return { ok: false, reason: 'empty-pool' };

    const inserted = await this.pool.query<GameRow>(
      `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length)
       VALUES ($1, 'daily', $2, $3, $4, $5)
       RETURNING *`,
      [userId, picked.difficulty, dayIndex, picked.target, toLetters(picked.target).length],
    );
    return { ok: true, game: this.toView(inserted.rows[0]!) };
  }

  /** Start a fresh practice game: random word, unlimited, no streak/daily effect. */
  async startPractice(userId: string, difficulty: Difficulty): Promise<StartResult> {
    const picked = await this.pickTarget(difficulty, null);
    if (!picked) return { ok: false, reason: 'empty-pool' };

    const inserted = await this.pool.query<GameRow>(
      `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length)
       VALUES ($1, 'practice', $2, NULL, $3, $4)
       RETURNING *`,
      [userId, picked.difficulty, picked.target, toLetters(picked.target).length],
    );
    return { ok: true, game: this.toView(inserted.rows[0]!) };
  }

  /**
   * Score one guess against the (server-held) target. A rejected guess (wrong
   * length / not a dictionary word) does not consume an attempt. A winning or
   * sixth guess finishes the game, awarding XP + streak + stats atomically.
   */
  async guess(userId: string, gameId: string, word: string): Promise<GuessResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<GameRow>(
        `SELECT * FROM wordle_games WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [gameId, userId],
      );
      const row = res.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not-found' };
      }
      if (row.status !== 'playing') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'finished' };
      }

      const game = this.rehydrate(row);
      const normalized = normalizeWord(word);
      const known = await this.wordExists(client, normalized);
      const dict = new InMemoryDictionary(known ? [normalized] : []);
      const applied = applyGuess(game, row.target, word, dict);
      if (!applied.ok) {
        await client.query('ROLLBACK');
        return { ok: false, reason: applied.reason };
      }

      const next = applied.game;
      const finished = next.status !== 'playing';
      const timeMs = finished ? Math.max(0, this.now().getTime() - row.started_at.getTime()) : null;

      const updated = await client.query<GameRow>(
        `UPDATE wordle_games
         SET guesses = $2::jsonb, status = $3,
             finished_at = CASE WHEN $4::boolean THEN now() ELSE finished_at END,
             time_ms = COALESCE($5, time_ms)
         WHERE id = $1
         RETURNING *`,
        [gameId, JSON.stringify(next.guesses), next.status, finished, timeMs],
      );

      let xpAwarded: number | null = null;
      if (finished) {
        xpAwarded = await this.finish(client, row, next, timeMs ?? 0);
      }

      await client.query('COMMIT');
      const view = this.toView(updated.rows[0]!);
      view.xpAwarded = xpAwarded;
      return { ok: true, game: view };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** A player's aggregate stats, with derived win % and average guesses. */
  async stats(userId: string): Promise<
    WordleStats & { winPercentage: number; averageGuesses: number }
  > {
    const res = await this.pool.query<StatsRow>(
      `SELECT * FROM wordle_stats WHERE user_id = $1`,
      [userId],
    );
    const stats = res.rows[0] ? fromStatsRow(res.rows[0]) : emptyStats();
    return { ...stats, winPercentage: winPercentage(stats), averageGuesses: averageGuesses(stats) };
  }

  // ---- internals -------------------------------------------------------------

  /** Fold a finished game into stats + XP + streak, inside the caller's tx. */
  private async finish(
    client: pg.PoolClient,
    row: GameRow,
    game: WordleGame,
    timeMs: number,
  ): Promise<number> {
    const won = game.status === 'won';
    const guesses = game.guesses.length;
    const daily = row.mode === 'daily';

    const prevRes = await client.query<StatsRow>(
      `SELECT * FROM wordle_stats WHERE user_id = $1 FOR UPDATE`,
      [row.user_id],
    );
    const prev = prevRes.rows[0] ? fromStatsRow(prevRes.rows[0]) : emptyStats();

    const { stats: nextStats, xpAwarded } = applyGameResult(prev, {
      won,
      guesses,
      timeMs,
      daily,
      dayIndex: row.day_index ?? undefined,
    });

    await this.saveStats(client, row.user_id, nextStats);

    // idempotent award: one per daily day, one per practice game
    const refId = daily ? `daily:${row.day_index}` : `game:${row.id}`;
    await this.xp.award(
      { userId: row.user_id, source: 'wordle', amount: xpAwarded, refId },
      client,
    );

    // a daily win also counts toward the global daily streak (#031)
    if (daily && won) {
      const tz = await this.userTimeZone(client, row.user_id);
      await this.streaks.recordActivity(row.user_id, tz, this.now(), client);
    }

    return xpAwarded;
  }

  private async saveStats(client: pg.PoolClient, userId: string, s: WordleStats): Promise<void> {
    await client.query(
      `INSERT INTO wordle_stats
         (user_id, played, wins, losses, current_streak, longest_streak,
          guesses_in_wins, fastest_ms, total_xp, words_learned, last_daily_day_index, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (user_id) DO UPDATE SET
         played = EXCLUDED.played, wins = EXCLUDED.wins, losses = EXCLUDED.losses,
         current_streak = EXCLUDED.current_streak, longest_streak = EXCLUDED.longest_streak,
         guesses_in_wins = EXCLUDED.guesses_in_wins, fastest_ms = EXCLUDED.fastest_ms,
         total_xp = EXCLUDED.total_xp, words_learned = EXCLUDED.words_learned,
         last_daily_day_index = EXCLUDED.last_daily_day_index, updated_at = now()`,
      [
        userId, s.played, s.wins, s.losses, s.currentStreak, s.longestStreak,
        s.guessesInWins, s.fastestMs, s.totalXp, s.wordsLearned, s.lastDailyDayIndex,
      ],
    );
  }

  private async userTimeZone(client: pg.PoolClient, userId: string): Promise<string> {
    const res = await client.query<{ timezone: string }>(
      `SELECT timezone FROM users WHERE id = $1`,
      [userId],
    );
    return res.rows[0]?.timezone ?? 'UTC';
  }

  private async wordExists(executor: Pick<pg.Pool, 'query'>, normalized: string): Promise<boolean> {
    if (!normalized) return false;
    const res = await executor.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM dict_entries WHERE headword_normalized = $1) AS exists`,
      [normalized],
    );
    return res.rows[0]?.exists ?? false;
  }

  /**
   * Pick a target for a difficulty, falling back to an easier tier when the
   * pool is empty (per the spec's empty-pool edge case). `dayIndex` null → a
   * random practice word; otherwise the deterministic daily pick.
   */
  private async pickTarget(
    difficulty: Difficulty,
    dayIndex: number | null,
  ): Promise<{ target: string; difficulty: Difficulty } | null> {
    const order = [difficulty, ...HARDER_TO_EASIER.filter((d) => d !== difficulty)];
    for (const tier of order) {
      const pool = await this.loadPool(tier);
      if (pool.length === 0) continue;
      const target =
        dayIndex === null
          ? pool[Math.floor(Math.random() * pool.length)]!
          : pickDailyWord(pool, dayIndex, tier);
      if (target) return { target, difficulty: tier };
    }
    return null;
  }

  /** Difficulty pool = dictionary headwords of the right letter-length, stable order. */
  private async loadPool(difficulty: Difficulty): Promise<string[]> {
    const res = await this.pool.query<{ headword: string }>(
      `SELECT headword FROM dict_entries ORDER BY id`,
    );
    return filterByDifficulty(res.rows.map((r) => r.headword), difficulty);
  }

  private rehydrate(row: GameRow): WordleGame {
    const base = initGame(row.target_length);
    const guesses = row.guesses;
    return {
      ...base,
      status: row.status,
      guesses,
      keyboard: keyboardFromGuesses(guesses),
    };
  }

  private toView(row: GameRow): WordleGameView {
    const finished = row.status !== 'playing';
    return {
      id: row.id,
      mode: row.mode,
      difficulty: row.difficulty,
      status: row.status,
      targetLength: row.target_length,
      guesses: row.guesses,
      keyboard: keyboardFromGuesses(row.guesses),
      remainingAttempts: Math.max(0, MAX_ATTEMPTS - row.guesses.length),
      target: finished ? row.target : null,
      xpAwarded: null,
    };
  }
}

interface StatsRow {
  played: number;
  wins: number;
  losses: number;
  current_streak: number;
  longest_streak: number;
  guesses_in_wins: number;
  fastest_ms: number | null;
  total_xp: number;
  words_learned: number;
  last_daily_day_index: number | null;
}

function fromStatsRow(r: StatsRow): WordleStats {
  return {
    played: r.played,
    wins: r.wins,
    losses: r.losses,
    currentStreak: r.current_streak,
    longestStreak: r.longest_streak,
    guessesInWins: r.guesses_in_wins,
    fastestMs: r.fastest_ms,
    totalXp: r.total_xp,
    wordsLearned: r.words_learned,
    lastDailyDayIndex: r.last_daily_day_index,
  };
}
