import type pg from 'pg';
import { pickRhymePrompt } from './rhyme-prompt.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { filterText } from '../moderation/filter.js';
import { evaluateSubmission, normalizeWord, rhymeWordKey, type Dialect, type RhymeResult, type RhymeQuality } from './rhyme.js';
import { missedRhymes, rhymeAvailability, rhymeLexicon, type RhymeDialectAvailability, type RhymeHint } from './rhyme-words.js';

/** Answer window for a training round. */
const WINDOW_MS = 60_000;
export type RhymeMode = 'training';

/** Client-safe view of a training game. */
export interface RhymeGameView {
  id: string;
  mode: RhymeMode;
  dialect: Dialect;
  prompt: string;
  windowMs: number;
  remainingMs: number;
  usedWords: string[];
  score: number;
  accepted: number;
  status: 'active' | 'ended';
  xpAwarded: number | null;
  /** once the round has ended: rhymes the player did not find, with their meanings; null while it runs */
  missed: RhymeHint[] | null;
}

export type StartResult = { ok: true; game: RhymeGameView } | { ok: false; reason: 'empty-lexicon' };
export type SubmitResult =
  | { ok: true; game: RhymeGameView; result: RhymeResult }
  | { ok: false; reason: 'not-found' | 'ended' };

interface GameRow {
  id: string;
  user_id: string;
  mode: RhymeMode;
  dialect: Dialect;
  prompt: string;
  window_ms: number;
  used_words: string[];
  score: number;
  accepted: number;
  status: 'active' | 'ended';
  started_at: Date;
  ended_at: Date | null;
}

/**
 * Rhyme training (solo), server-authoritative: the game holds the prompt and a timed window, and each submission is
 * scored against the dictionary and the pure rhyme phonetics. Finishing pays no XP (XP is for lessons and games with
 * other people); `xpAwarded` is still sent, always zero, for app versions that read it.
 */
export class RhymeService {
  private readonly now: () => Date;
  private readonly milestones?: Pick<MilestoneRecorder, 'recordSoloGame'>;

  constructor(
    private readonly pool: pg.Pool,
    deps: { now?: () => Date; milestones?: Pick<MilestoneRecorder, 'recordSoloGame'> } = {},
  ) {
    this.now = deps.now ?? (() => new Date());
    this.milestones = deps.milestones;
  }

  /** A round ended and committed: the badges count it (best-effort; it never fails the round). */
  private async finished(userId: string): Promise<void> {
    await this.milestones?.recordSoloGame?.(userId).catch(() => undefined);
  }

  /** Which dialects have enough prompts to be offered (rhyme-words.ts), for the apps to show the rest as coming soon. */
  async availability(): Promise<Record<Dialect, RhymeDialectAvailability>> {
    return rhymeAvailability(this.pool);
  }

  /** Start a training round with a random prompt in the round's dialect. */
  async startTraining(userId: string, dialect: Dialect = 'kurmanci'): Promise<StartResult> {
    const prompt = await pickRhymePrompt(this.pool, dialect);
    if (!prompt) return { ok: false, reason: 'empty-lexicon' };

    const inserted = await this.pool.query<GameRow>(
      `INSERT INTO rhyme_games (user_id, mode, dialect, prompt, window_ms, used_words)
       VALUES ($1, 'training', $2, $3, $4, '[]'::jsonb)
       RETURNING *`,
      [userId, dialect, prompt, WINDOW_MS],
    );
    return { ok: true, game: this.toView(inserted.rows[0]!) };
  }

  /**
   * Score one submission. A rejected guess (not a word, no rhyme, duplicate, the prompt itself) leaves the score
   * unchanged. A submission after the window closes ends the game instead.
   */
  async submit(userId: string, gameId: string, word: string): Promise<SubmitResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<GameRow>(
        `SELECT * FROM rhyme_games WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [gameId, userId],
      );
      const row = res.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not-found' };
      }
      if (row.status !== 'active') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'ended' };
      }

      const elapsedMs = this.now().getTime() - row.started_at.getTime();
      if (elapsedMs >= row.window_ms) {
        const xpAwarded = await this.finish(client, row);
        await client.query('COMMIT');
        await this.finished(userId);
        const view = await this.endedView({ ...row, status: 'ended' });
        view.xpAwarded = xpAwarded;
        return {
          ok: true,
          game: view,
          result: { accepted: false, quality: 'none', points: 0, normalized: normalizeWord(word), reason: 'no-rhyme' },
        };
      }

      const normalized = rhymeWordKey(word, row.dialect);
      const words = await rhymeLexicon(client, row.dialect, normalized);

      // an admin's explicit verdict for this exact pair, if one exists
      const override = await client.query<{ quality: string }>(
        `SELECT quality FROM rhyme_overrides WHERE prompt_normalized = $1 AND rhyme_normalized = $2`,
        [normalizeWord(row.prompt), normalized],
      );
      const overrideQuality = override.rows[0]
        ? () => override.rows[0]!.quality as RhymeQuality
        : undefined;
      const result = evaluateSubmission(
        {
          prompt: row.prompt,
          submission: word,
          elapsedMs,
          windowMs: row.window_ms,
          dialect: row.dialect,
          usedWords: row.used_words,
        },
        // a round played alone is still a round of words on a screen: the word filter applies here as in a match
        { ...words, overrideQuality, isProfane: (w) => filterText(w).flagged },
      );

      let updated = row;
      if (result.accepted) {
        const nextUsed = [...row.used_words, result.normalized];
        const u = await client.query<GameRow>(
          `UPDATE rhyme_games SET used_words = $2::jsonb, score = score + $3, accepted = accepted + 1
           WHERE id = $1 RETURNING *`,
          [gameId, JSON.stringify(nextUsed), result.points],
        );
        updated = u.rows[0]!;
      }

      await client.query('COMMIT');
      return { ok: true, game: this.toView(updated), result };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** End the round early (e.g. player taps Finish). */
  async end(userId: string, gameId: string): Promise<SubmitResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query<GameRow>(
        `SELECT * FROM rhyme_games WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [gameId, userId],
      );
      const row = res.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not-found' };
      }
      if (row.status !== 'active') {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'ended' };
      }
      const xpAwarded = await this.finish(client, row);
      await client.query('COMMIT');
      await this.finished(userId);
      const view = await this.endedView({ ...row, status: 'ended' });
      view.xpAwarded = xpAwarded;
      return {
        ok: true,
        game: view,
        result: { accepted: false, quality: 'none', points: 0, normalized: '', reason: 'no-rhyme' },
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---- internals -------------------------------------------------------------

  private async finish(client: pg.PoolClient, row: GameRow): Promise<number> {
    await client.query(`UPDATE rhyme_games SET status = 'ended', ended_at = now() WHERE id = $1`, [row.id]);
    // nothing is paid for a round played alone
    return 0;
  }

  /** The view of a round that has ended, with the rhymes the player missed. */
  private async endedView(row: GameRow): Promise<RhymeGameView> {
    const view = this.toView(row);
    view.missed = await missedRhymes(this.pool, row.dialect, row.prompt, row.used_words).catch(() => []);
    return view;
  }

  private toView(row: GameRow): RhymeGameView {
    const remainingMs =
      row.status === 'ended'
        ? 0
        : Math.max(0, row.window_ms - (this.now().getTime() - row.started_at.getTime()));
    return {
      id: row.id,
      mode: row.mode,
      dialect: row.dialect,
      prompt: row.prompt,
      windowMs: row.window_ms,
      remainingMs,
      usedWords: row.used_words,
      score: row.score,
      accepted: row.accepted,
      status: row.status,
      xpAwarded: null,
      missed: null,
    };
  }
}
