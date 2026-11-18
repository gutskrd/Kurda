import type pg from 'pg';

/**
 * Removes test courses with everything under them. A published lesson can only be retired (the immutability trigger
 * refuses deletes and rewrites), and a retired one removed, so lessons are retired first.
 */
export async function removeCourses(pool: Pick<pg.Pool, 'query'>, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query(
    `UPDATE lessons SET status = 'archived' WHERE status = 'published' AND skill_id IN (
       SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = ANY($1::uuid[]))`,
    [ids],
  );
  await pool.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [ids]);
}
