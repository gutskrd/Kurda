import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { checkAnswer, sanitizeExercise, type Verdict } from './exercises.js';
import type { ExerciseType } from './repository.js';
import { XpService, lessonCompletionXp } from '../xp/service.js';
import { StreakService, type StreakSummary } from '../streaks/service.js';

export const SESSION_TTL_HOURS = 24;
/** XP-ledger source tag for lesson-completion awards. */
export const LESSON_XP_SOURCE = 'lesson_complete';

interface SessionRow {
  id: string;
  user_id: string;
  lesson_id: string;
  total_count: number;
  correct_count: number;
  expires_at: Date;
  completed_at: Date | null;
}

interface ExerciseRow {
  id: string;
  position: number;
  type: ExerciseType;
  payload: unknown;
}

export interface SessionView {
  sessionId: string;
  lessonId: string;
  expiresAt: string;
  completed: boolean;
  exercises: Array<{
    id: string;
    position: number;
    type: ExerciseType;
    /** answer fields stripped (KUR-028) */
    prompt?: string;
    options?: string[];
    lefts?: string[];
    rights?: string[];
  }>;
  /** exercises already answered in this session (resume) */
  answered: Record<string, { verdict: Verdict; accepted: boolean }>;
}

export interface AnswerResult {
  verdict: Verdict;
  accepted: boolean;
  correction?: string;
  /** true when this exercise was already answered (idempotent replay). */
  duplicate: boolean;
}

export interface SessionResults {
  correct: number;
  total: number;
  accuracy: number;
  mistakes: Array<{ exerciseId: string; verdict: Verdict }>;
  /** XP awarded for this completion (0 on a repeat replay). */
  xpAwarded: number;
  /** Streak after this completion counted toward today's goal (KUR-031). */
  streak: StreakSummary;
}

/**
 * Lesson delivery + grading (KUR-028). Sessions pin a lesson id, grade
 * every answer server-side (KUR-027), and record each answer exactly
 * once per (session, exercise).
 */
export class LessonSessionService {
  private readonly xp: XpService;
  private readonly streaks: StreakService;

  constructor(private readonly pool: pg.Pool, xp?: XpService, streaks?: StreakService) {
    this.xp = xp ?? new XpService(pool);
    this.streaks = streaks ?? new StreakService(pool);
  }

  private async exercisesFor(lessonId: string): Promise<ExerciseRow[]> {
    const rows = await this.pool.query<ExerciseRow>(
      `SELECT id, position, type, payload FROM exercises
       WHERE lesson_id = $1 ORDER BY position ASC`,
      [lessonId],
    );
    return rows.rows;
  }

  private async buildView(session: SessionRow): Promise<SessionView> {
    const [exercises, answers] = await Promise.all([
      this.exercisesFor(session.lesson_id),
      this.pool.query<{ exercise_id: string; verdict: Verdict; accepted: boolean }>(
        `SELECT exercise_id, verdict, accepted FROM session_answers WHERE session_id = $1`,
        [session.id],
      ),
    ]);
    const answered: SessionView['answered'] = {};
    for (const a of answers.rows) answered[a.exercise_id] = { verdict: a.verdict, accepted: a.accepted };

    return {
      sessionId: session.id,
      lessonId: session.lesson_id,
      expiresAt: new Date(session.expires_at).toISOString(),
      completed: session.completed_at !== null,
      exercises: exercises.map((ex) => ({
        id: ex.id,
        position: ex.position,
        type: ex.type,
        ...sanitizeExercise(ex.type, ex.payload, `${session.id}:${ex.id}`),
      })),
      answered,
    };
  }

  /** Start a new session or resume the learner's active one for a lesson. */
  async startOrResume(userId: string, lessonId: string): Promise<SessionView> {
    const lesson = await this.pool.query<{ status: string }>(
      `SELECT status FROM lessons WHERE id = $1`,
      [lessonId],
    );
    if (lesson.rowCount === 0) throw new AppError('LESSON_NOT_FOUND', 404, 'lesson not found');
    if (lesson.rows[0]!.status !== 'published') {
      throw new AppError('LESSON_NOT_PUBLISHED', 409, 'lesson is not published');
    }

    const active = await this.pool.query<SessionRow>(
      `SELECT * FROM lesson_sessions
       WHERE user_id = $1 AND lesson_id = $2 AND completed_at IS NULL AND expires_at > now()
       ORDER BY started_at DESC LIMIT 1`,
      [userId, lessonId],
    );
    if (active.rows[0]) return this.buildView(active.rows[0]);

    const total = await this.pool.query<{ n: string }>(
      `SELECT count(*)::text n FROM exercises WHERE lesson_id = $1`,
      [lessonId],
    );
    const totalCount = Number(total.rows[0]!.n);
    if (totalCount === 0) throw new AppError('LESSON_EMPTY', 409, 'lesson has no exercises');

    const created = await this.pool.query<SessionRow>(
      `INSERT INTO lesson_sessions (user_id, lesson_id, total_count, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)
       RETURNING *`,
      [userId, lessonId, totalCount, String(SESSION_TTL_HOURS)],
    );
    return this.buildView(created.rows[0]!);
  }

  private async loadOwnedSession(sessionId: string, userId: string): Promise<SessionRow> {
    const result = await this.pool.query<SessionRow>(
      `SELECT * FROM lesson_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    const session = result.rows[0];
    if (!session) throw new AppError('SESSION_NOT_FOUND', 404, 'session not found');
    return session;
  }

  async view(sessionId: string, userId: string): Promise<SessionView> {
    return this.buildView(await this.loadOwnedSession(sessionId, userId));
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    exerciseId: string,
    answer: unknown,
  ): Promise<AnswerResult> {
    const session = await this.loadOwnedSession(sessionId, userId);
    if (session.completed_at) throw new AppError('SESSION_COMPLETED', 409, 'session already completed');
    if (new Date(session.expires_at).getTime() < Date.now()) {
      throw new AppError('SESSION_EXPIRED', 409, 'session has expired');
    }

    const exercise = await this.pool.query<ExerciseRow>(
      `SELECT id, position, type, payload FROM exercises WHERE id = $1 AND lesson_id = $2`,
      [exerciseId, session.lesson_id],
    );
    const ex = exercise.rows[0];
    if (!ex) throw new AppError('EXERCISE_NOT_IN_LESSON', 404, 'exercise is not in this lesson');

    const result = checkAnswer(ex.type, ex.payload, answer);

    // idempotent per (session, exercise): first answer wins
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO session_answers (session_id, exercise_id, verdict, accepted)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (session_id, exercise_id) DO NOTHING`,
        [sessionId, exerciseId, result.verdict, result.accepted],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        const existing = await client.query<{ verdict: Verdict; accepted: boolean }>(
          `SELECT verdict, accepted FROM session_answers WHERE session_id = $1 AND exercise_id = $2`,
          [sessionId, exerciseId],
        );
        await client.query('COMMIT');
        const row = existing.rows[0]!;
        return {
          verdict: row.verdict,
          accepted: row.accepted,
          correction: result.correction,
          duplicate: true,
        };
      }
      if (result.accepted) {
        await client.query(
          `UPDATE lesson_sessions SET correct_count = correct_count + 1 WHERE id = $1`,
          [sessionId],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    return {
      verdict: result.verdict,
      accepted: result.accepted,
      correction: result.correction,
      duplicate: false,
    };
  }

  /**
   * Finalizes a session and returns the results summary. Idempotent:
   * XP is awarded exactly once, on the transition to completed, keyed on
   * the session id in the ledger. Re-calling returns the same summary but
   * awards no further XP.
   */
  async complete(sessionId: string, userId: string): Promise<SessionResults> {
    const session = await this.loadOwnedSession(sessionId, userId);
    const answers = await this.pool.query<{ exercise_id: string; verdict: Verdict; accepted: boolean }>(
      `SELECT exercise_id, verdict, accepted FROM session_answers WHERE session_id = $1`,
      [sessionId],
    );
    const correct = answers.rows.filter((a) => a.accepted).length;
    const mistakes = answers.rows
      .filter((a) => !a.accepted)
      .map((a) => ({ exerciseId: a.exercise_id, verdict: a.verdict }));
    const accuracy = session.total_count > 0 ? correct / session.total_count : 0;

    const tz = await this.pool.query<{ timezone: string }>(
      `SELECT timezone FROM users WHERE id = $1`,
      [userId],
    );
    const timeZone = tz.rows[0]?.timezone ?? 'UTC';

    let xpAwarded = 0;
    let streak: StreakSummary | null = null;
    if (!session.completed_at) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        // Claim the completion transition; only the winner awards XP + streak.
        const claimed = await client.query(
          `UPDATE lesson_sessions SET completed_at = now()
           WHERE id = $1 AND completed_at IS NULL RETURNING id`,
          [sessionId],
        );
        if ((claimed.rowCount ?? 0) > 0) {
          // Repeat = this learner already completed this lesson before.
          const prior = await client.query<{ n: string }>(
            `SELECT count(*)::text n FROM lesson_sessions
             WHERE user_id = $1 AND lesson_id = $2 AND completed_at IS NOT NULL AND id <> $3`,
            [userId, session.lesson_id, sessionId],
          );
          const isRepeat = Number(prior.rows[0]!.n) > 0;
          const amount = lessonCompletionXp(accuracy, isRepeat);
          xpAwarded = await this.xp.award(
            { userId, source: LESSON_XP_SOURCE, amount, refId: sessionId },
            client,
          );
          // Finishing a lesson meets the daily goal → count today's streak.
          streak = await this.streaks.recordActivity(userId, timeZone, new Date(), client);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    }

    // On a replay (already completed) report the current, settled streak.
    if (streak === null) streak = await this.streaks.get(userId, timeZone);

    return {
      correct,
      total: session.total_count,
      accuracy,
      mistakes,
      xpAwarded,
      streak,
    };
  }
}
