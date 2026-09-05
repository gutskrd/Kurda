import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import type { XpService } from '../xp/service.js';
import { raceXp, scoreRace, type RaceScore } from './race.js';

/**
 * Typing race (solo time trial).
 *
 * The server hands out a text and remembers when it did. Speed is computed from
 * that timestamp and the text the racer submits — never from a duration the
 * client reports, which would make the leaderboard a fiction.
 */

export interface RaceText {
  id: string;
  title: string;
  body: string;
  language: string;
  difficulty: number;
  active: boolean;
}

export interface RaceGame {
  id: string;
  text: { id: string; title: string; body: string; difficulty: number };
  startedAt: string;
}

export interface RaceResult extends RaceScore {
  elapsedMs: number;
  xpAwarded: number;
}

/** A finished race cannot be replayed, so a second submit is a distinct failure. */
export type FinishResult =
  | { ok: true; result: RaceResult }
  | { ok: false; reason: 'not-found' | 'already-finished' };

export class RaceService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: { xp?: XpService } = {},
  ) {}

  /**
   * Start a race on a random active text, optionally of one difficulty.
   *
   * Returns null when the pool is empty rather than inventing a text — an admin
   * has to add one, and the UI says so instead of showing an empty race.
   */
  async start(userId: string, difficulty?: number): Promise<RaceGame | null> {
    const text = await this.pool.query<{ id: string; title: string; body: string; difficulty: number }>(
      `SELECT id, title, body, difficulty FROM race_texts
        WHERE active AND ($1::int IS NULL OR difficulty = $1)
        ORDER BY random() LIMIT 1`,
      [difficulty ?? null],
    );
    const row = text.rows[0];
    if (!row) return null;

    const game = await this.pool.query<{ id: string; started_at: Date }>(
      `INSERT INTO race_games (user_id, text_id) VALUES ($1, $2) RETURNING id, started_at`,
      [userId, row.id],
    );
    return {
      id: game.rows[0]!.id,
      text: { id: row.id, title: row.title, body: row.body, difficulty: row.difficulty },
      startedAt: game.rows[0]!.started_at.toISOString(),
    };
  }

  /**
   * Finish a race: score what was typed against the text, from the server's own
   * clock, and award XP once.
   */
  async finish(userId: string, gameId: string, typed: string): Promise<FinishResult> {
    const row = await this.pool.query<{
      started_at: Date;
      finished_at: Date | null;
      body: string;
    }>(
      `SELECT g.started_at, g.finished_at, t.body
         FROM race_games g JOIN race_texts t ON t.id = g.text_id
        WHERE g.id = $1 AND g.user_id = $2`,
      [gameId, userId],
    );
    const game = row.rows[0];
    if (!game) return { ok: false, reason: 'not-found' };
    if (game.finished_at) return { ok: false, reason: 'already-finished' };

    const elapsedMs = Date.now() - game.started_at.getTime();
    const score = scoreRace({ target: game.body, typed, elapsedMs });
    const xpAwarded = raceXp(score);

    await this.pool.query(
      `UPDATE race_games
          SET finished_at = now(), typed = $2, wpm = $3, accuracy = $4, score = $5, xp_awarded = $6
        WHERE id = $1`,
      [gameId, typed, score.wpm, score.accuracy, score.score, xpAwarded],
    );

    if (xpAwarded > 0 && this.deps.xp) {
      // (source, refId) is unique, so a retry cannot pay twice
      await this.deps.xp
        .award({ userId, source: 'race', amount: xpAwarded, refId: gameId })
        .catch(() => undefined);
    }

    return { ok: true, result: { ...score, elapsedMs, xpAwarded } };
  }

  /** A racer's best runs, newest first — the "how am I doing" list. */
  async best(userId: string, limit = 10): Promise<Array<{ title: string; wpm: number; accuracy: number; at: string }>> {
    const rows = await this.pool.query<{ title: string; wpm: string; accuracy: string; finished_at: Date }>(
      `SELECT t.title, g.wpm, g.accuracy, g.finished_at
         FROM race_games g JOIN race_texts t ON t.id = g.text_id
        WHERE g.user_id = $1 AND g.finished_at IS NOT NULL
        ORDER BY g.score DESC NULLS LAST, g.finished_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows.rows.map((r) => ({
      title: r.title,
      wpm: Number(r.wpm),
      accuracy: Number(r.accuracy),
      at: r.finished_at.toISOString(),
    }));
  }
}

/** Admin curation of the texts a race draws from. */
export class RaceTextService {
  constructor(private readonly pool: pg.Pool) {}

  async list(): Promise<RaceText[]> {
    const rows = await this.pool.query<{
      id: string; title: string; body: string; language: string; difficulty: number; active: boolean;
    }>(`SELECT id, title, body, language, difficulty, active FROM race_texts ORDER BY difficulty, title`);
    return rows.rows;
  }

  async create(input: Omit<RaceText, 'id'>): Promise<RaceText> {
    const res = await this.pool.query<RaceText>(
      `INSERT INTO race_texts (title, body, language, difficulty, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, body, language, difficulty, active`,
      [input.title, input.body, input.language, input.difficulty, input.active],
    );
    return res.rows[0]!;
  }

  /** Returns null when there is no such text, so the route can answer 404. */
  async update(id: string, input: Omit<RaceText, 'id'>): Promise<RaceText | null> {
    const res = await this.pool.query<RaceText>(
      `UPDATE race_texts SET title = $2, body = $3, language = $4, difficulty = $5, active = $6
        WHERE id = $1
       RETURNING id, title, body, language, difficulty, active`,
      [id, input.title, input.body, input.language, input.difficulty, input.active],
    );
    return res.rows[0] ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM race_texts WHERE id = $1`, [id]);
    return (res.rowCount ?? 0) > 0;
  }
}

/** Thrown by the route when a race is asked for and the pool is empty. */
export const EMPTY_RACE_POOL = new AppError('EMPTY_RACE_POOL', 503, 'no race texts available yet');
