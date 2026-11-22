/**
 * The daily upkeep of the monthly-partitioned tables (`ensure_partitions`, migration 1751000084000): the next months
 * made ahead so inserts always have a home, and notifications older than six months dropped a month at a time. Rhyme
 * games keep every month, since the Bilbil badge counts a learner's rhymes for good (badges/measures.ts).
 */
import type pg from 'pg';

/** Months each table keeps before the current one; null keeps them all. */
export const PARTITION_RETENTION_MONTHS: Readonly<Record<'notifications' | 'rhyme_games', number | null>> = {
  notifications: 6,
  rhyme_games: null,
};

interface Log {
  warn: (obj: unknown, msg?: string) => void;
}

/** Idempotent, so every API instance may run it; one table failing does not stop the other. */
export async function upkeepPartitions(pool: Pick<pg.Pool, 'query'>, log?: Log): Promise<void> {
  for (const [table, keep] of Object.entries(PARTITION_RETENTION_MONTHS)) {
    await pool.query('SELECT ensure_partitions($1, 3, $2)', [table, keep]).catch((err) => log?.warn({ err, table }, 'ensure_partitions failed'));
  }
}
