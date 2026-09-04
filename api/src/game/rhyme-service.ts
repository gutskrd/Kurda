import type pg from 'pg';
import { XpService } from '../xp/service.js';
import {
  evaluateSubmission,
  InMemoryLexicon,
  normalizeWord,
  type Dialect,
  type RhymeResult,
  type RhymeQuality,
} from './rhyme.js';

/** Answer window for a training round. */
const WINDOW_MS = 60_000;
/** XP per accepted rhyme, capped — training is low-stakes practice. */
const XP_PER_RHYME = 5;
const MAX_XP = 30;

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
 * Rhyming Words — training (solo) backend (KUR-299). Server-authoritative: the
 * game holds the prompt + a timed window; each submission is scored by the #298
 * engine against the dictionary (the "is it a real word" lexicon) and the pure
 * rhyme phonetics. Finishing awards a small, idempotent XP amount (#030).
 */
export class RhymeService {
  private readonly xp: XpService;
  private readonly now: () => Date;

  constructor(
    private readonly pool: pg.Pool,
    deps: { xp?: XpService; now?: () => Date } = {},
  ) {
    this.xp = deps.xp ?? new XpService(pool);
    this.now = deps.now ?? (() => new Date());
  }

  /** Start a training round with a random dictionary prompt. */
  async startTraining(userId: string, dialect: Dialect = 'kurmanci'): Promise<StartResult> {
    const picked = await this.pool.query<{ headword: string }>(
      `SELECT headword FROM dict_entries
        WHERE headword_normalized <> ''
          -- prefer curated prompts; fall back to any word while none are marked,
          -- so rounds keep working before anyone has curated
          AND (is_rhyme_prompt OR NOT EXISTS (SELECT 1 FROM dict_entries WHERE is_rhyme_prompt))
        ORDER BY random() LIMIT 1`,
    );
    const prompt = picked.rows[0]?.headword;
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
   * Score one submission. A rejected guess (not a word / doesn't rhyme / dup /
   * the prompt) does not change the score. Submitting after the window closes
   * ends the game (and awards XP) instead of scoring.
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
        const view = this.toView({ ...row, status: 'ended' });
        view.xpAwarded = xpAwarded;
        return {
          ok: true,
          game: view,
          result: { accepted: false, quality: 'none', points: 0, normalized: normalizeWord(word), reason: 'no-rhyme' },
        };
      }

      const normalized = normalizeWord(word);
      const known = await this.wordExists(client, normalized);
      const lexicon = new InMemoryLexicon(known ? [{ word: normalized, dialect: row.dialect }] : []);

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
        { lexicon, overrideQuality },
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

  /** End the round early (e.g. player taps Finish); awards XP. */
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
      const view = this.toView({ ...row, status: 'ended' });
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
    const amount = Math.min(MAX_XP, row.accepted * XP_PER_RHYME);
    // idempotent per game; award() no-ops when amount <= 0
    await this.xp.award({ userId: row.user_id, source: 'rhyme', amount, refId: `training:${row.id}` }, client);
    return amount;
  }

  private async wordExists(executor: Pick<pg.Pool, 'query'>, normalized: string): Promise<boolean> {
    if (!normalized) return false;
    const res = await executor.query<{ exists: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM dict_entries WHERE headword_normalized = $1) AS exists`,
      [normalized],
    );
    return res.rows[0]?.exists ?? false;
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
    };
  }
}
