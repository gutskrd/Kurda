import type pg from 'pg';
import { StreakService, type StreakSummary } from '../streaks/service.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { SavedWordsService, type SaveResult } from '../dictionary/saved-words-service.js';
import {
  applyGuess,
  initGame,
  keyboardFromGuesses,
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
  dailyRepeatWindow,
  emptyStats,
  filterByDifficulty,
  pickDailyWord,
  utcDayIndex,
  winPercentage,
  type Difficulty,
  type WordleStats,
} from './wordle-daily.js';
import { normalizeWord } from './rhyme.js';
import { isWordleGuess, loadWordlePool, recentTargets, wordleEntryId } from './word-pool.js';
import { meaningsOf, type WordMeanings } from './word-meanings.js';

export type WordleMode = 'daily' | 'practice';

/** Difficulty fallback order when a difficulty's pool is empty. */
const HARDER_TO_EASIER: readonly Difficulty[] = ['hard', 'medium', 'easy'];

export type StartResult =
  | { ok: true; game: WordleGameView }
  | { ok: false; reason: 'empty-pool' };

export type GuessResult =
  | { ok: true; game: WordleGameView }
  | { ok: false; reason: GuessRejection | 'not-found' | 'finished' };

export type SaveWordResult =
  | { ok: true; saved: SaveResult; wordsLearned: number }
  | { ok: false; reason: 'not-found' | 'not-finished' | 'no-entry' };

/**
 * A finished game's answer for the results card: its meanings in every language a word card gives (the app shows the
 * reader's own) and the dictionary entry to save it as. Exactly this word, never the nearest search hit.
 */
export interface WordleWordCard {
  /** null when the dictionary has no entry spelt exactly so, and there is nothing to save */
  entryId: string | null;
  meanings: WordMeanings;
  /** already in the player's saved words */
  saved: boolean;
}

/**
 * Client-safe view of a game. `target` stays null while `status === 'playing'` and is filled only once the game is
 * over, so the answer never leaks. Guesses carry only their feedback.
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
  /** once the game is finished: the answer's meanings and its dictionary entry; null while playing */
  word: WordleWordCard | null;
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
  /** when the player saved this game's word (1751000590000): it counts once toward words learned */
  word_saved_at?: Date | null;
}

export const MAX_ATTEMPTS = 6;

/**
 * Daily and practice Peyvok, server-authoritative: the target lives in `wordle_games` and guesses are scored here, so
 * the answer is withheld until the game ends. Finishing folds the daily streak and stats in one transaction; it pays no
 * XP.
 */
export class WordleService {
  private readonly streaks: StreakService;
  private readonly now: () => Date;
  private readonly milestones?: MilestoneRecorder;
  private readonly savedWords: SavedWordsService;

  constructor(
    private readonly pool: pg.Pool,
    deps: { streaks?: StreakService; now?: () => Date; milestones?: MilestoneRecorder; savedWords?: SavedWordsService } = {},
  ) {
    this.streaks = deps.streaks ?? new StreakService(pool);
    this.now = deps.now ?? (() => new Date());
    this.milestones = deps.milestones;
    this.savedWords = deps.savedWords ?? new SavedWordsService(pool);
  }

  /**
   * Start (or resume) today's daily game at a difficulty. Each difficulty has one daily word per UTC day, the same for
   * everyone; calling again the same day returns the existing game (unfinished or finished), never a new word.
   */
  async startDaily(userId: string, difficulty: Difficulty): Promise<StartResult> {
    const dayIndex = utcDayIndex(this.now());

    const found = await this.dailyGame(userId, dayIndex, difficulty);
    if (found) return { ok: true, game: await this.withWord(userId, found) };

    const picked = await this.dailyTarget(difficulty, dayIndex);
    if (!picked) return { ok: false, reason: 'empty-pool' };
    // an empty band fell back to another one: that band's daily, if the player has one already, is the game
    if (picked.difficulty !== difficulty) {
      const fallen = await this.dailyGame(userId, dayIndex, picked.difficulty);
      if (fallen) return { ok: true, game: await this.withWord(userId, fallen) };
    }

    // Two asks at once (a page that mounts twice, two devices opening the app together) both find no game above and
    // both come here. The day's game at a difficulty is the table's to keep (`wordle_games_one_daily_per_difficulty`):
    // the second insert steps aside and is given the game the first one made, rather than failing the request.
    const inserted = await this.pool.query<GameRow>(
      `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length)
       VALUES ($1, 'daily', $2, $3, $4, $5)
       ON CONFLICT (user_id, day_index, difficulty) WHERE mode = 'daily' DO NOTHING
       RETURNING *`,
      [userId, picked.difficulty, dayIndex, picked.target, toLetters(picked.target).length],
    );
    const made = inserted.rows[0];
    if (made) return { ok: true, game: this.toView(made) };
    const kept = await this.dailyGame(userId, dayIndex, picked.difficulty);
    return kept ? { ok: true, game: await this.withWord(userId, kept) } : { ok: false, reason: 'empty-pool' };
  }

  /**
   * Start a fresh practice game: a random word with no streak or daily effect, avoiding the player's last
   * RECENT_TARGETS words.
   */
  async startPractice(userId: string, difficulty: Difficulty): Promise<StartResult> {
    const picked = await this.practiceTarget(userId, difficulty);
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
   * Score one guess against the server-held target. A rejected guess (wrong length, not a dictionary word) uses no
   * attempt. A winning or sixth guess finishes the game, updating streak and stats atomically.
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
      const known = await isWordleGuess(client, normalized);
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
      let streak: StreakSummary | null = null;
      if (finished) {
        ({ xpAwarded, streak } = await this.finish(client, row, next, timeMs ?? 0));
      }

      await client.query('COMMIT');
      // a daily win that extended the streak may have reached streak-30;
      // best-effort and idempotent, after the commit
      if (streak && this.milestones) {
        await this.milestones.recordStreak(userId, streak.current).catch(() => undefined);
      }
      if (finished) await this.milestones?.recordSoloGame?.(userId).catch(() => undefined);
      const view = await this.withWord(userId, updated.rows[0]!);
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

  /**
   * Save a finished game's word to the player's words (SM-2, as the dictionary's own save does) and count it once
   * toward `wordsLearned`. Saving again changes and counts nothing; a full list is the dictionary's refusal, passed on.
   */
  async saveWord(userId: string, gameId: string): Promise<SaveWordResult> {
    const res = await this.pool.query<GameRow>(`SELECT * FROM wordle_games WHERE id = $1 AND user_id = $2`, [gameId, userId]);
    const row = res.rows[0];
    if (!row) return { ok: false, reason: 'not-found' };
    if (row.status === 'playing') return { ok: false, reason: 'not-finished' };
    const entryId = await wordleEntryId(this.pool, row.target);
    if (!entryId) return { ok: false, reason: 'no-entry' };

    const saved = await this.savedWords.save(userId, entryId, await this.userTimeZone(this.pool, userId), this.now());

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // a game's word counts once, however often it is saved (or unsaved and saved again)
      const first = await client.query(`UPDATE wordle_games SET word_saved_at = now() WHERE id = $1 AND word_saved_at IS NULL`, [gameId]);
      if (first.rowCount) {
        await client.query(
          `INSERT INTO wordle_stats (user_id, words_learned, updated_at) VALUES ($1, 1, now())
           ON CONFLICT (user_id) DO UPDATE SET words_learned = wordle_stats.words_learned + 1, updated_at = now()`,
          [userId],
        );
      }
      const stats = await client.query<{ words_learned: number }>(`SELECT words_learned FROM wordle_stats WHERE user_id = $1`, [userId]);
      await client.query('COMMIT');
      return { ok: true, saved, wordsLearned: stats.rows[0]?.words_learned ?? 0 };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---- internals -------------------------------------------------------------

  /**
   * Fold a finished game into the stats and streak inside the caller's transaction. Pays no XP; `xpAwarded` is still
   * sent, always zero, for app versions that read it.
   */
  private async finish(
    client: pg.PoolClient,
    row: GameRow,
    game: WordleGame,
    timeMs: number,
  ): Promise<{ xpAwarded: number; streak: StreakSummary | null }> {
    const won = game.status === 'won';
    const guesses = game.guesses.length;
    const daily = row.mode === 'daily';

    const prevRes = await client.query<StatsRow>(
      `SELECT * FROM wordle_stats WHERE user_id = $1 FOR UPDATE`,
      [row.user_id],
    );
    const prev = prevRes.rows[0] ? fromStatsRow(prevRes.rows[0]) : emptyStats();

    const { stats: nextStats } = applyGameResult(prev, {
      won,
      guesses,
      timeMs,
      daily,
      dayIndex: row.day_index ?? undefined,
    });

    await this.saveStats(client, row.user_id, nextStats);

    // a daily win also counts toward the global daily streak — but not
    // as a day learned, nor towards a freeze or the daily Zêr: those are paid
    // for lessons and practice. The streak it returns still feeds streak-30.
    let streak: StreakSummary | null = null;
    if (daily && won) {
      const tz = await this.userTimeZone(client, row.user_id);
      streak = await this.streaks.recordPlayDay(row.user_id, tz, this.now(), client);
    }

    return { xpAwarded: 0, streak };
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

  private async userTimeZone(client: Pick<pg.Pool, 'query'>, userId: string): Promise<string> {
    const res = await client.query<{ timezone: string }>(
      `SELECT timezone FROM users WHERE id = $1`,
      [userId],
    );
    return res.rows[0]?.timezone ?? 'UTC';
  }

  /** The player's daily game of that day at that difficulty, if there is one. */
  private async dailyGame(userId: string, dayIndex: number, difficulty: Difficulty): Promise<GameRow | null> {
    const res = await this.pool.query<GameRow>(
      `SELECT * FROM wordle_games WHERE user_id = $1 AND mode = 'daily' AND day_index = $2 AND difficulty = $3`,
      [userId, dayIndex, difficulty],
    );
    return res.rows[0] ?? null;
  }

  /** A day's word at a difficulty, falling back to an easier tier when the pool is empty. */
  private async dailyTarget(difficulty: Difficulty, dayIndex: number): Promise<{ target: string; difficulty: Difficulty } | null> {
    const order = [difficulty, ...HARDER_TO_EASIER.filter((d) => d !== difficulty)];
    // the word list read once, and each tier's pool cut from it (an empty tier used to read it all again)
    const words = await loadWordlePool(this.pool);
    for (const tier of order) {
      const pool = filterByDifficulty(words, tier);
      if (pool.length === 0) continue;
      return { target: await this.scheduledWord(tier, dayIndex, pool), difficulty: tier };
    }
    return null;
  }

  /**
   * A day's word at a difficulty as the schedule (`wordle_daily`) holds it. The first player to ask sets it, and it
   * stays that day's word however the pool changes (an added word reorders the permutation `pickDailyWord` walks). Days
   * played before the schedule existed keep their word. A new word skips every word set in the last `dailyRepeatWindow`
   * days.
   */
  private async scheduledWord(difficulty: Difficulty, dayIndex: number, pool: readonly string[]): Promise<string> {
    const set = await this.pool.query<{ word: string }>(`SELECT word FROM wordle_daily WHERE day_index = $1 AND difficulty = $2`, [
      dayIndex,
      difficulty,
    ]);
    if (set.rows[0]) return set.rows[0].word;

    const played = await this.pool.query<{ target: string }>(
      `SELECT target FROM wordle_games WHERE mode = 'daily' AND day_index = $1 AND difficulty = $2 ORDER BY started_at LIMIT 1`,
      [dayIndex, difficulty],
    );
    let word = played.rows[0]?.target ?? null;
    if (!word) {
      const recent = await this.pool.query<{ word: string }>(
        `SELECT word FROM wordle_daily WHERE difficulty = $1 AND day_index >= $2 AND day_index < $3`,
        [difficulty, dayIndex - dailyRepeatWindow(pool.length), dayIndex],
      );
      word = pickDailyWord(pool, dayIndex, difficulty, new Set(recent.rows.map((r) => r.word)))!;
    }
    // two first asks at once: one sets the day's word, and both are given it
    await this.pool.query(`INSERT INTO wordle_daily (day_index, difficulty, word) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [
      dayIndex,
      difficulty,
      word,
    ]);
    const kept = await this.pool.query<{ word: string }>(`SELECT word FROM wordle_daily WHERE day_index = $1 AND difficulty = $2`, [
      dayIndex,
      difficulty,
    ]);
    return kept.rows[0]?.word ?? word;
  }

  /**
   * A practice word: random, falling back to an easier tier when the pool is empty, avoiding the player's recent
   * targets while the band has others.
   */
  private async practiceTarget(userId: string, difficulty: Difficulty): Promise<{ target: string; difficulty: Difficulty } | null> {
    const order = [difficulty, ...HARDER_TO_EASIER.filter((d) => d !== difficulty)];
    const [words, recent] = await Promise.all([loadWordlePool(this.pool), recentTargets(this.pool, [userId])]);
    for (const tier of order) {
      const pool = filterByDifficulty(words, tier);
      if (pool.length === 0) continue;
      const fresh = pool.filter((w) => !recent.has(w));
      const from = fresh.length > 0 ? fresh : pool;
      return { target: from[Math.floor(Math.random() * from.length)]!, difficulty: tier };
    }
    return null;
  }

  /** The view of a game, with the answer's card once it is finished. */
  private async withWord(userId: string, row: GameRow): Promise<WordleGameView> {
    const view = this.toView(row);
    if (row.status === 'playing') return view;
    const [meanings, entryId] = await Promise.all([meaningsOf(this.pool, 'kmr', [row.target]), wordleEntryId(this.pool, row.target)]);
    const saved = entryId ? await this.savedWords.isSaved(userId, entryId) : false;
    view.word = { entryId, meanings: meanings.get(row.target) ?? {}, saved };
    return view;
  }

  /**
   * Difficulty pool: the Kurmancî game words of the right letter length, in stable order (word-pool.ts: never Soranî,
   * never a letter the keyboard lacks).
   */
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
      word: null,
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
