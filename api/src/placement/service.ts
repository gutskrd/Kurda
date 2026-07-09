import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { checkAnswer, sanitizeExercise } from '../content/exercises.js';
import type { ExerciseType } from '../content/repository.js';
import {
  PLACEMENT_START_LEVEL,
  isComplete,
  nextLevel,
  placedLevel,
  type PlacementStep,
} from './placement.js';

export interface PlacementQuestion {
  exerciseId: string;
  level: number;
  type: ExerciseType;
  prompt?: string;
  options?: string[];
  lefts?: string[];
  rights?: string[];
  audioUrl?: string;
}

export interface PlacementView {
  sessionId: string;
  asked: number;
  maxLevel: number;
  question: PlacementQuestion | null;
}

export interface PlacementAnswerResult {
  correct: boolean;
  done: boolean;
  question: PlacementQuestion | null;
  placedLevel?: number;
  unlockedThrough?: number;
}

interface SessionRow {
  id: string;
  course_id: string;
  current_level: number;
  current_exercise_id: string | null;
  history: PlacementStep[];
  completed_at: Date | null;
}

/**
 * Adaptive placement (KUR-039): walk skill levels (harder on correct, easier
 * on wrong) drawing one question per level, then unlock skills up to the
 * highest level answered correctly. Sessions resume; unlock is written only
 * on completion so quitting never partially unlocks.
 */
export class PlacementService {
  constructor(private readonly pool: pg.Pool) {}

  /** Skills of a course in learning order; level is the 1-based ordinal. */
  private async orderedSkills(courseId: string): Promise<Array<{ skillId: string; level: number }>> {
    const rows = await this.pool.query<{ id: string }>(
      `SELECT s.id FROM skills s
       JOIN units u ON u.id = s.unit_id
       WHERE u.course_id = $1
       ORDER BY u.position ASC, s.position ASC`,
      [courseId],
    );
    return rows.rows.map((r, i) => ({ skillId: r.id, level: i + 1 }));
  }

  /** Pick a question for a level: an exercise from a published lesson there. */
  private async questionForLevel(
    skills: Array<{ skillId: string; level: number }>,
    level: number,
    seed: string,
  ): Promise<PlacementQuestion | null> {
    const skill = skills.find((s) => s.level === level);
    if (!skill) return null;
    const ex = await this.pool.query<{ id: string; type: ExerciseType; payload: unknown }>(
      `SELECT e.id, e.type, e.payload FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       WHERE l.skill_id = $1 AND l.status = 'published'
       ORDER BY l.position ASC, e.position ASC
       LIMIT 1`,
      [skill.skillId],
    );
    const row = ex.rows[0];
    if (!row) return null;
    return {
      exerciseId: row.id,
      level,
      type: row.type,
      ...sanitizeExercise(row.type, row.payload, `${seed}:${row.id}`),
    };
  }

  private async load(sessionId: string, userId: string): Promise<SessionRow> {
    const res = await this.pool.query<SessionRow>(
      `SELECT id, course_id, current_level, current_exercise_id, history, completed_at
       FROM placement_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    const row = res.rows[0];
    if (!row) throw new AppError('PLACEMENT_NOT_FOUND', 404, 'placement session not found');
    return row;
  }

  /** Start a placement, or resume the active one. `restart` abandons it first. */
  async start(userId: string, courseId: string, restart = false): Promise<PlacementView> {
    const skills = await this.orderedSkills(courseId);
    const maxLevel = skills.length;
    if (maxLevel === 0) throw new AppError('COURSE_EMPTY', 409, 'course has no skills');

    if (restart) {
      await this.pool.query(
        `DELETE FROM placement_sessions WHERE user_id = $1 AND course_id = $2 AND completed_at IS NULL`,
        [userId, courseId],
      );
    }

    const active = await this.pool.query<SessionRow>(
      `SELECT id, course_id, current_level, current_exercise_id, history, completed_at
       FROM placement_sessions WHERE user_id = $1 AND course_id = $2 AND completed_at IS NULL`,
      [userId, courseId],
    );
    let session = active.rows[0];

    if (!session) {
      const level = Math.min(PLACEMENT_START_LEVEL, maxLevel);
      const q = await this.questionForLevel(skills, level, 'seed');
      const created = await this.pool.query<SessionRow>(
        `INSERT INTO placement_sessions (user_id, course_id, current_level, current_exercise_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, course_id, current_level, current_exercise_id, history, completed_at`,
        [userId, courseId, level, q?.exerciseId ?? null],
      );
      session = created.rows[0]!;
    }

    const question = await this.questionForLevel(skills, session.current_level, session.id);
    return { sessionId: session.id, asked: session.history.length, maxLevel, question };
  }

  /** Grade the current question and advance (or finish + unlock). */
  async answer(
    sessionId: string,
    userId: string,
    exerciseId: string,
    answer: unknown,
  ): Promise<PlacementAnswerResult> {
    const session = await this.load(sessionId, userId);
    if (session.completed_at) throw new AppError('PLACEMENT_COMPLETED', 409, 'placement already completed');
    if (session.current_exercise_id !== exerciseId) {
      throw new AppError('WRONG_QUESTION', 409, 'answer does not match the current question');
    }

    const exRes = await this.pool.query<{ type: ExerciseType; payload: unknown }>(
      `SELECT type, payload FROM exercises WHERE id = $1`,
      [exerciseId],
    );
    const ex = exRes.rows[0];
    if (!ex) throw new AppError('WRONG_QUESTION', 404, 'question no longer exists');

    const result = checkAnswer(ex.type, ex.payload, answer);
    const history: PlacementStep[] = [...session.history, { level: session.current_level, correct: result.accepted }];

    const skills = await this.orderedSkills(session.course_id);
    const maxLevel = skills.length;

    if (isComplete(history)) {
      const placed = placedLevel(history);
      await this.pool.query(
        `UPDATE placement_sessions SET history = $2, completed_at = now(), placed_level = $3, current_exercise_id = NULL
         WHERE id = $1`,
        [sessionId, JSON.stringify(history), placed],
      );
      // unlock — written only here, so a quit never partially unlocks
      await this.pool.query(
        `INSERT INTO user_course_progress (user_id, course_id, unlocked_through_position, placed_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (user_id, course_id) DO UPDATE SET
           unlocked_through_position = GREATEST(user_course_progress.unlocked_through_position, EXCLUDED.unlocked_through_position),
           placed_at = now()`,
        [userId, session.course_id, placed],
      );
      return { correct: result.accepted, done: true, question: null, placedLevel: placed, unlockedThrough: placed };
    }

    const level = nextLevel(session.current_level, result.accepted, maxLevel);
    const question = await this.questionForLevel(skills, level, `${sessionId}:${history.length}`);
    await this.pool.query(
      `UPDATE placement_sessions SET history = $2, current_level = $3, current_exercise_id = $4 WHERE id = $1`,
      [sessionId, JSON.stringify(history), level, question?.exerciseId ?? null],
    );
    return { correct: result.accepted, done: false, question };
  }
}
