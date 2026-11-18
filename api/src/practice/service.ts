import type pg from 'pg';
import {
  PRACTICE_MODE_TYPES,
  jumpMistakesAllowed,
  jumpPassed,
  unitTone,
  type PracticeHub,
  type PracticeMode,
  type QuestStep,
  type RecordingVoice,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { SKIPPABLE_TYPES, checkAnswer, exerciseSeed, revealExercise, type Verdict } from '../content/exercises.js';
import { deliverExercises, type DeliveredFields } from '../content/deliver.js';
import type { ExerciseType } from '../content/repository.js';
import { XpService, lessonCompletionXp } from '../xp/service.js';
import { StreakService, type SessionStreak, type StreakSummary } from '../streaks/service.js';
import { answeredTodaySql, countsAsLearning, localDate, safeTimeZone } from '../streaks/streak-logic.js';
import { DailyGoalService } from '../goals/service.js';
import { ReviewService, feedsReview } from '../review/service.js';
import { qualityFromVerdict } from '../review/sm2.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { PRACTICE_TARGET, PRACTICE_MIN, selectPracticeItems } from './practice-select.js';
import { modelAudioAfterAnswer } from '../lessonaudio/delivery.js';
import { settleJump, type JumpOutcome, type JumpTarget } from '../jump/settle.js';
import { moveQuests } from '../quests/service.js';
import { earnWater, type WaterEarned } from '../trees/service.js';

/** Practice sessions earn half the XP a fresh lesson does. */
export const PRACTICE_XP_FACTOR = 0.5;
export const PRACTICE_XP_SOURCE = 'practice_complete';

interface ExerciseRow {
  id: string;
  type: ExerciseType;
  payload: unknown;
  /** the variety of Kurdish of the course the exercise is in */
  dialect?: string;
}

/** An item as a client sees it: answer fields stripped, with what it shows beside them (`deliverExercises`). */
export type PracticeExercise = DeliveredFields & {
  id: string;
  type: ExerciseType;
  /** The Kurdish variety of the item's course; a review mixes courses, so a client offers the right letters per item. */
  dialect?: string;
};

export interface PracticeSession {
  sessionId: string;
  exercises: PracticeExercise[];
}

/** A practice session as it stands, for a returning client: its items in chosen order and the answers so far. */
export interface PracticeSessionView extends PracticeSession {
  completed: boolean;
  answered: Record<string, { verdict: Verdict; accepted: boolean }>;
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
  /** The native recording of the item's Kurdish, now that it is answered. */
  modelAudioUrl?: string;
  /** who says `modelAudioUrl`, when a character is chosen for it */
  modelAudioVoice?: RecordingVoice;
  duplicate: boolean;
}

/** A second try at a practice item: graded, never recorded (as the lesson's RetryResult). */
export type PracticeRetryResult = Omit<PracticeAnswerResult, 'duplicate'>;

/** What practice offers now, for a "Review" entry to show before starting. */
export interface PracticeDue {
  /** Items due for review now, which a session takes first. */
  due: number;
  /** every item practice could draw on, due or not; 0 means a session would come back empty */
  available: number;
  /** A recent unfinished review to go back to, or null. */
  open: string | null;
}

/** What a session is asked for: exactly these exercises, or a kind of practice (the ordinary review by default, or a unit's). */
export interface PracticeAsk {
  exerciseIds?: string[];
  mode?: PracticeMode;
  unitId?: string;
}

/** How far back a miss is still one to practise. */
export const MISTAKE_DAYS = 30;

/*
 * Shared CTE parts, so the hub counts exactly what a session would find; `$1` is the learner. done: the skill places
 * the learner finished, in any version, and when last (a corrected lesson is a new row at the same place). finished:
 * each place's newest published lesson, so practice serves the lesson as it stands.
 */
const FINISHED_LESSONS = `done AS (
    SELECT l.skill_id, l.position, max(ls.completed_at) AS at
    FROM lesson_sessions ls JOIN lessons l ON l.id = ls.lesson_id
    WHERE ls.user_id = $1 AND ls.completed_at IS NOT NULL
    GROUP BY l.skill_id, l.position
  ), finished AS (
    SELECT DISTINCT ON (l.skill_id, l.position) l.id, l.skill_id
    FROM done d JOIN lessons l ON l.skill_id = d.skill_id AND l.position = d.position
    WHERE l.status = 'published'
    ORDER BY l.skill_id, l.position, l.version DESC
  )`;

/*
 * missed: exercises whose latest answer since `$2`, in a lesson or practice, was not accepted, until answered right
 * anywhere. Lesson second tries are never recorded, so a miss fixed there still counts. Only exercises of published
 * lessons (a replaced version may hold the very mistake the new one fixed), never speaking (self-rated). Lesson
 * sessions that expired before `$2` take no answers and are skipped, as are jump-ahead tests, which ask about skipped
 * units and schedule nothing.
 */
const MISSED = `answered AS (
    SELECT a.exercise_id, a.accepted, a.answered_at
    FROM lesson_sessions s JOIN session_answers a ON a.session_id = s.id
    WHERE s.user_id = $1 AND s.expires_at > $2 AND a.answered_at > $2
    UNION ALL
    SELECT a.exercise_id, a.accepted, a.answered_at
    FROM practice_sessions s JOIN practice_answers a ON a.session_id = s.id
    WHERE s.user_id = $1 AND a.answered_at > $2
      AND NOT EXISTS (SELECT 1 FROM path_jumps j WHERE j.session_id = s.id)
  ), latest AS (
    SELECT DISTINCT ON (exercise_id) exercise_id, accepted, answered_at
    FROM answered ORDER BY exercise_id, answered_at DESC
  ), missed AS (
    SELECT e.id, t.answered_at
    FROM latest t
    JOIN exercises e ON e.id = t.exercise_id
    JOIN lessons l ON l.id = e.lesson_id AND l.status = 'published'
    WHERE NOT t.accepted AND e.type <> 'speaking'
  )`;

/**
 * How long an unfinished review is offered to go back to, matching a lesson session's lifetime (SESSION_TTL_HOURS in
 * content/sessions.ts); after that its items may no longer be the due ones.
 */
const OPEN_REVIEW_HOURS = 24;

export interface PracticeResults {
  correct: number;
  total: number;
  accuracy: number;
  /** What was missed, with the question and its right answer, as a lesson's results show. */
  mistakes: Array<{ exerciseId: string; verdict: Verdict; prompt?: string; correction?: string }>;
  xpAwarded: number;
  /** with the days lately learned, for the week row (as a lesson's results) */
  streak: SessionStreak;
  /** a test to jump ahead on the path (jump/service.ts): whether it opened the unit */
  jump?: JumpOutcome;
  /** today's quests this session moved, before and after; absent when it moved none */
  quests?: QuestStep[];
  /** The water this session earned the learner's tree, and what is held now; absent when none was earned. */
  tree?: WaterEarned;
}

/**
 * Practice: builds a review session from the due queue, grades answers (updating SM-2), and pays reduced XP on
 * completion. With nothing due it suggests the next new lesson.
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
   * Builds a practice session, or an empty-state suggestion. Candidates are review items that resolve to exercises, so
   * only real exercise ids are cast to uuid: saved dictionary words (`dict:<entryId>`) keep their schedule but are left
   * out, as are speaking items, whose answers cannot move the schedule (`feedsReview`). `exerciseIds` narrows the
   * session to those exercises, taken only from the learner's own review items under the same rules. `mode` picks
   * another kind (`choose`), drawing only on what the learner has met and returning empty when there is nothing.
   * Every kind is answered, paid and counted for the streak by the same rules.
   */
  async start(userId: string, ask: PracticeAsk = {}): Promise<PracticeSession | EmptyPractice> {
    const chosen = ask.exerciseIds ? await this.ownItems(userId, ask.exerciseIds) : await this.choose(userId, ask.mode ?? 'review', ask.unitId);
    const session = chosen.length > 0 ? await this.begin(userId, chosen) : null;
    return session ?? { empty: true, suggestion: await this.nextLesson(userId) };
  }

  /** A session over these exercises in this order, or null when none exists any more; a jump-ahead test is marked in the same statement. */
  async begin(userId: string, ids: string[], jump?: JumpTarget): Promise<PracticeSession | null> {
    const exercises = await this.loadExercises(ids);
    if (exercises.length === 0) return null;
    const items = [userId, exercises.map((e) => e.id), exercises.length];
    const created = jump
      ? await this.pool.query<{ id: string }>(
          `WITH s AS (INSERT INTO practice_sessions (user_id, item_ids, total_count) VALUES ($1, $2::uuid[], $3) RETURNING id),
                j AS (INSERT INTO path_jumps (session_id, user_id, course_id, unit_id, position) SELECT id, $1, $4, $5, $6 FROM s)
           SELECT id FROM s`,
          [...items, jump.courseId, jump.unitId, jump.position],
        )
      : await this.pool.query<{ id: string }>(
          `INSERT INTO practice_sessions (user_id, item_ids, total_count)
           VALUES ($1, $2::uuid[], $3) RETURNING id`,
          items,
        );
    const sessionId = created.rows[0]!.id;
    return { sessionId, exercises: await this.deliver(sessionId, exercises) };
  }

  /** Exercises as a client sees them: answers stripped, options shuffled per session, recordings, tiles and meanings attached. */
  private async deliver(sessionId: string, exercises: ExerciseRow[]): Promise<PracticeExercise[]> {
    const delivered = await deliverExercises(this.pool, sessionId, exercises);
    return exercises.map((ex, i) => ({
      id: ex.id,
      type: ex.type,
      ...delivered[i],
      ...(ex.dialect ? { dialect: ex.dialect } : {}),
    }));
  }

  /**
   * The learner's practice session as it stands, so returning resumes it: the same items and order, options shuffled
   * with the same seed, and the answers given. Otherwise a reload would start a new session and strand the old one.
   */
  async view(sessionId: string, userId: string): Promise<PracticeSessionView> {
    const session = await this.loadSession(sessionId, userId);
    const [exercises, answers] = await Promise.all([
      this.loadExercises(session.item_ids),
      this.pool.query<{ exercise_id: string; verdict: Verdict; accepted: boolean }>(
        `SELECT exercise_id, verdict, accepted FROM practice_answers WHERE session_id = $1`,
        [session.id],
      ),
    ]);
    const answered: PracticeSessionView['answered'] = {};
    for (const a of answers.rows) answered[a.exercise_id] = { verdict: a.verdict, accepted: a.accepted };
    return {
      sessionId: session.id,
      completed: session.completed_at !== null,
      exercises: await this.deliver(session.id, exercises),
      answered,
    };
  }

  /** The exercises a session of this kind takes, in the order it asks them. */
  private async choose(userId: string, mode: PracticeMode, unitId?: string): Promise<string[]> {
    switch (mode) {
      case 'review':
        return this.selectItems(userId);
      case 'mistakes':
        return this.mistakeItems(userId);
      case 'unit':
        return this.unitItems(userId, unitId!);
      default:
        return this.finishedItems(userId, PRACTICE_MODE_TYPES[mode]);
    }
  }

  /** What the learner last got wrong lately, the newest misses first. */
  private async mistakeItems(userId: string): Promise<string[]> {
    const res = await this.pool.query<{ id: string }>(
      `WITH ${MISSED}
       SELECT id FROM missed ORDER BY answered_at DESC LIMIT $3`,
      [userId, mistakesSince(new Date()), PRACTICE_TARGET],
    );
    return res.rows.map((r) => r.id);
  }

  /** Exercises of these types from lessons the learner finished, a different handful each time. */
  private async finishedItems(userId: string, types: readonly string[]): Promise<string[]> {
    const res = await this.pool.query<{ id: string }>(
      `WITH ${FINISHED_LESSONS}
       SELECT e.id FROM finished f JOIN exercises e ON e.lesson_id = f.id
       WHERE e.type = ANY($2::text[])
       ORDER BY random() LIMIT $3`,
      [userId, types, PRACTICE_TARGET],
    );
    return res.rows.map((r) => r.id);
  }

  /**
   * A handful from the lessons the learner finished in one unit, anything but speaking. A unit with no finished lesson
   * is refused, since nothing in it has been met.
   */
  private async unitItems(userId: string, unitId: string): Promise<string[]> {
    const res = await this.pool.query<{ reached: boolean; ids: string[] }>(
      `WITH ${FINISHED_LESSONS}, here AS (
         SELECT f.id FROM finished f JOIN skills s ON s.id = f.skill_id WHERE s.unit_id = $2
       )
       SELECT EXISTS (SELECT 1 FROM here) AS reached,
              ARRAY(SELECT e.id FROM here h JOIN exercises e ON e.lesson_id = h.id
                    WHERE e.type <> 'speaking' ORDER BY random() LIMIT $3) AS ids`,
      [userId, unitId, PRACTICE_TARGET],
    );
    const row = res.rows[0]!;
    if (!row.reached) throw new AppError('PRACTICE_UNIT_NOT_REACHED', 403, 'finish a lesson in this unit to review it');
    return row.ids;
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

    // The weakest known words (lowest easiness), not necessarily due, for padding.
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
   * Items due and items practice could draw on, counted as `start` chooses them, so a "Review" entry shows what a
   * session will find (saved words and speaking excluded). Also the review left unfinished in the last day: unlike a
   * lesson, a review is reopened only by its own address, so without this the learner would start another. Jump-ahead
   * tests are not offered here.
   */
  async due(userId: string): Promise<PracticeDue> {
    const [counts, open] = await Promise.all([
      this.pool.query<{ due: string; available: string }>(
        `SELECT count(*) FILTER (WHERE r.due_at <= $2)::text due, count(*)::text available
         FROM review_items r
         JOIN exercises e ON e.id::text = r.item_id
         WHERE r.user_id = $1 AND e.type <> 'speaking'`,
        [userId, new Date()],
      ),
      this.pool.query<{ id: string }>(
        `SELECT id FROM practice_sessions s
         WHERE user_id = $1 AND completed_at IS NULL AND created_at > now() - make_interval(hours => $2)
           AND NOT EXISTS (SELECT 1 FROM path_jumps j WHERE j.session_id = s.id)
         ORDER BY created_at DESC LIMIT 1`,
        [userId, OPEN_REVIEW_HOURS],
      ),
    ]);
    const row = counts.rows[0];
    return { due: Number(row?.due ?? 0), available: Number(row?.available ?? 0), open: open.rows[0]?.id ?? null };
  }

  /**
   * Everything the practice hub shows in one statement: review (as `due` counts it), mistakes to put right, whether
   * listening, speaking and word practice would find anything, whether speaking is off, and finished units, latest
   * first. A unit is finished as the course map says: every skill has a published lesson and every published lesson is
   * done. Its number is its place among the course's units with skills, as the path draws and colours it.
   */
  async hub(userId: string): Promise<PracticeHub> {
    const now = new Date();
    const res = await this.pool.query<{
      due: number;
      available: number;
      mistakes: number;
      listen: boolean;
      speak: boolean;
      words: boolean;
      skip_speaking: boolean | null;
      units: Array<{ unitId: string; title: string; number: number }>;
    }>(
      `WITH ${FINISHED_LESSONS}, ${MISSED},
       review AS (
         SELECT count(*) FILTER (WHERE r.due_at <= $3)::int AS due, count(*)::int AS available
         FROM review_items r JOIN exercises e ON e.id::text = r.item_id
         WHERE r.user_id = $1 AND e.type <> 'speaking'
       ),
       met AS (
         SELECT DISTINCT e.type FROM finished f JOIN exercises e ON e.lesson_id = f.id
       ),
       touched AS (
         SELECT s.unit_id, max(d.at) AS at FROM done d JOIN skills s ON s.id = d.skill_id GROUP BY s.unit_id
       ),
       closed AS (
         SELECT u.id, u.course_id, u.title_en, t.at
         FROM touched t JOIN units u ON u.id = t.unit_id
         WHERE NOT EXISTS (
           SELECT 1 FROM skills s
           WHERE s.unit_id = u.id
             AND (NOT EXISTS (SELECT 1 FROM lessons l WHERE l.skill_id = s.id AND l.status = 'published')
                  OR EXISTS (
                    SELECT 1 FROM lessons l
                    WHERE l.skill_id = s.id AND l.status = 'published'
                      AND NOT EXISTS (SELECT 1 FROM done d WHERE d.skill_id = l.skill_id AND d.position = l.position)))
         )
       ),
       numbered AS (
         SELECT u.id, row_number() OVER (PARTITION BY u.course_id ORDER BY u.position)::int AS number
         FROM units u
         WHERE u.course_id IN (SELECT course_id FROM closed) AND EXISTS (SELECT 1 FROM skills s WHERE s.unit_id = u.id)
       )
       SELECT r.due, r.available,
              (SELECT count(*)::int FROM missed) AS mistakes,
              EXISTS (SELECT 1 FROM met WHERE type = ANY($4::text[])) AS listen,
              EXISTS (SELECT 1 FROM met WHERE type = ANY($5::text[])) AS speak,
              EXISTS (SELECT 1 FROM met WHERE type = ANY($6::text[])) AS words,
              (SELECT skip_speaking FROM users WHERE id = $1) AS skip_speaking,
              COALESCE((
                SELECT json_agg(json_build_object('unitId', c.id, 'title', c.title_en, 'number', n.number) ORDER BY c.at DESC)
                FROM closed c JOIN numbered n ON n.id = c.id
              ), '[]'::json) AS units
       FROM review r`,
      [userId, mistakesSince(now), now, PRACTICE_MODE_TYPES.listen, PRACTICE_MODE_TYPES.speak, PRACTICE_MODE_TYPES.words],
    );
    const row = res.rows[0]!;
    return {
      due: row.due,
      available: row.available,
      mistakes: row.mistakes,
      listen: row.listen,
      speak: row.speak,
      words: row.words,
      skipSpeaking: row.skip_speaking ?? false,
      units: row.units.map((u) => ({ ...u, tone: unitTone(u.number - 1) })),
    };
  }

  private async loadExercises(ids: string[]): Promise<ExerciseRow[]> {
    const rows = await this.pool.query<ExerciseRow>(
      `SELECT e.id, e.type, e.payload, c.dialect
       FROM exercises e
       JOIN lessons l ON l.id = e.lesson_id
       JOIN skills s ON s.id = l.skill_id
       JOIN units u ON u.id = s.unit_id
       JOIN courses c ON c.id = u.course_id
       WHERE e.id = ANY($1::uuid[])`,
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

  /** The session, and what it opens when it is a test to jump ahead (`jump_*`, null otherwise). */
  private async loadSession(sessionId: string, userId: string) {
    const res = await this.pool.query<{
      id: string;
      item_ids: string[];
      total_count: number;
      correct_count: number;
      completed_at: Date | null;
      jump_course_id: string | null;
      jump_unit_id: string | null;
      jump_position: number | null;
    }>(
      `SELECT s.id, s.item_ids, s.total_count, s.correct_count, s.completed_at,
              j.course_id AS jump_course_id, j.unit_id AS jump_unit_id, j.position AS jump_position
       FROM practice_sessions s LEFT JOIN path_jumps j ON j.session_id = s.id
       WHERE s.id = $1 AND s.user_id = $2`,
      [sessionId, userId],
    );
    const session = res.rows[0];
    if (!session) throw new AppError('PRACTICE_SESSION_NOT_FOUND', 404, 'practice session not found');
    return session;
  }

  /**
   * Grades one answer, updates SM-2 and records it, idempotent per exercise. Everything keys on the stored session id,
   * never the URL's: Postgres matches the id in capitals too, but the shuffle seed is text, and grading under the wrong
   * seed maps a choice to the wrong option.
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

    const result = checkAnswer(ex.type, ex.payload, answer, exerciseSeed(session.id, ex.id));
    const heard = await modelAudioAfterAnswer(this.pool, ex.type, ex.payload);

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
      // Feed SM-2 so practice strengthens the item; an item padded in before it was due cannot stretch its own interval
      // (`ReviewService.record`). Jump-ahead tests ask about unlearned material, so they schedule nothing.
      if (feedsReview(ex.type) && session.jump_unit_id === null) {
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
   * Grades a second try at an item already answered in this session and records nothing (no answer row, score, XP or
   * review), as `LessonSessionService.retry`. Only for answered items, so the correction is never seen before the
   * answer that counts.
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

    const result = checkAnswer(ex.type, ex.payload, answer, exerciseSeed(session.id, ex.id));
    const heard = await modelAudioAfterAnswer(this.pool, ex.type, ex.payload);
    return {
      verdict: result.verdict,
      accepted: result.accepted,
      correction: result.correction,
      ...heard,
    };
  }

  /**
   * Finalizes once: reduced XP, the daily goal, and the streak when enough was answered to count as learning. A
   * listening item put off and never answered is left out of the score, as in a lesson (`SKIPPABLE_TYPES`). A
   * jump-ahead test pays nothing (no XP, streak day or goal); the server decides it from every item asked, unanswered
   * ones counting as missed, and a pass opens the course further (`settleJump`).
   */
  async complete(sessionId: string, userId: string): Promise<PracticeResults> {
    const session = await this.loadSession(sessionId, userId);
    const correct = session.correct_count;
    // Items put off and never answered, and listening items answered right (for the quests), in one read.
    const counts = await this.pool.query<{ n: number; listening_right: number }>(
      `SELECT (SELECT count(*)::int FROM exercises e
                WHERE e.id = ANY($1::uuid[]) AND e.type = ANY($3::text[])
                  AND NOT EXISTS (SELECT 1 FROM practice_answers a WHERE a.session_id = $2 AND a.exercise_id = e.id)) AS n,
              (SELECT count(*)::int FROM practice_answers a JOIN exercises e ON e.id = a.exercise_id
                WHERE a.session_id = $2 AND a.accepted AND e.type = 'listening') AS listening_right`,
      [session.item_ids, session.id, SKIPPABLE_TYPES],
    );
    const total = Math.max(0, session.total_count - counts.rows[0]!.n);
    const accuracy = total > 0 ? correct / total : 0;
    // The misses with their right answers in asked order, so a review ends like a lesson: with what to fix.
    const missed = await this.pool.query<{ exercise_id: string; verdict: Verdict; type: ExerciseType; payload: unknown }>(
      `SELECT a.exercise_id, a.verdict, e.type, e.payload
       FROM practice_answers a JOIN exercises e ON e.id = a.exercise_id
       WHERE a.session_id = $1 AND NOT a.accepted
       ORDER BY array_position($2::uuid[], a.exercise_id)`,
      [session.id, session.item_ids],
    );
    const mistakes = missed.rows.map((m) => ({
      exerciseId: m.exercise_id,
      verdict: m.verdict,
      ...revealExercise(m.type, m.payload),
    }));

    const tzRes = await this.pool.query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
    const timeZone = tzRes.rows[0]?.timezone ?? 'UTC';
    const jumpTo =
      session.jump_unit_id !== null && session.jump_course_id !== null && session.jump_position !== null
        ? { courseId: session.jump_course_id, unitId: session.jump_unit_id, position: session.jump_position }
        : null;

    let xpAwarded = 0;
    let streak: StreakSummary | null = null;
    let claimedNow = false;
    let passedNow: boolean | null = null;
    let quests: QuestStep[] = [];
    let water: WaterEarned | null = null;
    if (!session.completed_at) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const claimed = await client.query<{ correct_count: number }>(
          `UPDATE practice_sessions SET completed_at = now()
           WHERE id = $1 AND completed_at IS NULL RETURNING correct_count`,
          [session.id],
        );
        claimedNow = (claimed.rowCount ?? 0) > 0;
        if (claimedNow && jumpTo) {
          // decided on the count as it stood when the session closed
          passedNow = jumpPassed(claimed.rows[0]!.correct_count, session.total_count);
          await settleJump(client, userId, { sessionId: session.id, ...jumpTo }, passedNow);
        } else if (claimedNow) {
          // Learning only when the items were worked through today (countsAsLearning, answeredTodaySql), out of every item.
          // XP is paid only then, since a review can be started on a single item at will.
          const tz = safeTimeZone(timeZone);
          const answered = await client.query<{ n: number }>(answeredTodaySql('practice_answers'), [
            session.id,
            tz,
            localDate(new Date(), tz),
          ]);
          const learning = countsAsLearning(answered.rows[0]!.n, session.total_count);
          if (learning) {
            const amount = Math.max(1, Math.round(lessonCompletionXp(accuracy, false) * PRACTICE_XP_FACTOR));
            xpAwarded = await this.xp.award({ userId, source: PRACTICE_XP_SOURCE, amount, refId: session.id }, client);
            await client.query(`UPDATE practice_sessions SET xp_awarded = $2 WHERE id = $1`, [session.id, xpAwarded]);
            streak = await this.streaks.recordActivity(userId, timeZone, new Date(), client);
          }
          const goal = await this.goals.evaluate(client, userId, timeZone);
          // Today's quests, the XP one by the day's XP as the goal just counted it; practice moves no lesson quest.
          if (learning) {
            const listeningRight = counts.rows[0]!.listening_right;
            quests = await moveQuests(client, userId, tz, { lesson: false, accuracy, perfect: false, listeningRight, xpToday: goal.earnedXp });
            // practice is learning too: it waters the tree as a lesson does
            water = await earnWater(client, userId);
          }
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
    if (this.milestones && claimedNow && !jumpTo) {
      await this.milestones.recordStreak(userId, streak.current).catch(() => undefined);
    }
    // the days lately learned for the week row, and the quests this session moved
    const shown = {
      streak: { ...streak, ...(await this.streaks.recent(userId, timeZone)) },
      ...(quests.length > 0 ? { quests } : {}),
      ...(water && water.gained > 0 ? { tree: water } : {}),
    };

    if (!jumpTo) return { correct, total, accuracy, mistakes, xpAwarded, ...shown };
    // every item asked counts here, put off or not: a test is passed by answering it
    const jump: JumpOutcome = {
      unitId: jumpTo.unitId,
      passed: passedNow ?? jumpPassed(correct, session.total_count),
      correct,
      total: session.total_count,
      mistakesAllowed: jumpMistakesAllowed(session.total_count),
    };
    return { correct, total, accuracy, mistakes, xpAwarded, ...shown, jump };
  }
}

/** The oldest answer a mistake is still read from. */
function mistakesSince(now: Date): Date {
  return new Date(now.getTime() - MISTAKE_DAYS * 24 * 60 * 60 * 1000);
}

export { PRACTICE_TARGET, PRACTICE_MIN };
