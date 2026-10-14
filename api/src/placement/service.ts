import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { checkAnswer, sanitizeExercise } from '../content/exercises.js';
import type { ExerciseType } from '../content/repository.js';
import { lessonAudioFor } from '../lessonaudio/delivery.js';
import {
  PLACEMENT_START_LEVEL,
  isComplete,
  nextLevel,
  pickCandidate,
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
  /** native recordings from the audio studio, where there are any */
  modelAudioUrl?: string;
  audio?: Record<string, string>;
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

interface ExerciseRow {
  id: string;
  type: ExerciseType;
  payload: unknown;
}

/** The seed a placement exercise is shuffled and graded with. */
function exerciseSeed(sessionId: string, exerciseId: string): string {
  return `${sessionId}:${exerciseId}`;
}

/**
 * Adaptive placement (KUR-039): walk skill levels (harder on correct, easier
 * on wrong) drawing one question per step from the level's exercises, then
 * unlock skills up to the highest level answered correctly. Sessions resume;
 * unlock is written only on completion so quitting never partially unlocks.
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

  /**
   * Draw the exercise to ask at a level (`pickCandidate`): any exercise of the
   * learner-visible (highest published) version of the skill's lessons, except
   * speaking — a self-rated recording would let anyone climb by tapping "good".
   * `seed` is the session and the question number, so a resumed question is the
   * same one.
   */
  private async pickExercise(
    skills: Array<{ skillId: string; level: number }>,
    level: number,
    seed: string,
    alreadyAsked: string[],
  ): Promise<string | null> {
    const skill = skills.find((s) => s.level === level);
    if (!skill) return null;
    const ex = await this.pool.query<{ id: string }>(
      `SELECT e.id FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       WHERE l.skill_id = $1 AND l.status = 'published' AND e.type <> 'speaking'
         AND l.version = (
           SELECT max(l2.version) FROM lessons l2
           WHERE l2.skill_id = l.skill_id AND l2.position = l.position AND l2.status = 'published'
         )
       ORDER BY e.id ASC`,
      [skill.skillId],
    );
    const ids = ex.rows.map((r) => r.id);
    const index = pickCandidate(ids, seed, alreadyAsked);
    return index >= 0 ? ids[index]! : null;
  }

  /** The asked exercise as the client sees it: answer stripped, options shuffled. */
  private async question(sessionId: string, exerciseId: string | null, level: number): Promise<PlacementQuestion | null> {
    if (!exerciseId) return null;
    const res = await this.pool.query<ExerciseRow>(
      `SELECT id, type, payload FROM exercises WHERE id = $1`,
      [exerciseId],
    );
    const row = res.rows[0];
    if (!row) return null;
    const [audio] = await lessonAudioFor(this.pool, [row]);
    return {
      exerciseId: row.id,
      level,
      type: row.type,
      ...sanitizeExercise(row.type, row.payload, exerciseSeed(sessionId, row.id)),
      ...audio,
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
      const created = await this.pool.query<SessionRow>(
        `INSERT INTO placement_sessions (user_id, course_id, current_level)
         VALUES ($1, $2, $3)
         RETURNING id, course_id, current_level, current_exercise_id, history, completed_at`,
        [userId, courseId, level],
      );
      session = created.rows[0]!;
      // the first question is drawn with the new session's own seed
      const first = await this.pickExercise(skills, level, `${session.id}:0`, []);
      await this.pool.query(`UPDATE placement_sessions SET current_exercise_id = $2 WHERE id = $1`, [
        session.id,
        first,
      ]);
      session.current_exercise_id = first;
    }

    // resume shows the stored question, never a fresh draw
    const question = await this.question(session.id, session.current_exercise_id, session.current_level);
    return { sessionId: session.id, asked: session.history.length, maxLevel, question };
  }

  /**
   * Grade the current question and advance (or finish + unlock).
   *
   * Seeds and writes use the stored session's id, never the one in the URL:
   * Postgres finds a session by its id in capitals too, but a seed is text, and
   * an answer graded under a seed its options were not shown with is mapped
   * back to the wrong option.
   */
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

    const result = checkAnswer(ex.type, ex.payload, answer, exerciseSeed(session.id, exerciseId));
    const history: PlacementStep[] = [
      ...session.history,
      { level: session.current_level, correct: result.accepted, exerciseId },
    ];

    const skills = await this.orderedSkills(session.course_id);
    const maxLevel = skills.length;

    if (isComplete(history)) {
      const placed = placedLevel(history);
      await this.pool.query(
        `UPDATE placement_sessions SET history = $2, completed_at = now(), placed_level = $3, current_exercise_id = NULL
         WHERE id = $1`,
        [session.id, JSON.stringify(history), placed],
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
    const asked = history.flatMap((step) => (step.exerciseId ? [step.exerciseId] : []));
    const nextId = await this.pickExercise(skills, level, `${session.id}:${history.length}`, asked);
    await this.pool.query(
      `UPDATE placement_sessions SET history = $2, current_level = $3, current_exercise_id = $4 WHERE id = $1`,
      [session.id, JSON.stringify(history), level, nextId],
    );
    return { correct: result.accepted, done: false, question: await this.question(session.id, nextId, level) };
  }
}
