import type pg from 'pg';

/** Executor: a pool or a client, so the decision joins the session's completion. */
type Executor = Pick<pg.Pool, 'query'>;

/** What a test to jump ahead opens: the unit, in its course, and the skill's place in the course it opens up to. */
export interface JumpTarget {
  courseId: string;
  unitId: string;
  position: number;
}

/** How a test to jump ahead came out, as the results say it. */
export interface JumpOutcome {
  unitId: string;
  passed: boolean;
  /** answered right the first time, of every item asked */
  correct: number;
  total: number;
  mistakesAllowed: number;
}

/**
 * Note how a finished test came out and, when it was passed, open the course
 * up to the unit it jumps to — in one statement, inside the transaction that
 * closes the session, so it happens once.
 *
 * How far a course is open only ever rises: a test for a unit behind one
 * already opened (by an earlier jump, or the placement test) leaves it where it
 * is. Nothing is opened on a fail.
 */
export async function settleJump(db: Executor, userId: string, jump: JumpTarget & { sessionId: string }, passed: boolean): Promise<void> {
  await db.query(
    `WITH noted AS (UPDATE path_jumps SET passed = $3 WHERE session_id = $1)
     INSERT INTO user_course_progress (user_id, course_id, unlocked_through_position)
     SELECT $2, $4, $5 WHERE $3
     ON CONFLICT (user_id, course_id) DO UPDATE SET
       unlocked_through_position = GREATEST(user_course_progress.unlocked_through_position, EXCLUDED.unlocked_through_position)`,
    [jump.sessionId, userId, passed, jump.courseId, jump.position],
  );
}
