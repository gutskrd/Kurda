/**
 * Notifications partitioning (KUR-115) — proves the planner prunes to a single
 * monthly partition for a time-bounded query, and that ensure_partitions()
 * creates ahead + drops beyond a retention window. Runs against real Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

const monthStart = (offset: number): Date => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
};
const partName = (d: Date): string =>
  `notifications_${d.getUTCFullYear()}_${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const iso = (d: Date): string => d.toISOString();

describe.skipIf(!DATABASE_URL)('notifications partitioning (integration)', () => {
  let pool: pg.Pool;
  let userId: string;
  const suffix = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // ensure the current + next few monthly partitions exist
    await pool.query(`SELECT ensure_partitions('notifications', 3, NULL)`);
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1,$2) RETURNING id`,
      [`notif_${suffix}@it.kurda.app`, `notif_${suffix}`],
    );
    userId = u.rows[0]!.id;
  });

  afterAll(async () => {
    if (userId) await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
  });

  it('is a range-partitioned table', async () => {
    const r = await pool.query<{ partstrat: string }>(
      `SELECT partstrat FROM pg_partitioned_table WHERE partrelid = 'notifications'::regclass`,
    );
    expect(r.rows[0]?.partstrat).toBe('r'); // 'r' = RANGE
  });

  it('prunes to a single monthly partition for a time-bounded query', async () => {
    const m0 = monthStart(0);
    const m1 = monthStart(1);
    const m2 = monthStart(2);
    const at = (base: Date) => new Date(base.getTime() + 5 * 86_400_000); // 5th of the month
    for (const base of [m0, m1, m2]) {
      await pool.query(
        `INSERT INTO notifications (user_id, category, title, body, created_at) VALUES ($1,'test','t','b',$2)`,
        [userId, iso(at(base))],
      );
    }

    // query bounded to the m1 month → planner should scan only that partition
    const plan = await pool.query<{ 'QUERY PLAN': unknown[] }>(
      `EXPLAIN (FORMAT JSON)
       SELECT * FROM notifications
       WHERE user_id = $1 AND created_at >= '${iso(m1)}' AND created_at < '${iso(m2)}'`,
      [userId],
    );
    const planText = JSON.stringify(plan.rows[0]!['QUERY PLAN']);
    expect(planText).toContain(partName(m1)); // the target month is scanned
    expect(planText).not.toContain(partName(m0)); // other months pruned
    expect(planText).not.toContain(partName(m2));
    expect(planText).not.toContain('notifications_default');
  });

  it('ensure_partitions creates ahead and drops beyond a retention window', async () => {
    // a long-past partition that predates any real data
    await pool.query(`CREATE TABLE IF NOT EXISTS notifications_2019_01 PARTITION OF notifications FOR VALUES FROM ('2019-01-01') TO ('2019-02-01')`);
    const exists = async (name: string): Promise<boolean> =>
      (await pool.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [name])).rows[0]!.ok as boolean;
    expect(await exists('notifications_2019_01')).toBe(true);

    // retain 12 months → the 2019 partition is well beyond the cutoff and is dropped;
    // the DEFAULT partition is never touched.
    await pool.query(`SELECT ensure_partitions('notifications', 3, 12)`);
    expect(await exists('notifications_2019_01')).toBe(false);
    expect(await exists('notifications_default')).toBe(true);
    // a future partition was created ahead
    expect(await exists(partName(monthStart(3)))).toBe(true);
  });
});
