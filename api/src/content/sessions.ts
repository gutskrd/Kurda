import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { checkAnswer, revealExercise, sanitizeExercise, type Verdict } from './exercises.js';
import type { ExerciseType } from './repository.js';
import { XpService, lessonCompletionXp } from '../xp/service.js';
import { StreakService, type StreakSummary } from '../streaks/service.js';
import { DailyGoalService } from '../goals/service.js';
import { ReviewService, feedsReview } from '../review/service.js';
import { qualityFromVerdict } from '../review/sm2.js';

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
  /** markdown grammar note for this lesson's skill, if any (KUR-038) */
  grammarMd: string | null;
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
  /**
   * What was missed, with the question and its right answer, so a results
   * screen can show the answers rather than only that something was wrong.
   */
  mistakes: Array<{ exerciseId: string; verdict: Verdict; prompt?: string; correction?: string }>;
  /** XP awarded for this completion (0 on a repeat replay). */
  xpAwarded: number;
  /** Streak after this completion counted toward today's goal (KUR-031). */
  streak: StreakSummary;
  /**
   * True only for the first time this learner completes this lesson. Rewards
   * that should not be farmable by replaying an easy lesson key on it.
   */
  firstCompletion: boolean;
}

/** Grants Gems for a rule/refId; injected so content stays decoupled (KUR-068). */
export interface GemGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<unknown>;
}

/** The Gem rule a perfect first completion pays out under (KUR-068). */
export const PERFECT_LESSON_GEM_RULE = 'perfect_lesson';

/** The seed a lesson exercise is shuffled and graded with. */
function exerciseSeed(sessionId: string, exerciseId: string): string {
  return `${sessionId}:${exerciseId}`;
}

/**
 * Lesson delivery + grading (KUR-028). Sessions pin a lesson id, grade
 * every answer server-side (KUR-027), and record each answer exactly
 * once per (session, exercise).
 */
export class LessonSessionService {
  private readonly xp: XpService;
  private readonly streaks: StreakService;
  private readonly goals: DailyGoalService;
  private readonly reviews: ReviewService;
  private readonly gems?: GemGranter;

  constructor(
    private readonly pool: pg.Pool,
    deps: {
      xp?: XpService;
      streaks?: StreakService;
      goals?: DailyGoalService;
      reviews?: ReviewService;
      gems?: GemGranter;
    } = {},
  ) {
    this.xp = deps.xp ?? new XpService(pool);
    this.streaks = deps.streaks ?? new StreakService(pool);
    this.goals = deps.goals ?? new DailyGoalService(pool);
    this.reviews = deps.reviews ?? new ReviewService(pool);
    this.gems = deps.gems;
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
    const [exercises, answers, grammar] = await Promise.all([
      this.exercisesFor(session.lesson_id),
      this.pool.query<{ exercise_id: string; verdict: Verdict; accepted: boolean }>(
        `SELECT exercise_id, verdict, accepted FROM session_answers WHERE session_id = $1`,
        [session.id],
      ),
      // grammar note lives on the lesson's skill (KUR-038)
      this.pool.query<{ grammar_md: string | null }>(
        `SELECT s.grammar_md FROM lessons l JOIN skills s ON s.id = l.skill_id WHERE l.id = $1`,
        [session.lesson_id],
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
        ...sanitizeExercise(ex.type, ex.payload, exerciseSeed(session.id, ex.id)),
      })),
      answered,
      grammarMd: grammar.rows[0]?.grammar_md ?? null,
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

    const result = checkAnswer(ex.type, ex.payload, answer, exerciseSeed(session.id, ex.id));

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
      // Feed the answer into spaced repetition (KUR-033), keyed on the
      // exercise until a lexeme model exists (KUR-043). First answer only;
      // never a self-rated speaking answer (`feedsReview`).
      if (feedsReview(ex.type)) {
        const quality = qualityFromVerdict(result.verdict, result.accepted);
        await this.reviews.record(userId, exerciseId, quality, new Date(), client);
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
   *
   * A perfect first completion pays perfect-lesson Gems, keyed on the learner
   * and the lesson rather than the session: a replay is never a first
   * completion, so an easy lesson cannot be replayed into the daily Gem cap.
   */
  async complete(sessionId: string, userId: string): Promise<SessionResults> {
    const session = await this.loadOwnedSession(sessionId, userId);
    const answers = await this.pool.query<{
      exercise_id: string;
      verdict: Verdict;
      accepted: boolean;
      type: ExerciseType;
      payload: unknown;
    }>(
      `SELECT a.exercise_id, a.verdict, a.accepted, e.type, e.payload
       FROM session_answers a JOIN exercises e ON e.id = a.exercise_id
       WHERE a.session_id = $1
       ORDER BY e.position ASC`,
      [sessionId],
    );
    const correct = answers.rows.filter((a) => a.accepted).length;
    const mistakes = answers.rows
      .filter((a) => !a.accepted)
      .map((a) => ({ exerciseId: a.exercise_id, verdict: a.verdict, ...revealExercise(a.type, a.payload) }));
    const accuracy = session.total_count > 0 ? correct / session.total_count : 0;

    const tz = await this.pool.query<{ timezone: string }>(
      `SELECT timezone FROM users WHERE id = $1`,
      [userId],
    );
    const timeZone = tz.rows[0]?.timezone ?? 'UTC';

    let xpAwarded = 0;
    let streak: StreakSummary | null = null;
    let firstCompletion: boolean | null = null;
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
          firstCompletion = !isRepeat;
          const amount = lessonCompletionXp(accuracy, isRepeat);
          xpAwarded = await this.xp.award(
            { userId, source: LESSON_XP_SOURCE, amount, refId: sessionId },
            client,
          );
          // Finishing a lesson meets the daily goal → count today's streak.
          streak = await this.streaks.recordActivity(userId, timeZone, new Date(), client);
          // Credit the daily goal if this XP crossed it (KUR-032). Runs in
          // the same txn so it sees the award above; idempotent.
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

    // On a replay (already completed) report the current, settled streak.
    if (streak === null) streak = await this.streaks.get(userId, timeZone);
    // …and whether that earlier completion was the learner's first of this
    // lesson, so asking twice gives the same answer.
    if (firstCompletion === null) firstCompletion = await this.wasFirstCompletion(sessionId, userId, session.lesson_id);

    // Best-effort rewards after the commit: a failure here never fails the
    // completion, and each is idempotent, so a retried call can only fill in
    // what a failed one missed.
    if (this.gems && firstCompletion && accuracy === 1) {
      await this.gems
        .grant(userId, PERFECT_LESSON_GEM_RULE, `${session.lesson_id}:${userId}`)
        .catch(() => undefined);
    }
    return {
      correct,
      total: session.total_count,
      accuracy,
      mistakes,
      xpAwarded,
      streak,
      firstCompletion,
    };
  }

  /** Whether no other session of this lesson by this learner finished before this one. */
  private async wasFirstCompletion(sessionId: string, userId: string, lessonId: string): Promise<boolean> {
    const earlier = await this.pool.query(
      `SELECT 1 FROM lesson_sessions other
       JOIN lesson_sessions cur ON cur.id = $3
       WHERE other.user_id = $1 AND other.lesson_id = $2 AND other.id <> $3
         AND other.completed_at IS NOT NULL AND other.completed_at < cur.completed_at
       LIMIT 1`,
      [userId, lessonId, sessionId],
    );
    return (earlier.rowCount ?? 0) === 0;
  }
}
