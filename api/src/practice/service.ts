import type pg from 'pg';
import { PRACTICE_MODE_TYPES, jumpMistakesAllowed, jumpPassed, unitTone, type PracticeHub, type PracticeMode, type RecordingVoice } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { SKIPPABLE_TYPES, checkAnswer, exerciseSeed, revealExercise, type Verdict } from '../content/exercises.js';
import { deliverExercises, type DeliveredFields } from '../content/deliver.js';
import type { ExerciseType } from '../content/repository.js';
import { XpService, lessonCompletionXp } from '../xp/service.js';
import { StreakService, type StreakSummary } from '../streaks/service.js';
import { answeredTodaySql, countsAsLearning, localDate, safeTimeZone } from '../streaks/streak-logic.js';
import { DailyGoalService } from '../goals/service.js';
import { ReviewService, feedsReview } from '../review/service.js';
import { qualityFromVerdict } from '../review/sm2.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { PRACTICE_TARGET, PRACTICE_MIN, selectPracticeItems } from './practice-select.js';
import { modelAudioAfterAnswer } from '../lessonaudio/delivery.js';
import { settleJump, type JumpOutcome, type JumpTarget } from '../jump/settle.js';

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
  /**
   * The variety of Kurdish of the item's course. A review mixes courses, so
   * each item says its own, and a client offers the letters it is typed in.
   */
  dialect?: string;
};

export interface PracticeSession {
  sessionId: string;
  exercises: PracticeExercise[];
}

/**
 * A practice session as it stands, for a client coming back to it: its items
 * in the order they were chosen, and what has been answered so far — the
 * lesson's `SessionView`, for practice.
 */
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
  /** the native recording of the item's Kurdish, now that it is answered (as AnswerResult) */
  modelAudioUrl?: string;
  /** who says `modelAudioUrl`, when a character is chosen for it */
  modelAudioVoice?: RecordingVoice;
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
  /** a review this learner started recently and has not finished, to go back to; null when there is none */
  open: string | null;
}

/**
 * What a session is asked for: exactly these exercises ("practise these now"),
 * or a kind of practice — the ordinary review when nothing is said, and a
 * unit's review with the unit's id.
 */
export interface PracticeAsk {
  exerciseIds?: string[];
  mode?: PracticeMode;
  unitId?: string;
}

/** How far back a miss is still one to practise. */
export const MISTAKE_DAYS = 30;

/*
 * The statements below share these parts, so the hub counts exactly what a
 * session would find. Each is a list of CTEs, `$1` the learner.
 *
 * done: the places in a skill the learner has finished, in any version of
 * their lesson, and when last — a corrected lesson is a new row at the same
 * place, and is still the lesson they finished (as the course map reads it).
 * finished: what each of those places holds now, its newest published lesson,
 * so practice serves the lesson as it stands rather than a version replaced.
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
 * missed: the exercises whose latest answer since `$2`, in a lesson or in
 * practice, was not accepted — put right by getting them right, anywhere. A
 * second try in a lesson is never recorded, so a miss put right there is still
 * one to practise. Only exercises of a published lesson (a version replaced
 * may hold the very mistake the new one fixed), and never speaking, which the
 * learner rates themselves. A lesson session takes no answer after it expires,
 * so one that expired before `$2` is not read at all. A test to jump ahead
 * (path_jumps) is not read either: it asks about units the learner skipped,
 * and it schedules nothing, so it adds no mistakes and clears none.
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
 * How long a review left unfinished is offered to go back to — a lesson's
 * session lasts as long (SESSION_TTL_HOURS in content/sessions.ts). After
 * that the items it chose may no longer be the ones due, and a new review
 * chooses afresh.
 */
const OPEN_REVIEW_HOURS = 24;

export interface PracticeResults {
  correct: number;
  total: number;
  accuracy: number;
  /** what was missed, with the question and its right answer (as a lesson's results) */
  mistakes: Array<{ exerciseId: string; verdict: Verdict; prompt?: string; correction?: string }>;
  xpAwarded: number;
  streak: StreakSummary;
  /** a test to jump ahead on the path (jump/service.ts): whether it opened the unit */
  jump?: JumpOutcome;
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
   * `exerciseIds` narrows the session to those exercises — "practise these now"
   * after a lesson, with the items just missed. They are taken only from the
   * learner's own review items, under the same rules, so it cannot reach an
   * exercise the learner has never answered (or one from an unpublished lesson).
   *
   * `mode` picks another kind of practice (`choose`); each draws only on what
   * the learner has met, and comes back empty rather than failing when there is
   * nothing of its kind. Whatever the kind, the session is answered, paid and
   * counted for the streak by the same rules.
   */
  async start(userId: string, ask: PracticeAsk = {}): Promise<PracticeSession | EmptyPractice> {
    const chosen = ask.exerciseIds ? await this.ownItems(userId, ask.exerciseIds) : await this.choose(userId, ask.mode ?? 'review', ask.unitId);
    const session = chosen.length > 0 ? await this.begin(userId, chosen) : null;
    return session ?? { empty: true, suggestion: await this.nextLesson(userId) };
  }

  /**
   * A session over these exercises, in this order, or null when none of them
   * is there any more. A test to jump ahead (`jump`) is a session too, marked
   * as one in the same statement (jump/service.ts).
   */
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

  /** Exercises as a client sees them: answers stripped, options shuffled for this session, recordings, tiles and meanings attached. */
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
   * The learner's practice session as it stands, so leaving and coming back
   * picks up where they were: the same items in the same order, options
   * shuffled with the same seed, and the answers already given. Without it a
   * reload started a new session and left the old one unfinished, its answers
   * counted for the schedule and never for the day.
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

  /** Exercises of these types from the lessons the learner has finished, a different handful each time. */
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
   * A handful from the lessons the learner has finished in one unit, anything
   * but speaking (which has its own practice). A unit they have not finished a
   * lesson in is refused: nothing in it has been met, and it is somebody else's
   * way through the course.
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
   *
   * And the review the learner left unfinished, if they started one in the
   * last day. A lesson is picked up where it stopped because opening it
   * resumes its session; a review is not opened by anything but its own
   * address, so without this a learner who left one and came back through
   * "Review" started another, and the first stayed unfinished — its answers
   * moved the schedule and never counted for the day. A test to jump ahead is
   * not a review, and is not offered here.
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
   * Everything the practice hub shows, in one statement however much the
   * learner has done: what review has (as `due` counts it), the mistakes to
   * put right, whether listening, speaking and word practice would find
   * anything, whether speaking is turned off, and the units finished, the
   * latest first.
   *
   * A unit is finished as the course map finishes it: every skill in it has a
   * published lesson, and every published lesson in it is done. Its number is
   * its place among the course's units that have skills, which is where the
   * path draws it, and so the colour it has there.
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
      // feed SM-2 so practice actually strengthens the item (KUR-033); an
      // item padded in before it was due cannot stretch its own interval
      // (`ReviewService.record`). A test to jump ahead asks what has not been
      // learned yet, so its answers schedule nothing.
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
   * Finalize: award reduced XP once, credit the daily goal, and — when enough
   * was answered to be learning — the streak. Idempotent.
   *
   * A listening item put off and never answered ("Can't listen now") is left
   * out of the score, as in a lesson (`SKIPPABLE_TYPES`): the accuracy and the
   * XP are out of the items answered or that could have been.
   *
   * A test to jump ahead pays nothing — no XP, no streak day, no goal: it
   * opens the path, and the lessons it opens pay as ever. Here it is decided,
   * by the server alone, out of every item asked (one not answered counts as
   * missed), and a pass raises how far the course is open (`settleJump`).
   */
  async complete(sessionId: string, userId: string): Promise<PracticeResults> {
    const session = await this.loadSession(sessionId, userId);
    const correct = session.correct_count;
    const putOff = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int n FROM exercises e
       WHERE e.id = ANY($1::uuid[]) AND e.type = ANY($3::text[])
         AND NOT EXISTS (SELECT 1 FROM practice_answers a WHERE a.session_id = $2 AND a.exercise_id = e.id)`,
      [session.item_ids, session.id, SKIPPABLE_TYPES],
    );
    const total = Math.max(0, session.total_count - putOff.rows[0]!.n);
    const accuracy = total > 0 ? correct / total : 0;
    // the misses with their right answers, in the order they were asked, so a
    // review ends the way a lesson does: with what to fix, not just a score
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
          // Learning only when the items were actually worked through today
          // (see countsAsLearning and answeredTodaySql), out of every item, put
          // off or not. Practice pays its XP only then: a review can be started
          // on a single item at will, so XP for an empty one was XP on demand.
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
    if (this.milestones && claimedNow && !jumpTo) {
      await this.milestones.recordStreak(userId, streak.current).catch(() => undefined);
    }

    if (!jumpTo) return { correct, total, accuracy, mistakes, xpAwarded, streak };
    // every item asked counts here, put off or not: a test is passed by answering it
    const jump: JumpOutcome = {
      unitId: jumpTo.unitId,
      passed: passedNow ?? jumpPassed(correct, session.total_count),
      correct,
      total: session.total_count,
      mistakesAllowed: jumpMistakesAllowed(session.total_count),
    };
    return { correct, total, accuracy, mistakes, xpAwarded, streak, jump };
  }
}

/** The oldest answer a mistake is still read from. */
function mistakesSince(now: Date): Date {
  return new Date(now.getTime() - MISTAKE_DAYS * 24 * 60 * 60 * 1000);
}

export { PRACTICE_TARGET, PRACTICE_MIN };
