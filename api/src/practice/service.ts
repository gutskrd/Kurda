import type pg from 'pg';
import { AppError } from '../plugins/errors.js';
import { checkAnswer, sanitizeExercise, type Verdict } from '../content/exercises.js';
import type { ExerciseType } from '../content/repository.js';
import { XpService, lessonCompletionXp } from '../xp/service.js';
import { StreakService, type StreakSummary } from '../streaks/service.js';
import { DailyGoalService } from '../goals/service.js';
import { ReviewService, feedsReview } from '../review/service.js';
import { qualityFromVerdict } from '../review/sm2.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { PRACTICE_TARGET, PRACTICE_MIN, selectPracticeItems } from './practice-select.js';
import { lessonAudioFor, modelAudioAfterAnswer } from '../lessonaudio/delivery.js';

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
  /** native recordings from the audio studio, where there are any */
  audioUrl?: string;
  modelAudioUrl?: string;
  audio?: Record<string, string>;
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
  /** the native recording of the item's Kurdish, now that it is answered (as AnswerResult) */
  modelAudioUrl?: string;
  duplicate: boolean;
}

/** A second try at a practice item: graded, never recorded (as the lesson's RetryResult). */
export type PracticeRetryResult = Omit<PracticeAnswerResult, 'duplicate'>;

/** What practice has to offer right now, for a "Review" entry to show before starting one. */
export interface PracticeDue {
  /** items due for review now — what a session takes first */
  due: number;
  /** every item practice could draw on, due or not; 0 means a session would come back empty */
  available: number;
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
  private readonly milestones?: MilestoneRecorder;

  constructor(
    private readonly pool: pg.Pool,
    deps: {
      xp?: XpService;
      streaks?: StreakService;
      goals?: DailyGoalService;
      reviews?: ReviewService;
      milestones?: MilestoneRecorder;
    } = {},
  ) {
    this.xp = deps.xp ?? new XpService(pool);
    this.streaks = deps.streaks ?? new StreakService(pool);
    this.goals = deps.goals ?? new DailyGoalService(pool);
    this.reviews = deps.reviews ?? new ReviewService(pool);
    this.milestones = deps.milestones;
  }

  /**
   * Build a practice session, or an empty-state suggestion when there's nothing to review.
   *
   * Candidates are review items that are exercises — joined to `exercises`, so
   * only ids that resolve to one are ever cast to a uuid. A saved dictionary
   * word (`dict:<entryId>`) has no exercise to practise it with: it keeps its
   * schedule and stays in the review queue, and practice leaves it out rather
   * than failing the whole session on the cast. Speaking items are left out
   * too, since their answers cannot move the schedule (`feedsReview`).
   *
   * `only` narrows the session to those exercises — "practise these now" after
   * a lesson, with the items just missed. They are taken only from the
   * learner's own review items, under the same rules, so it cannot reach an
   * exercise the learner has never answered (or one from an unpublished lesson).
   */
  async start(userId: string, only?: string[]): Promise<PracticeSession | EmptyPractice> {
    const chosen = only ? await this.ownItems(userId, only) : await this.selectItems(userId);

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
    const audio = await lessonAudioFor(this.pool, exercises);

    return {
      sessionId,
      exercises: exercises.map((ex, i) => ({
        id: ex.id,
        type: ex.type,
        ...sanitizeExercise(ex.type, ex.payload, `${sessionId}:${ex.id}`),
        ...audio[i],
      })),
    };
  }

  /** Due items first, padded with the weakest known ones (`selectPracticeItems`). */
  private async selectItems(userId: string): Promise<string[]> {
    const due = await this.pool.query<{ item_id: string }>(
      `SELECT r.item_id FROM review_items r
       JOIN exercises e ON e.id::text = r.item_id
       WHERE r.user_id = $1 AND r.due_at <= $2 AND e.type <> 'speaking'
       ORDER BY r.due_at ASC LIMIT $3`,
      [userId, new Date(), PRACTICE_TARGET],
    );
    const dueIds = due.rows.map((r) => r.item_id);

    // weakest known words (lowest easiness), not necessarily due — used to pad
    const weak = await this.pool.query<{ item_id: string }>(
      `SELECT r.item_id FROM review_items r
       JOIN exercises e ON e.id::text = r.item_id
       WHERE r.user_id = $1 AND r.item_id <> ALL($2::text[]) AND e.type <> 'speaking'
       ORDER BY r.easiness ASC, r.due_at ASC LIMIT $3`,
      [userId, dueIds, PRACTICE_TARGET],
    );
    return selectPracticeItems(dueIds, weak.rows.map((r) => r.item_id));
  }

  /** Those of `ids` that are this learner's practisable review items, in the order asked. */
  private async ownItems(userId: string, ids: string[]): Promise<string[]> {
    const own = await this.pool.query<{ item_id: string }>(
      `SELECT r.item_id FROM review_items r
       JOIN exercises e ON e.id::text = r.item_id
       WHERE r.user_id = $1 AND r.item_id = ANY($2::text[]) AND e.type <> 'speaking'`,
      [userId, ids],
    );
    const found = new Set(own.rows.map((r) => r.item_id));
    return [...new Set(ids)].filter((id) => found.has(id)).slice(0, PRACTICE_TARGET);
  }

  /**
   * How many items are due, and how many practice could draw on at all —
   * counted as `start` chooses them, so the number a "Review" entry shows is
   * the number a session will find: saved dictionary words and speaking items,
   * which practice cannot serve, are not in it.
   */
  async due(userId: string): Promise<PracticeDue> {
    const res = await this.pool.query<{ due: string; available: string }>(
      `SELECT count(*) FILTER (WHERE r.due_at <= $2)::text due, count(*)::text available
       FROM review_items r
       JOIN exercises e ON e.id::text = r.item_id
       WHERE r.user_id = $1 AND e.type <> 'speaking'`,
      [userId, new Date()],
    );
    const row = res.rows[0];
    return { due: Number(row?.due ?? 0), available: Number(row?.available ?? 0) };
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

  /**
   * Grade one answer, update SM-2, and record it (idempotent per exercise).
   *
   * Everything here keys on the stored session's id, never on the one in the
   * URL: Postgres finds a session by its id in capitals too, but the shuffle
   * seed is text, and a multiple-choice answer graded under a seed the options
   * were not shown with is mapped back to the wrong option.
   */
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

    const result = checkAnswer(ex.type, ex.payload, answer, `${session.id}:${ex.id}`);
    const modelAudioUrl = await modelAudioAfterAnswer(this.pool, ex.type, ex.payload);
    const heard = modelAudioUrl ? { modelAudioUrl } : {};

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(
        `INSERT INTO practice_answers (session_id, exercise_id, verdict, accepted)
         VALUES ($1, $2, $3, $4) ON CONFLICT (session_id, exercise_id) DO NOTHING`,
        [session.id, exerciseId, result.verdict, result.accepted],
      );
      if ((inserted.rowCount ?? 0) === 0) {
        const existing = await client.query<{ verdict: Verdict; accepted: boolean }>(
          `SELECT verdict, accepted FROM practice_answers WHERE session_id = $1 AND exercise_id = $2`,
          [session.id, exerciseId],
        );
        await client.query('COMMIT');
        const row = existing.rows[0]!;
        return { verdict: row.verdict, accepted: row.accepted, correction: result.correction, ...heard, duplicate: true };
      }
      if (result.accepted) {
        await client.query(`UPDATE practice_sessions SET correct_count = correct_count + 1 WHERE id = $1`, [session.id]);
      }
      // feed SM-2 so practice actually strengthens the item (KUR-033); an
      // item padded in before it was due cannot stretch its own interval
      // (`ReviewService.record`)
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

    return { verdict: result.verdict, accepted: result.accepted, correction: result.correction, ...heard, duplicate: false };
  }

  /**
   * Grade a second try at an item already answered in this session and record
   * nothing — the re-ask after a miss, as `LessonSessionService.retry`: no
   * answer row, no score, no XP, no review. Only an answered item, so the
   * correction a retry returns is never read before the answer that counts.
   */
  async retry(sessionId: string, userId: string, exerciseId: string, answer: unknown): Promise<PracticeRetryResult> {
    const session = await this.loadSession(sessionId, userId);
    if (session.completed_at) throw new AppError('PRACTICE_SESSION_COMPLETED', 409, 'session already completed');
    if (!session.item_ids.includes(exerciseId)) {
      throw new AppError('EXERCISE_NOT_IN_SESSION', 404, 'exercise is not in this practice session');
    }
    const answered = await this.pool.query(
      `SELECT 1 FROM practice_answers WHERE session_id = $1 AND exercise_id = $2`,
      [session.id, exerciseId],
    );
    if ((answered.rowCount ?? 0) === 0) {
      throw new AppError('EXERCISE_NOT_ANSWERED', 409, 'answer this exercise before trying it again');
    }
    const exRes = await this.pool.query<ExerciseRow>(`SELECT id, type, payload FROM exercises WHERE id = $1`, [exerciseId]);
    const ex = exRes.rows[0];
    if (!ex) throw new AppError('EXERCISE_NOT_IN_SESSION', 404, 'exercise no longer exists');

    const result = checkAnswer(ex.type, ex.payload, answer, `${session.id}:${ex.id}`);
    const modelAudioUrl = await modelAudioAfterAnswer(this.pool, ex.type, ex.payload);
    return {
      verdict: result.verdict,
      accepted: result.accepted,
      correction: result.correction,
      ...(modelAudioUrl ? { modelAudioUrl } : {}),
    };
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
    let claimedNow = false;
    if (!session.completed_at) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const claimed = await client.query(
          `UPDATE practice_sessions SET completed_at = now()
           WHERE id = $1 AND completed_at IS NULL RETURNING id`,
          [session.id],
        );
        if ((claimed.rowCount ?? 0) > 0) {
          claimedNow = true;
          const amount = Math.max(1, Math.round(lessonCompletionXp(accuracy, false) * PRACTICE_XP_FACTOR));
          xpAwarded = await this.xp.award({ userId, source: PRACTICE_XP_SOURCE, amount, refId: session.id }, client);
          await client.query(`UPDATE practice_sessions SET xp_awarded = $2 WHERE id = $1`, [session.id, xpAwarded]);
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
    // best-effort, after the commit, idempotent (streak-30)
    if (this.milestones && claimedNow) {
      await this.milestones.recordStreak(userId, streak.current).catch(() => undefined);
    }

    return { correct, total, accuracy, xpAwarded, streak };
  }
}

export { PRACTICE_TARGET, PRACTICE_MIN };
