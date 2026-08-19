/**
 * rhyme_games partitioning (KUR-115) — confirms the table is range-partitioned by
 * started_at and that inserts still route + read back correctly (the solo rhyme
 * training + multiplayer services keep working transparently). Real Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('rhyme_games partitioning (integration)', () => {
  let pool: pg.Pool;
  let userId: string;
  const suffix = Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await pool.query(`SELECT ensure_partitions('rhyme_games', 3, NULL)`);
    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1,$2) RETURNING id`,
      [`rg_${suffix}@it.kurda.app`, `rg_${suffix}`],
    );
    userId = u.rows[0]!.id;
  });

  afterAll(async () => {
    if (userId) await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
  });

  it('is range-partitioned on started_at', async () => {
    const r = await pool.query<{ partstrat: string }>(
      `SELECT partstrat FROM pg_partitioned_table WHERE partrelid = 'rhyme_games'::regclass`,
    );
    expect(r.rows[0]?.partstrat).toBe('r');
  });

  it('routes an insert into a partition and reads it back', async () => {
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO rhyme_games (user_id, prompt, window_ms) VALUES ($1,'gul',60000) RETURNING id`,
      [userId],
    );
    const id = ins.rows[0]!.id;
    // it landed in a concrete partition, not the parent
    const loc = await pool.query<{ tab: string }>(`SELECT tableoid::regclass::text AS tab FROM rhyme_games WHERE id = $1`, [id]);
    expect(loc.rows[0]!.tab).toMatch(/^rhyme_games_/);
    const back = await pool.query<{ prompt: string }>(`SELECT prompt FROM rhyme_games WHERE id = $1 AND user_id = $2`, [id, userId]);
    expect(back.rows[0]!.prompt).toBe('gul');
  });
});
