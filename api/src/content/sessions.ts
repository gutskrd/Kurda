import type pg from 'pg';
import type { RecordingVoice } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { SKIPPABLE_TYPES, checkAnswer, revealExercise, sanitizeExercise, type Verdict } from './exercises.js';
import type { ExerciseType } from './repository.js';
import { XpService } from '../xp/service.js';
import { lessonXp } from '../xp/rules.js';
import { StreakService, type StreakSummary } from '../streaks/service.js';
import { answeredTodaySql, countsAsLearning, localDate, safeTimeZone } from '../streaks/streak-logic.js';
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

/** The grammar note on a lesson's skill (KUR-038) and the variety of its course. */
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
  exercises: Array<{
    id: string;
    position: number;
    type: ExerciseType;
    /** answer fields stripped (KUR-028) */
    prompt?: string;
    options?: string[];
    lefts?: string[];
    rights?: string[];
    /** native recordings from the audio studio, where there are any, and who says each (DeliveredAudio) */
    audioUrl?: string;
    audioVoice?: RecordingVoice;
    modelAudioUrl?: string;
    modelAudioVoice?: RecordingVoice;
    audio?: Record<string, string>;
    audioVoices?: Record<string, RecordingVoice>;
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
  /** who says `modelAudioUrl`, when a character is chosen for it */
  modelAudioVoice?: RecordingVoice;
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
  /**
   * The exercises the score is out of: the lesson's, less any listening or
   * speaking item put off and never answered (`SKIPPABLE_TYPES`).
   */
  total: number;
  /** `correct / total` */
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

  /**
   * The grammar note on a lesson's skill (KUR-038) and the variety of its
   * course, read on their own when nothing else has read them yet.
   */
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
   * The session as the learner sees it. The lesson's exercises come with this
   * session's answer to each, if any, in one read: an answer is only ever
   * recorded for an exercise of the session's own lesson (`openSessionWith`).
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
   * The learner's session, still open to answers (not completed, not
   * expired), with one exercise of its lesson and whether this session has
   * answered it yet: everything an answer or a retry checks first, in one read.
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

    // Idempotent per (session, exercise): first answer wins. The answer, the
    // session's count of right answers, and for a repeat the answer that won,
    // are one statement: its SELECT does not see the statement's own insert,
    // so it reads back only an answer given before.
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
        // Feed the answer into spaced repetition (KUR-033), keyed on the
        // exercise until a lexeme model exists (KUR-043). First answer only;
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
   *
   * A listening or speaking item put off and never answered ("Can't listen
   * now", `SKIPPABLE_TYPES`) is left out of the score: the accuracy, and the
   * XP that follows it, are out of the exercises that were answered or could
   * have been, so putting one off costs nothing. It earns nothing either: a
   * lesson with anything put off is not a perfect one, for the Gems or for
   * the first-perfect milestone — otherwise putting off the items that might
   * go wrong would be the way to a perfect lesson.
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

    const timeZone = row.timezone ?? 'UTC';

    let xpAwarded = 0;
    let streak: StreakSummary | null = null;
    let firstCompletion: boolean | null = null;
    let claimedNow = false;
    if (!session.completed_at) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        // Claim the completion transition; only the winner awards XP + streak.
        // The claim takes the slot's lock as it succeeds (RETURNING runs only
        // for a row it updated): one completion of this lesson slot at a time
        // per learner, or sessions completed in parallel each counted no prior
        // completion and each was paid first-time XP.
        const claimed = await client.query(
          `UPDATE lesson_sessions SET completed_at = now()
           WHERE id = $1 AND completed_at IS NULL
           RETURNING id, pg_advisory_xact_lock(hashtextextended($2, 0))`,
          [session.id, `lesson-complete:${userId}:${slot.skillId}:${slot.position}`],
        );
        if ((claimed.rowCount ?? 0) > 0) {
          claimedNow = true;
          const tz = safeTimeZone(timeZone);
          // Repeat = this learner already completed this lesson before, in
          // this version or any other. Today's completions (UTC, the league's
          // day) decide whether a repeat still pays (xp/rules.ts `lessonXp`).
          // Read after the lock, in a statement of its own, so it sees a
          // completion that committed while this one waited; with it, how many
          // of this session's answers were given today (see below).
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
          // not, or the freeze and the daily Zêr could be had for nothing.
          if (countsAsLearning(prior.rows[0]!.answered_today, session.total_count)) {
            streak = await this.streaks.recordActivity(userId, timeZone, new Date(), client);
          }
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
    // perfect: every exercise answered, and answered right
    const perfect = skipped === 0 && accuracy === 1;
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
      streak,
      firstCompletion,
    };
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
