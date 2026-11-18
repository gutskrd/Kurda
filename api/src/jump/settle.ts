import type pg from 'pg';

/** Executor: a pool or a client, so the decision joins the session's completion. */
type Executor = Pick<pg.Pool, 'query'>;

/** What a jump-ahead test opens: the unit in its course, and the place of the skill it opens up to. */
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
 * Records how a finished test came out and, if passed, opens the course up to its unit, in one statement inside the
 * transaction closing the session. How far a course is open only rises, so a test for a unit behind one already open
 * changes nothing; a fail opens nothing.
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
