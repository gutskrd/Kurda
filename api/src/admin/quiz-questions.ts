import type pg from 'pg';
import { builtInBank, setBank, type GameQuestion, type QuestionCategory } from '../game/question-bank.js';

/**
 * Admin-managed quiz questions.
 *
 * The quiz used to draw from a constant compiled into the server, so editing a
 * question meant a deploy. Questions now live in `quiz_questions`, and this module
 * keeps the engine's in-memory bank in step with the table.
 *
 * The engine picks questions on a synchronous path, so it cannot query per game.
 * Instead the table is loaded into the bank at startup and again after every
 * change — one query per edit rather than one per match.
 */

export interface QuizQuestionRow {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  category: QuestionCategory;
  level: number;
  active: boolean;
}

interface DbRow {
  id: string;
  prompt: string;
  options: string[];
  correct_index: number;
  category: string;
  level: number;
  active: boolean;
}

const toRow = (r: DbRow): QuizQuestionRow => ({
  id: r.id,
  prompt: r.prompt,
  options: r.options,
  correctIndex: r.correct_index,
  category: r.category as QuestionCategory,
  level: r.level,
  active: r.active,
});

const toGameQuestion = (r: QuizQuestionRow): GameQuestion => ({
  id: r.id,
  prompt: r.prompt,
  options: r.options as [string, string, string, string],
  correctIndex: r.correctIndex,
  category: r.category,
  level: r.level,
});

export class QuizQuestionService {
  constructor(private readonly pool: pg.Pool) {}

  /** Everything, including retired questions, for the admin list. */
  async list(): Promise<QuizQuestionRow[]> {
    const res = await this.pool.query<DbRow>(
      `SELECT id, prompt, options, correct_index, category, level, active
         FROM quiz_questions ORDER BY category, level, created_at`,
    );
    return res.rows.map(toRow);
  }

  async create(input: Omit<QuizQuestionRow, 'id' | 'active'> & { active?: boolean }): Promise<QuizQuestionRow> {
    const res = await this.pool.query<DbRow>(
      `INSERT INTO quiz_questions (prompt, options, correct_index, category, level, active)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6)
       RETURNING id, prompt, options, correct_index, category, level, active`,
      [input.prompt, JSON.stringify(input.options), input.correctIndex, input.category, input.level, input.active ?? true],
    );
    await this.refresh();
    return toRow(res.rows[0]!);
  }

  /** Returns null when no such question, so the route can answer 404. */
  async update(id: string, input: Omit<QuizQuestionRow, 'id'>): Promise<QuizQuestionRow | null> {
    const res = await this.pool.query<DbRow>(
      `UPDATE quiz_questions
          SET prompt = $2, options = $3::jsonb, correct_index = $4, category = $5, level = $6, active = $7
        WHERE id = $1
       RETURNING id, prompt, options, correct_index, category, level, active`,
      [id, input.prompt, JSON.stringify(input.options), input.correctIndex, input.category, input.level, input.active],
    );
    if (!res.rowCount) return null;
    await this.refresh();
    return toRow(res.rows[0]!);
  }

  async remove(id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM quiz_questions WHERE id = $1`, [id]);
    await this.refresh();
    return (res.rowCount ?? 0) > 0;
  }

  /**
   * Load the active questions into the engine's bank. Called at startup and after
   * every edit; an empty table leaves the built-in fallback in place.
   */
  async refresh(): Promise<number> {
    const res = await this.pool.query<DbRow>(
      `SELECT id, prompt, options, correct_index, category, level, active
         FROM quiz_questions WHERE active ORDER BY created_at`,
    );
    const rows = res.rows.map(toRow);
    setBank(rows.map(toGameQuestion));
    return rows.length;
  }

  /**
   * Copy the built-in bank into the table the first time, so the admin panel opens
   * on the existing questions instead of an empty list. Does nothing once any row
   * exists, so it never fights a curator's edits or resurrects deleted questions.
   */
  async seedIfEmpty(): Promise<number> {
    const existing = await this.pool.query(`SELECT 1 FROM quiz_questions LIMIT 1`);
    if (existing.rowCount) return 0;
    let inserted = 0;
    for (const q of builtInBank()) {
      await this.pool.query(
        `INSERT INTO quiz_questions (prompt, options, correct_index, category, level)
         VALUES ($1, $2::jsonb, $3, $4, $5)`,
        [q.prompt, JSON.stringify(q.options), q.correctIndex, q.category, q.level],
      );
      inserted++;
    }
    return inserted;
  }
}
