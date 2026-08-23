/**
 * Scalability (KUR-113): index the weekly XP-leaderboard rebuild.
 *
 * `leaderboards/service.ts` rebuilds the weekly board with
 *   SELECT user_id, SUM(amount) FROM xp_ledger
 *   WHERE amount > 0 AND created_at >= <week start> ... GROUP BY user_id
 * The only existing index is (user_id, created_at) — wrong leading column for a
 * global date range — so this did a Seq Scan over the entire append-only ledger
 * every rebuild. A partial btree on created_at (positive amounts only, matching
 * the query's filter) lets the planner range-scan just the week's rows.
 *
 * EXPLAIN (ANALYZE) on a 50k-row bench: Seq Scan (cost 1568, 9.2ms) → Bitmap
 * Index Scan (cost 907, 3.1ms); the gap widens with total ledger size (seq scan
 * grows with all rows, index scan only with the week's). Cost: one partial,
 * single-column index on a high-write table; the `amount > 0` predicate keeps it
 * to credits (excludes debits/corrections). Board results are Redis-cached, so
 * this query runs on periodic rebuilds, not per request.
 */

export const up = (pgm) => {
  pgm.createIndex('xp_ledger', 'created_at', {
    name: 'xp_ledger_created_at_positive',
    where: 'amount > 0',
  });
};

export const down = (pgm) => {
  pgm.dropIndex('xp_ledger', 'created_at', { name: 'xp_ledger_created_at_positive' });
};
