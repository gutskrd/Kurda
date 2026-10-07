import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { checkAnswer, revealExercise, sanitizeExercise, type Verdict } from './exercises.js';
import type { ExerciseType } from './repository.js';
import { XpService, lessonCompletionXp } from '../xp/service.js';
import { StreakService, type StreakSummary } from '../streaks/service.js';
import { DailyGoalService } from '../goals/service.js';
import { ReviewService, feedsReview } from '../review/service.js';
import { qualityFromVerdict } from '../review/sm2.js';
import { lessonAudioFor, modelAudioAfterAnswer } from '../lessonaudio/delivery.js';
import type { MilestoneRecorder } from '../achievements/service.js';

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
    /** native recordings from the audio studio, where there are any */
    audioUrl?: string;
    modelAudioUrl?: string;
    audio?: Record<string, string>;
  }>;
  /** exercises already answered in this session (resume) */
  answered: Record<string, { verdict: Verdict; accepted: boolean }>;
  /** markdown grammar note for this lesson's skill, if any (KUR-038) */
  grammarMd: string | null;
  /**
   * The course's variety of Kurdish ('kurmanji', 'sorani', …), so a client
   * offers the letters this lesson is typed in: ê î û ç ş for Kurmancî, the
   * Soranî letters for a Soranî lesson.
   */
  dialect: string | null;
}

export interface AnswerResult {
  verdict: Verdict;
  accepted: boolean;
  correction?: string;
  /**
   * The native recording of the item's Kurdish, to hear now that it is
   * answered — also on items that could not send it beforehand because it
   * would have said the answer (lessonaudio/delivery.ts).
   */
  modelAudioUrl?: string;
  /** true when this exercise was already answered (idempotent replay). */
  duplicate: boolean;
}

/**
 * A second try at an item, graded exactly as an answer is but never recorded
 * (`retry`), so it carries no `duplicate`: there is nothing it could duplicate.
 */
export type RetryResult = Omit<AnswerResult, 'duplicate'>;

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
   * True only for the first time this learner completes this lesson — any
   * version of it (`LessonSlot`). Rewards that should not be farmable by
   * replaying an easy lesson key on it.
   */
  firstCompletion: boolean;
}

/**
 * Where a lesson sits: its skill and position. Re-importing changed content
 * makes a new lesson row (a new version, with a new id) at the same place, and
 * to a learner that is still the lesson they finished, so whether they have
 * finished it is asked of the place, not of the row.
 */
interface LessonSlot {
  skillId: string;
  position: number;
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
 * The idempotency reference perfect-lesson Gems are paid under: the learner and
 * the lesson's place, so they are paid at most once per learner per lesson,
 * whichever version was played and however the completion was reached.
 */
function perfectLessonRef(slot: LessonSlot, userId: string): string {
  return `${slot.skillId}:${slot.position}:${userId}`;
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
  private readonly milestones?: MilestoneRecorder;

  constructor(
    private readonly pool: pg.Pool,
    deps: {
      xp?: XpService;
      streaks?: StreakService;
      goals?: DailyGoalService;
      reviews?: ReviewService;
      gems?: GemGranter;
      milestones?: MilestoneRecorder;
    } = {},
  ) {
    this.xp = deps.xp ?? new XpService(pool);
    this.streaks = deps.streaks ?? new StreakService(pool);
    this.goals = deps.goals ?? new DailyGoalService(pool);
    this.reviews = deps.reviews ?? new ReviewService(pool);
    this.gems = deps.gems;
    this.milestones = deps.milestones;
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
      // grammar note lives on the lesson's skill (KUR-038); the variety on its course
      this.pool.query<{ grammar_md: string | null; dialect: string | null }>(
        `SELECT s.grammar_md, c.dialect
         FROM lessons l
         JOIN skills s ON s.id = l.skill_id
         JOIN units u ON u.id = s.unit_id
         JOIN courses c ON c.id = u.course_id
         WHERE l.id = $1`,
        [session.lesson_id],
      ),
    ]);
    const answered: SessionView['answered'] = {};
    for (const a of answers.rows) answered[a.exercise_id] = { verdict: a.verdict, accepted: a.accepted };
    const audio = await lessonAudioFor(this.pool, exercises);

    return {
      sessionId: session.id,
      lessonId: session.lesson_id,
      expiresAt: new Date(session.expires_at).toISOString(),
      completed: session.completed_at !== null,
      exercises: exercises.map((ex, i) => ({
        id: ex.id,
        position: ex.position,
        type: ex.type,
        ...sanitizeExercise(ex.type, ex.payload, exerciseSeed(session.id, ex.id)),
        ...audio[i],
      })),
      answered,
      grammarMd: grammar.rows[0]?.grammar_md ?? null,
      dialect: grammar.rows[0]?.dialect ?? null,
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

  /** The learner's session, still open to answers: not completed, not expired. */
  private async loadOpenSession(sessionId: string, userId: string): Promise<SessionRow> {
    const session = await this.loadOwnedSession(sessionId, userId);
    if (session.completed_at) throw new AppError('SESSION_COMPLETED', 409, 'session already completed');
    if (new Date(session.expires_at).getTime() < Date.now()) {
      throw new AppError('SESSION_EXPIRED', 409, 'session has expired');
    }
    return session;
  }

  private async lessonExercise(session: SessionRow, exerciseId: string): Promise<ExerciseRow> {
    const exercise = await this.pool.query<ExerciseRow>(
      `SELECT id, position, type, payload FROM exercises WHERE id = $1 AND lesson_id = $2`,
      [exerciseId, session.lesson_id],
    );
    const ex = exercise.rows[0];
    if (!ex) throw new AppError('EXERCISE_NOT_IN_LESSON', 404, 'exercise is not in this lesson');
    return ex;
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    exerciseId: string,
    answer: unknown,
  ): Promise<AnswerResult> {
    const session = await this.loadOpenSession(sessionId, userId);
    const ex = await this.lessonExercise(session, exerciseId);

    const result = checkAnswer(ex.type, ex.payload, answer, exerciseSeed(session.id, ex.id));
    const modelAudioUrl = await modelAudioAfterAnswer(this.pool, ex.type, ex.payload);
    const heard = modelAudioUrl ? { modelAudioUrl } : {};

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
          ...heard,
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
      ...heard,
      duplicate: false,
    };
  }

  /**
   * Grade a second try at an item and record nothing: no answer row, no
   * accuracy, no XP, no review, no Gems. This is the re-ask a client makes a
   * few exercises after a miss — a retrieval with the right answer still fresh,
   * which is practice, and which the score and the schedule must not count as
   * if it were the first attempt. Graded with the same seed as the answer, so a
   * multiple-choice position means the option it meant the first time.
   *
   * Only an item already answered in this session can be retried. Grading
   * hands back the correction and the model recording, so a retry before the
   * first answer would read every right answer off the server, and the first
   * answer — the one that counts — could then never be wrong.
   */
  async retry(sessionId: string, userId: string, exerciseId: string, answer: unknown): Promise<RetryResult> {
    const session = await this.loadOpenSession(sessionId, userId);
    const ex = await this.lessonExercise(session, exerciseId);
    const answered = await this.pool.query(
      `SELECT 1 FROM session_answers WHERE session_id = $1 AND exercise_id = $2`,
      [session.id, ex.id],
    );
    if ((answered.rowCount ?? 0) === 0) {
      throw new AppError('EXERCISE_NOT_ANSWERED', 409, 'answer this exercise before trying it again');
    }

    const result = checkAnswer(ex.type, ex.payload, answer, exerciseSeed(session.id, ex.id));
    const modelAudioUrl = await modelAudioAfterAnswer(this.pool, ex.type, ex.payload);
    return {
      verdict: result.verdict,
      accepted: result.accepted,
      correction: result.correction,
      ...(modelAudioUrl ? { modelAudioUrl } : {}),
    };
  }

  /**
   * Finalizes a session and returns the results summary. Idempotent:
   * XP is awarded exactly once, on the transition to completed, keyed on
   * the session id in the ledger. Re-calling returns the same summary but
   * awards no further XP.
   *
   * A perfect first completion pays perfect-lesson Gems, keyed on the learner
   * and the lesson's place rather than the session (`perfectLessonRef`): a
   * replay is never a first completion, so an easy lesson cannot be replayed
   * into the daily Gem cap, and a corrected version of a lesson is not a new
   * lesson to be paid for again. Like the XP, they are paid only on the
   * transition to completed. Sessions completed before this rule were paid
   * under their session id, so paying on a repeated call would pay a learner
   * already paid for that completion a second time.
   */
  async complete(sessionId: string, userId: string): Promise<SessionResults> {
    const session = await this.loadOwnedSession(sessionId, userId);
    const slot = await this.slotOf(session.lesson_id);
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
      [session.id],
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
    let claimedNow = false;
    if (!session.completed_at) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        // Claim the completion transition; only the winner awards XP + streak.
        const claimed = await client.query(
          `UPDATE lesson_sessions SET completed_at = now()
           WHERE id = $1 AND completed_at IS NULL RETURNING id`,
          [session.id],
        );
        if ((claimed.rowCount ?? 0) > 0) {
          claimedNow = true;
          // Repeat = this learner already completed this lesson before, in
          // this version or any other.
          const prior = await client.query<{ n: string }>(
            `SELECT count(*)::text n FROM lesson_sessions ls
             JOIN lessons l ON l.id = ls.lesson_id
             WHERE ls.user_id = $1 AND l.skill_id = $2 AND l.position = $3
               AND ls.completed_at IS NOT NULL AND ls.id <> $4`,
            [userId, slot.skillId, slot.position, session.id],
          );
          const isRepeat = Number(prior.rows[0]!.n) > 0;
          firstCompletion = !isRepeat;
          const amount = lessonCompletionXp(accuracy, isRepeat);
          xpAwarded = await this.xp.award(
            { userId, source: LESSON_XP_SOURCE, amount, refId: session.id },
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
    if (firstCompletion === null) firstCompletion = await this.wasFirstCompletion(session.id, userId, slot);

    // Best-effort rewards after the commit, for the call that completed the
    // session only: a failure here never fails the completion, and each is
    // idempotent besides.
    if (this.gems && claimedNow && firstCompletion && accuracy === 1) {
      await this.gems.grant(userId, PERFECT_LESSON_GEM_RULE, perfectLessonRef(slot, userId)).catch(() => undefined);
    }
    if (this.milestones && claimedNow) {
      await this.milestones.recordLessonCompleted(userId, accuracy).catch(() => undefined);
      await this.milestones.recordStreak(userId, streak.current).catch(() => undefined);
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

  /** Where a lesson sits (`LessonSlot`). */
  private async slotOf(lessonId: string): Promise<LessonSlot> {
    const res = await this.pool.query<{ skill_id: string; position: number }>(
      `SELECT skill_id, position FROM lessons WHERE id = $1`,
      [lessonId],
    );
    const row = res.rows[0];
    if (!row) throw new AppError('LESSON_NOT_FOUND', 404, 'lesson not found');
    return { skillId: row.skill_id, position: row.position };
  }

  /**
   * Whether no other session of this lesson — any version of it — by this
   * learner finished before this one.
   */
  private async wasFirstCompletion(sessionId: string, userId: string, slot: LessonSlot): Promise<boolean> {
    const earlier = await this.pool.query(
      `SELECT 1 FROM lesson_sessions other
       JOIN lessons l ON l.id = other.lesson_id
       JOIN lesson_sessions cur ON cur.id = $4
       WHERE other.user_id = $1 AND l.skill_id = $2 AND l.position = $3 AND other.id <> $4
         AND other.completed_at IS NOT NULL AND other.completed_at < cur.completed_at
       LIMIT 1`,
      [userId, slot.skillId, slot.position, sessionId],
    );
    return (earlier.rowCount ?? 0) === 0;
  }
}
