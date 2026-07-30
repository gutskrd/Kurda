import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { checkAnswer, sanitizeExercise, type Verdict } from '../content/exercises.js';
import type { ExerciseType } from '../content/repository.js';
import { XpService, lessonCompletionXp } from '../xp/service.js';
import { StreakService, type StreakSummary } from '../streaks/service.js';
import { DailyGoalService } from '../goals/service.js';
import { ReviewService } from '../review/service.js';
import { qualityFromVerdict } from '../review/sm2.js';
import { PRACTICE_TARGET, PRACTICE_MIN, selectPracticeItems } from './practice-select.js';

/** Practice sessions earn half the XP a fresh lesson does. */
export const PRACTICE_XP_FACTOR = 0.5;
export const PRACTICE_XP_SOURCE = 'practice_complete';

interface ExerciseRow {
  id: string;
  type: ExerciseType;
  payload: unknown;
}

export interface PracticeExercise {
  id: string;
  type: ExerciseType;
  prompt?: string;
  options?: string[];
  lefts?: string[];
  rights?: string[];
}

export interface PracticeSession {
  sessionId: string;
  exercises: PracticeExercise[];
}

export interface EmptyPractice {
  empty: true;
  /** the next new lesson to try, if any is available */
  suggestion: { lessonId: string; title: string } | null;
}

export interface PracticeAnswerResult {
  verdict: Verdict;
  accepted: boolean;
  correction?: string;
  duplicate: boolean;
}

export interface PracticeResults {
  correct: number;
  total: number;
  accuracy: number;
  xpAwarded: number;
  streak: StreakSummary;
}

/**
 * "Practice" mode (KUR-034): generates a review session from the SR due
 * queue, grades answers (updating SM-2), and awards reduced XP on
 * completion. Empty queues suggest the next new lesson instead.
 */
export class PracticeService {
  private readonly xp: XpService;
  private readonly streaks: StreakService;
  private readonly goals: DailyGoalService;
  private readonly reviews: ReviewService;

  constructor(
    private readonly pool: pg.Pool,
    deps: {
      xp?: XpService;
      streaks?: StreakService;
      goals?: DailyGoalService;
      reviews?: ReviewService;
    } = {},
  ) {
    this.xp = deps.xp ?? new XpService(pool);
    this.streaks = deps.streaks ?? new StreakService(pool);
    this.goals = deps.goals ?? new DailyGoalService(pool);
    this.reviews = deps.reviews ?? new ReviewService(pool);
  }

  /** Build a practice session, or an empty-state suggestion when there's nothing to review. */
  async start(userId: string): Promise<PracticeSession | EmptyPractice> {
    const dueQueue = await this.reviews.queue(userId, new Date(), PRACTICE_TARGET);
    const dueIds = dueQueue.items.map((i) => i.itemId);

    // weakest known words (lowest easiness), not necessarily due — used to pad
    const weak = await this.pool.query<{ item_id: string }>(
      `SELECT item_id FROM review_items
       WHERE user_id = $1 AND item_id <> ALL($2::text[])
       ORDER BY easiness ASC, due_at ASC LIMIT $3`,
      [userId, dueIds, PRACTICE_TARGET],
    );
    const chosen = selectPracticeItems(dueIds, weak.rows.map((r) => r.item_id));

    // only item_ids that still resolve to a real exercise
    const exercises = chosen.length > 0 ? await this.loadExercises(chosen) : [];
    if (exercises.length === 0) {
      return { empty: true, suggestion: await this.nextLesson(userId) };
    }

    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO practice_sessions (user_id, item_ids, total_count)
       VALUES ($1, $2::uuid[], $3) RETURNING id`,
      [userId, exercises.map((e) => e.id), exercises.length],
    );
    const sessionId = created.rows[0]!.id;

    return {
      sessionId,
      exercises: exercises.map((ex) => ({
        id: ex.id,
        type: ex.type,
        ...sanitizeExercise(ex.type, ex.payload, `${sessionId}:${ex.id}`),
      })),
    };
  }

  private async loadExercises(ids: string[]): Promise<ExerciseRow[]> {
    const rows = await this.pool.query<ExerciseRow>(
      `SELECT id, type, payload FROM exercises WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    // preserve the selected order
    const byId = new Map(rows.rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ExerciseRow => r !== undefined);
  }

  private async nextLesson(userId: string): Promise<{ lessonId: string; title: string } | null> {
    const res = await this.pool.query<{ id: string; title_en: string }>(
      `SELECT l.id, l.title_en FROM lessons l
       WHERE l.status = 'published'
         AND EXISTS (SELECT 1 FROM exercises e WHERE e.lesson_id = l.id)
         AND NOT EXISTS (
           SELECT 1 FROM lesson_sessions ls
           WHERE ls.user_id = $1 AND ls.lesson_id = l.id AND ls.completed_at IS NOT NULL
         )
       ORDER BY l.created_at ASC LIMIT 1`,
      [userId],
    );
    const row = res.rows[0];
    return row ? { lessonId: row.id, title: row.title_en } : null;
  }

  private async loadSession(sessionId: string, userId: string) {
    const res = await this.pool.query<{
      id: string;
      item_ids: string[];
      total_count: number;
      correct_count: number;
      completed_at: Date | null;
    }>(
      `SELECT id, item_ids, total_count, correct_count, completed_at
       FROM practice_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    const session = res.rows[0];
    if (!session) throw new AppError('PRACTICE_SESSION_NOT_FOUND', 404, 'practice session not found');
    return session;
  }

  /** Grade one answer, update SM-2, and record it (idempotent per exercise). */
  async submitAnswer(
    sessionId: string,
    userId: string,
    exerciseId: string,
    answer: unknown,
  ): Promise<PracticeAnswerResult> {
    const session = await this.loadSession(sessionId, userId);
    if (session.completed_at) throw new AppError('PRACTICE_SESSION_COMPLETED', 409, 'session already completed');
    if (!session.item_ids.includes(exerciseId)) {
      throw new AppError('EXERCISE_NOT_IN_SESSION', 404, 'exercise is not in this practice session');
    }

    const exRes = await this.pool.query<ExerciseRow>(
      `SELECT id, type, payload FROM exercises WHERE id = $1`,
      [exerciseId],
    );
    const ex = exRes.rows[0];
    if (!ex) throw new AppError('EXERCISE_NOT_IN_SESSION', 404, 'exercise no longer exists');

    const result = checkAnswer(ex.type, ex.payload, answer);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO practice_answers (session_id, exercise_id, verdict, accepted)
         VALUES ($1, $2, $3, $4) ON CONFLICT (session_id, exercise_id) DO NOTHING`,
        [sessionId, exerciseId, result.verdict, result.accepted],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        const existing = await client.query<{ verdict: Verdict; accepted: boolean }>(
          `SELECT verdict, accepted FROM practice_answers WHERE session_id = $1 AND exercise_id = $2`,
          [sessionId, exerciseId],
        );
        await client.query('COMMIT');
        const row = existing.rows[0]!;
        return { verdict: row.verdict, accepted: row.accepted, correction: result.correction, duplicate: true };
      }
      if (result.accepted) {
        await client.query(`UPDATE practice_sessions SET correct_count = correct_count + 1 WHERE id = $1`, [sessionId]);
      }
      // feed SM-2 so practice actually strengthens the item (KUR-033)
      await this.reviews.record(userId, exerciseId, qualityFromVerdict(result.verdict), new Date(), client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    return { verdict: result.verdict, accepted: result.accepted, correction: result.correction, duplicate: false };
  }

  /** Finalize: award reduced XP once, credit streak + daily goal. Idempotent. */
  async complete(sessionId: string, userId: string): Promise<PracticeResults> {
    const session = await this.loadSession(sessionId, userId);
    const correct = session.correct_count;
    const total = session.total_count;
    const accuracy = total > 0 ? correct / total : 0;

    const tzRes = await this.pool.query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
    const timeZone = tzRes.rows[0]?.timezone ?? 'UTC';

    let xpAwarded = 0;
    let streak: StreakSummary | null = null;
    if (!session.completed_at) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const claimed = await client.query(
          `UPDATE practice_sessions SET completed_at = now()
           WHERE id = $1 AND completed_at IS NULL RETURNING id`,
          [sessionId],
        );
        if ((claimed.rowCount ?? 0) > 0) {
          const amount = Math.max(1, Math.round(lessonCompletionXp(accuracy, false) * PRACTICE_XP_FACTOR));
          xpAwarded = await this.xp.award({ userId, source: PRACTICE_XP_SOURCE, amount, refId: sessionId }, client);
          await client.query(`UPDATE practice_sessions SET xp_awarded = $2 WHERE id = $1`, [sessionId, xpAwarded]);
          streak = await this.streaks.recordActivity(userId, timeZone, new Date(), client);
          await this.goals.evaluate(client, userId, timeZone);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    }
    if (streak === null) streak = await this.streaks.get(userId, timeZone);

    return { correct, total, accuracy, xpAwarded, streak };
  }
}

export { PRACTICE_TARGET, PRACTICE_MIN };
