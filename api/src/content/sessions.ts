import type pg from 'pg';
import type { QuestStep, RecordingVoice } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { SKIPPABLE_TYPES, checkAnswer, exerciseSeed, revealExercise, type Verdict } from './exercises.js';
import { deliverExercises, type DeliveredFields } from './deliver.js';
import type { ExerciseType } from './repository.js';
import { XpService } from '../xp/service.js';
import { lessonXp } from '../xp/rules.js';
import { StreakService, type SessionStreak, type StreakSummary } from '../streaks/service.js';
import { answeredTodaySql, countsAsLearning, localDate, safeTimeZone } from '../streaks/streak-logic.js';
import { DailyGoalService } from '../goals/service.js';
import { ReviewService, feedsReview } from '../review/service.js';
import { qualityFromVerdict } from '../review/sm2.js';
import { modelAudioAfterAnswer } from '../lessonaudio/delivery.js';
import type { MilestoneRecorder } from '../achievements/service.js';
import { moveQuests } from '../quests/service.js';
import { earnWater, type WaterEarned } from '../trees/service.js';

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

/** A session's columns read beside something else, all null when there is no session. */
type SessionColumns = { [K in keyof SessionRow]: SessionRow[K] | null };

/** The session in a row read with other things, or null when the row has none. */
function sessionOf(row: SessionColumns): SessionRow | null {
  if (row.id === null) return null;
  return {
    id: row.id,
    user_id: row.user_id!,
    lesson_id: row.lesson_id!,
    total_count: row.total_count!,
    correct_count: row.correct_count!,
    expires_at: row.expires_at!,
    completed_at: row.completed_at,
  };
}

/** The grammar note on a lesson's skill and the variety of its course. */
interface LessonNotes {
  grammar_md: string | null;
  dialect: string | null;
}

const NO_NOTES: LessonNotes = { grammar_md: null, dialect: null };

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
  /** answer fields stripped, with what the client shows beside them (`deliverExercises`) */
  exercises: Array<{ id: string; position: number; type: ExerciseType } & DeliveredFields>;
  /** exercises already answered in this session (resume) */
  answered: Record<string, { verdict: Verdict; accepted: boolean }>;
  /** markdown grammar note for this lesson's skill, if any */
  grammarMd: string | null;
  /**
   * The course's variety of Kurdish ('kurmanji', 'sorani', …), so the client offers the right extra letters (ê î û ç ş
   * for Kurmancî, the Soranî letters for Soranî).
   */
  dialect: string | null;
}

export interface AnswerResult {
  verdict: Verdict;
  accepted: boolean;
  correction?: string;
  /**
   * The native recording of the item's Kurdish to hear once answered, including on items that could not send it
   * beforehand without giving the answer away (lessonaudio/delivery.ts).
   */
  modelAudioUrl?: string;
  /** who says `modelAudioUrl`, when a character is chosen for it */
  modelAudioVoice?: RecordingVoice;
  /** true when this exercise was already answered (idempotent replay). */
  duplicate: boolean;
}

/** A second try at an item, graded like an answer but never recorded (`retry`), so it has no `duplicate`. */
export type RetryResult = Omit<AnswerResult, 'duplicate'>;

export interface SessionResults {
  correct: number;
  /**
   * The exercises the score is out of: the lesson's, minus listening or speaking items put off and never answered
   * (`SKIPPABLE_TYPES`).
   */
  total: number;
  /** `correct / total` */
  accuracy: number;
  /** What was missed, with each question and its right answer, for the results screen. */
  mistakes: Array<{ exerciseId: string; verdict: Verdict; prompt?: string; correction?: string }>;
  /** XP awarded for this completion (0 on a repeat replay). */
  xpAwarded: number;
  /** Streak after this completion counted toward today's goal, with the days lately learned for the week row. */
  streak: SessionStreak;
  /**
   * True only for this learner's first completion of this lesson in any version (`LessonSlot`). Rewards that must not
   * be farmable by replays key on it.
   */
  firstCompletion: boolean;
  /** today's quests this completion moved, before and after; absent when it moved none */
  quests?: QuestStep[];
  /** the water this completion earned the learner's tree, and what is held now; absent when it earned none (no tree planted, a replay) */
  tree?: WaterEarned;
}

/**
 * Where a lesson sits: its skill and position. Re-importing changed content makes a new row (new version, new id) at
 * the same place, which to a learner is still the lesson they finished, so completion is asked of the place, not the
 * row.
 */
interface LessonSlot {
  skillId: string;
  position: number;
}

/** Grants Gems for a rule/refId; injected so content stays decoupled. */
export interface GemGranter {
  grant(userId: string, ruleKey: string, refId: string): Promise<unknown>;
}

/**
 * The Gem rule a perfect first completion pays under. Switched off since migration 1751000312000 (free gems are rare
 * now that they restore a streak), so the grant is requested and answers with nothing; the request stays for an admin
 * who switches it back on.
 */
export const PERFECT_LESSON_GEM_RULE = 'perfect_lesson';

/**
 * The idempotency reference for perfect-lesson Gems: the learner and the lesson's place, so they are paid at most once
 * per learner per lesson, whatever version or path reached the completion.
 */
function perfectLessonRef(slot: LessonSlot, userId: string): string {
  return `${slot.skillId}:${slot.position}:${userId}`;
}

/**
 * Lesson delivery and grading. Sessions pin a lesson id, grade every answer server-side, and record each answer exactly
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

  /** The grammar note on a lesson's skill and its course's variety, read separately when nothing else has read them. */
  private async notesOf(lessonId: string): Promise<LessonNotes> {
    const r = await this.pool.query<LessonNotes>(
      `SELECT s.grammar_md, c.dialect
       FROM lessons l
       JOIN skills s ON s.id = l.skill_id
       JOIN units u ON u.id = s.unit_id
       JOIN courses c ON c.id = u.course_id
       WHERE l.id = $1`,
      [lessonId],
    );
    return r.rows[0] ?? NO_NOTES;
  }

  /**
   * The session as the learner sees it. Exercises come with this session's answer to each in one read; answers are only
   * recorded for exercises of the session's own lesson (`openSessionWith`).
   */
  private async buildView(session: SessionRow, known?: LessonNotes): Promise<SessionView> {
    const [rows, notes] = await Promise.all([
      this.pool.query<ExerciseRow & { verdict: Verdict | null; accepted: boolean | null }>(
        `SELECT e.id, e.position, e.type, e.payload, a.verdict, a.accepted
           FROM exercises e LEFT JOIN session_answers a ON a.session_id = $2 AND a.exercise_id = e.id
          WHERE e.lesson_id = $1 ORDER BY e.position ASC`,
        [session.lesson_id, session.id],
      ),
      known ?? this.notesOf(session.lesson_id),
    ]);
    const exercises = rows.rows;
    const answered: SessionView['answered'] = {};
    for (const a of exercises) if (a.verdict !== null) answered[a.id] = { verdict: a.verdict, accepted: a.accepted! };
    const delivered = await deliverExercises(
      this.pool,
      session.id,
      exercises.map((ex) => ({ ...ex, dialect: notes.dialect })),
    );

    return {
      sessionId: session.id,
      lessonId: session.lesson_id,
      expiresAt: new Date(session.expires_at).toISOString(),
      completed: session.completed_at !== null,
      exercises: exercises.map((ex, i) => ({ id: ex.id, position: ex.position, type: ex.type, ...delivered[i] })),
      answered,
      grammarMd: notes.grammar_md,
      dialect: notes.dialect,
    };
  }

  /** Start a new session or resume the learner's active one for a lesson. */
  async startOrResume(userId: string, lessonId: string): Promise<SessionView> {
    // the lesson, its notes, how many exercises it has, and the learner's open session on it, in one read
    const found = await this.pool.query<SessionColumns & { status: string; exercise_count: number; notes: boolean } & LessonNotes>(
      `SELECT l.status, c.id IS NOT NULL AS notes, s.grammar_md, c.dialect,
              (SELECT count(*)::int FROM exercises WHERE lesson_id = l.id) AS exercise_count,
              a.id, a.user_id, a.lesson_id, a.total_count, a.correct_count, a.started_at, a.expires_at, a.completed_at
         FROM lessons l
         LEFT JOIN skills s ON s.id = l.skill_id
         LEFT JOIN units u ON u.id = s.unit_id
         LEFT JOIN courses c ON c.id = u.course_id
         LEFT JOIN LATERAL (
           SELECT * FROM lesson_sessions
            WHERE user_id = $1 AND lesson_id = l.id AND completed_at IS NULL AND expires_at > now()
            ORDER BY started_at DESC LIMIT 1
         ) a ON true
        WHERE l.id = $2`,
      [userId, lessonId],
    );
    const lesson = found.rows[0];
    if (!lesson) throw new AppError('LESSON_NOT_FOUND', 404, 'lesson not found');
    if (lesson.status !== 'published') {
      throw new AppError('LESSON_NOT_PUBLISHED', 409, 'lesson is not published');
    }
    // a skill, unit or course missing reads as no notes at all, as the inner joins of `notesOf` do
    const notes: LessonNotes = lesson.notes ? { grammar_md: lesson.grammar_md, dialect: lesson.dialect } : NO_NOTES;

    const active = sessionOf(lesson);
    if (active) return this.buildView(active, notes);

    const totalCount = lesson.exercise_count;
    if (totalCount === 0) throw new AppError('LESSON_EMPTY', 409, 'lesson has no exercises');

    const created = await this.pool.query<SessionRow>(
      `INSERT INTO lesson_sessions (user_id, lesson_id, total_count, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)
       RETURNING *`,
      [userId, lessonId, totalCount, String(SESSION_TTL_HOURS)],
    );
    return this.buildView(created.rows[0]!, notes);
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

  /**
   * The learner's session while still open to answers (not completed, not expired), with one exercise of its lesson and
   * whether it was answered yet: everything an answer or retry checks first, in one read.
   */
  private async openSessionWith(
    sessionId: string,
    userId: string,
    exerciseId: string,
  ): Promise<{ session: SessionRow; ex: ExerciseRow; answered: boolean }> {
    const result = await this.pool.query<
      SessionRow & { ex_id: string | null; ex_position: number; ex_type: ExerciseType; ex_payload: unknown; answered: boolean }
    >(
      `SELECT ls.*, e.id AS ex_id, e.position AS ex_position, e.type AS ex_type, e.payload AS ex_payload,
              EXISTS (SELECT 1 FROM session_answers a WHERE a.session_id = ls.id AND a.exercise_id = e.id) AS answered
         FROM lesson_sessions ls LEFT JOIN exercises e ON e.id = $3 AND e.lesson_id = ls.lesson_id
        WHERE ls.id = $1 AND ls.user_id = $2`,
      [sessionId, userId, exerciseId],
    );
    const row = result.rows[0];
    if (!row) throw new AppError('SESSION_NOT_FOUND', 404, 'session not found');
    if (row.completed_at) throw new AppError('SESSION_COMPLETED', 409, 'session already completed');
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new AppError('SESSION_EXPIRED', 409, 'session has expired');
    }
    if (!row.ex_id) throw new AppError('EXERCISE_NOT_IN_LESSON', 404, 'exercise is not in this lesson');
    return {
      session: sessionOf(row)!,
      ex: { id: row.ex_id, position: row.ex_position, type: row.ex_type, payload: row.ex_payload },
      answered: row.answered,
    };
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    exerciseId: string,
    answer: unknown,
  ): Promise<AnswerResult> {
    const { session, ex } = await this.openSessionWith(sessionId, userId, exerciseId);

    const result = checkAnswer(ex.type, ex.payload, answer, exerciseSeed(session.id, ex.id));
    const heard = await modelAudioAfterAnswer(this.pool, ex.type, ex.payload);

    // Idempotent per (session, exercise): first answer wins. The answer, the session's right-answer count, and for a
    // repeat the winning answer are one statement; its SELECT does not see the statement's own insert, so it only reads
    // back an earlier answer.
    const record = async (db: Pick<pg.Pool, 'query'>) =>
      (
        await db.query<{ inserted: boolean; verdict: Verdict | null; accepted: boolean | null }>(
          `WITH ins AS (
             INSERT INTO session_answers (session_id, exercise_id, verdict, accepted)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (session_id, exercise_id) DO NOTHING
             RETURNING 1
           ), counted AS (
             UPDATE lesson_sessions SET correct_count = correct_count + 1
              WHERE id = $1 AND $4::boolean AND EXISTS (SELECT 1 FROM ins)
           )
           SELECT EXISTS (SELECT 1 FROM ins) AS inserted, a.verdict, a.accepted
             FROM (SELECT 1) one LEFT JOIN session_answers a ON a.session_id = $1 AND a.exercise_id = $2`,
          [sessionId, exerciseId, result.verdict, result.accepted],
        )
      ).rows[0]!;

    let recorded: Awaited<ReturnType<typeof record>>;
    if (!feedsReview(ex.type)) {
      // nothing else to write with it, and one statement is its own transaction
      recorded = await record(this.pool);
    } else {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        recorded = await record(client);
        // Feed the answer into spaced repetition, keyed on the
        // exercise until a lexeme model exists. First answer only;
        // never a self-rated speaking answer (`feedsReview`).
        if (recorded.inserted) {
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
    }
    if (!recorded.inserted) {
      return {
        verdict: recorded.verdict!,
        accepted: recorded.accepted!,
        correction: result.correction,
        ...heard,
        duplicate: true,
      };
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
   * Grade a second try at an item and record nothing (no answer row, accuracy, XP, review or Gems). This is the re-ask
   * a client makes a few exercises after a miss: practice with the answer fresh, which must not count as a first
   * attempt. Graded with the same seed, so a multiple-choice position means the same option.
   *
   * Only items already answered in this session can be retried: grading returns the correction and model recording, so
   * retrying first would reveal every answer and make the counting first answer unloseable.
   */
  async retry(sessionId: string, userId: string, exerciseId: string, answer: unknown): Promise<RetryResult> {
    const { session, ex, answered } = await this.openSessionWith(sessionId, userId, exerciseId);
    if (!answered) {
      throw new AppError('EXERCISE_NOT_ANSWERED', 409, 'answer this exercise before trying it again');
    }

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
   * Finalize a session and return the results summary. Idempotent: XP is awarded exactly once, on the transition to
   * completed, keyed on the session id in the ledger; re-calling returns the same summary with no further XP.
   *
   * A perfect first completion pays perfect-lesson Gems while that rule is on (it is off; see
   * `PERFECT_LESSON_GEM_RULE`), keyed on the learner and the lesson's place (`perfectLessonRef`), so replays and
   * corrected versions are never paid again. Like XP, they are paid only on the transition, because sessions completed
   * earlier were paid under their session id.
   *
   * A listening or speaking item put off and never answered (`SKIPPABLE_TYPES`) is left out of the score, so putting
   * one off costs no accuracy or XP. It earns nothing either: a lesson with anything put off is not perfect for the
   * Gems or the first-perfect milestone, or putting off risky items would be the way to a perfect lesson.
   */
  async complete(sessionId: string, userId: string): Promise<SessionResults> {
    // the session, where its lesson sits, the learner's time zone, and how
    // many listening or speaking items were put off and never answered, in one read
    const found = await this.pool.query<SessionRow & { skill_id: string | null; position: number | null; timezone: string | null; put_off: number }>(
      `SELECT ls.*, l.skill_id, l.position, u.timezone,
              (SELECT count(*)::int FROM exercises e
                WHERE e.lesson_id = ls.lesson_id AND e.type = ANY($3::text[])
                  AND NOT EXISTS (SELECT 1 FROM session_answers a WHERE a.session_id = ls.id AND a.exercise_id = e.id)) AS put_off
         FROM lesson_sessions ls
         LEFT JOIN lessons l ON l.id = ls.lesson_id
         LEFT JOIN users u ON u.id = ls.user_id
        WHERE ls.id = $1 AND ls.user_id = $2`,
      [sessionId, userId, SKIPPABLE_TYPES],
    );
    const row = found.rows[0];
    if (!row) throw new AppError('SESSION_NOT_FOUND', 404, 'session not found');
    if (row.skill_id === null || row.position === null) throw new AppError('LESSON_NOT_FOUND', 404, 'lesson not found');
    const session = row;
    const slot: LessonSlot = { skillId: row.skill_id, position: row.position };
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
    const skipped = row.put_off;
    const scored = Math.max(0, session.total_count - skipped);
    const accuracy = scored > 0 ? correct / scored : 0;
    // perfect: every exercise answered, and answered right
    const perfect = skipped === 0 && accuracy === 1;

    const timeZone = row.timezone ?? 'UTC';

    let xpAwarded = 0;
    let streak: StreakSummary | null = null;
    let firstCompletion: boolean | null = null;
    let claimedNow = false;
    let quests: QuestStep[] = [];
    let water: WaterEarned | null = null;
    if (!session.completed_at) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        // Claim the completion transition; only the winner awards XP and streak. The claim takes the slot's lock as it
        // succeeds (RETURNING runs only for an updated row), so one completion per lesson slot per learner runs at a
        // time; otherwise parallel completions each saw no prior completion and each paid first-time XP.
        const claimed = await client.query(
          `UPDATE lesson_sessions SET completed_at = now()
           WHERE id = $1 AND completed_at IS NULL
           RETURNING id, pg_advisory_xact_lock(hashtextextended($2, 0))`,
          [session.id, `lesson-complete:${userId}:${slot.skillId}:${slot.position}`],
        );
        if ((claimed.rowCount ?? 0) > 0) {
          claimedNow = true;
          const tz = safeTimeZone(timeZone);
          // Repeat = this learner completed this lesson before, in any version. Today's completions (UTC, the league's
          // day) decide whether a repeat still pays (xp/rules.ts `lessonXp`). Read after the lock in its own statement so
          // it sees a completion committed while this one waited, along with how many of this session's answers were
          // given today (see below).
          const prior = await client.query<{ n: string; today: string; answered_today: number }>(
            `SELECT count(*)::text n,
                    count(*) FILTER (
                      WHERE ls.completed_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
                    )::text today,
                    (${answeredTodaySql('session_answers', { session: '$4', zone: '$5', day: '$6' })}) AS answered_today
               FROM lesson_sessions ls
               JOIN lessons l ON l.id = ls.lesson_id
              WHERE ls.user_id = $1 AND l.skill_id = $2 AND l.position = $3
                AND ls.completed_at IS NOT NULL AND ls.id <> $4`,
            [userId, slot.skillId, slot.position, session.id, tz, localDate(new Date(), tz)],
          );
          const history = { priorCompletions: Number(prior.rows[0]!.n), priorCompletionsToday: Number(prior.rows[0]!.today) };
          const isRepeat = history.priorCompletions > 0;
          firstCompletion = !isRepeat;
          const amount = lessonXp(accuracy, history);
          xpAwarded = await this.xp.award(
            { userId, source: LESSON_XP_SOURCE, amount, refId: session.id },
            client,
          );
          // A lesson actually worked through counts as a day learned and for
          // today's streak; one finished with (nearly) nothing answered does
          // not, or the freeze, the daily Zêr and the quests could be had for nothing.
          const learning = countsAsLearning(prior.rows[0]!.answered_today, session.total_count);
          if (learning) {
            streak = await this.streaks.recordActivity(userId, timeZone, new Date(), client);
          }
          // Credit the daily goal if this XP crossed it. Runs in
          // the same txn so it sees the award above; idempotent.
          const goal = await this.goals.evaluate(client, userId, timeZone);
          // and today's quests, the XP one by the day's XP as the goal just counted it
          if (learning) {
            const listeningRight = answers.rows.filter((a) => a.type === 'listening' && a.accepted).length;
            quests = await moveQuests(client, userId, tz, { lesson: true, accuracy, perfect, listeningRight, xpToday: goal.earnedXp });
            // and water for the learner's tree, if they have planted one
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

    // On a replay (already completed) report the current, settled streak.
    if (streak === null) streak = await this.streaks.get(userId, timeZone);
    // …and whether that earlier completion was the learner's first of this
    // lesson, so asking twice gives the same answer.
    if (firstCompletion === null) firstCompletion = await this.wasFirstCompletion(session.id, userId, slot);
    // the days lately learned, for the week row, this one included
    const week = await this.streaks.recent(userId, timeZone);

    // Best-effort rewards after the commit, for the call that completed the
    // session only: a failure here never fails the completion, and each is
    // idempotent besides.
    if (this.gems && claimedNow && firstCompletion && perfect) {
      await this.gems.grant(userId, PERFECT_LESSON_GEM_RULE, perfectLessonRef(slot, userId)).catch(() => undefined);
    }
    if (this.milestones && claimedNow) {
      // out of the whole lesson, so a lesson with something put off is never "perfect"
      const wholeLesson = session.total_count > 0 ? correct / session.total_count : 0;
      if (this.milestones.recordLesson) {
        await this.milestones.recordLesson(userId, wholeLesson, streak.current).catch(() => undefined);
      } else {
        await this.milestones.recordLessonCompleted(userId, wholeLesson).catch(() => undefined);
        await this.milestones.recordStreak(userId, streak.current).catch(() => undefined);
      }
    }

    return {
      correct,
      total: scored,
      accuracy,
      mistakes,
      xpAwarded,
      streak: { ...streak, ...week },
      firstCompletion,
      ...(quests.length > 0 ? { quests } : {}),
      ...(water && water.gained > 0 ? { tree: water } : {}),
    };
  }

  /** Whether no other session of this lesson (any version) by this learner finished before this one. */
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
