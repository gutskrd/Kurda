import type pg from 'pg';

/** Rows a retention sweep deletes per statement. */
export const DELETE_BATCH = 5_000;

/**
 * Deletes the rows of `table` matching `where`, a batch per statement until none is left, so a backlog after a long
 * pause is many short statements rather than one that holds its locks and outlasts the statement timeout. `table`
 * and `where` are the caller's literals, never input.
 */
export async function deleteInBatches(
  db: Pick<pg.Pool, 'query'>,
  table: string,
  where: string,
  params: unknown[] = [],
  batch: number = DELETE_BATCH,
): Promise<number> {
  let deleted = 0;
  for (;;) {
    const res = await db.query(`DELETE FROM ${table} WHERE ctid IN (SELECT ctid FROM ${table} WHERE ${where} LIMIT ${batch})`, params);
    deleted += res.rowCount ?? 0;
    if ((res.rowCount ?? 0) < batch) return deleted;
  }
}
