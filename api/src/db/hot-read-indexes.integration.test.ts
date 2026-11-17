/**
 * The busiest reads use the indexes made for them (migrations
 * `dm-messages-either-side` and `exercises-by-review-item`), on tables filled
 * enough to plan as a full database would; everything, statistics included, is
 * rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('indexes for the busiest reads (integration)', () => {
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);

  beforeAll(() => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  /** Inside one transaction that is rolled back: `fill` the tables, bring their statistics up to date, and answer the plan of what `ask` returns. */
  async function planAfter(fill: (client: pg.PoolClient) => Promise<void>, tables: string[], ask: (client: pg.PoolClient) => Promise<{ sql: string; params: unknown[] }>): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await fill(client);
      for (const table of tables) await client.query(`ANALYZE ${table}`);
      const { sql, params } = await ask(client);
      const res = await client.query<{ 'QUERY PLAN': unknown[] }>(`EXPLAIN (FORMAT JSON) ${sql}`, params);
      return JSON.stringify(res.rows[0]!['QUERY PLAN']);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  }

  /** Sixty people, each in a conversation of ten messages with every other, all read but the last of each. */
  async function fillMessages(client: pg.PoolClient): Promise<void> {
    await client.query(
      `INSERT INTO users (email, username) SELECT 'hri_' || g || '_' || $1 || '@it.kurda.app', 'hri_' || g || '_' || $1 FROM generate_series(1, 60) g`,
      [suffix],
    );
    await client.query(
      `WITH people AS (SELECT id FROM users WHERE username LIKE 'hri\\_%\\_' || $1)
       INSERT INTO dm_messages (user_lo, user_hi, sender_id, body, created_at, read_at)
       SELECT a.id, b.id, CASE WHEN n % 2 = 0 THEN a.id ELSE b.id END, 'silav', now() - n * interval '1 minute',
              CASE WHEN n = 1 THEN NULL ELSE now() END
         FROM people a JOIN people b ON a.id < b.id CROSS JOIN generate_series(1, 10) n`,
      [suffix],
    );
  }

  /** Somebody in the middle of the id order: lower than some partners and higher than others. */
  async function someoneInTheMiddle(client: pg.PoolClient): Promise<string> {
    const res = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE username LIKE 'hri\\_%\\_' || $1 ORDER BY id OFFSET 30 LIMIT 1`,
      [suffix],
    );
    return res.rows[0]!.id;
  }

  it('finds a person’s conversations from either side of the pair by an index', async () => {
    // the conversation list's reach (chat/service.ts `conversations`)
    const plan = await planAfter(fillMessages, ['users', 'dm_messages'], async (client) => ({
      sql: `SELECT user_lo, user_hi, created_at FROM dm_messages WHERE user_lo = $1 OR user_hi = $1`,
      params: [await someoneInTheMiddle(client)],
    }));
    expect(plan).toMatch(/"Index Name":"dm_messages_hi_idx"[^}]*"Index Cond":"\(user_hi = /);
    expect(plan).not.toMatch(/"Node Type":"Seq Scan"[^}]*"Relation Name":"dm_messages"/);
  });

  it('counts a conversation’s unread messages from the unread ones alone', async () => {
    const plan = await planAfter(fillMessages, ['users', 'dm_messages'], async (client) => {
      const me = await someoneInTheMiddle(client);
      const pair = await client.query<{ user_lo: string; user_hi: string }>(`SELECT user_lo, user_hi FROM dm_messages WHERE user_lo = $1 LIMIT 1`, [me]);
      return {
        sql: `SELECT count(*)::int FROM dm_messages m WHERE m.user_lo = $1 AND m.user_hi = $2 AND m.sender_id <> $3 AND m.read_at IS NULL`,
        params: [pair.rows[0]!.user_lo, pair.rows[0]!.user_hi, me],
      };
    });
    expect(plan).toContain('dm_messages_unread_idx');
  });

  it('finds the exercise behind each of a learner’s review items by its id', async () => {
    // the join the practice count, the course maps, the practice hub and the placement strengths make, for a learner in their first week
    const plan = await planAfter(
      async (client) => {
        await client.query(
          `WITH c AS (INSERT INTO courses (slug, title_ku, title_en) VALUES ('hri-' || $1, 'Rê', 'Road') RETURNING id),
                u AS (INSERT INTO units (course_id, position, title_ku, title_en) SELECT id, 1, 'Yek', 'One' FROM c RETURNING id),
                s AS (INSERT INTO skills (unit_id, position, title_ku, title_en) SELECT id, 1, 'Silav', 'Hello' FROM u RETURNING id),
                l AS (INSERT INTO lessons (skill_id, position, title_ku, title_en) SELECT s.id, g, 'Ders', 'Lesson' FROM s, generate_series(1, 400) g RETURNING id)
           INSERT INTO exercises (lesson_id, position, type, payload)
           SELECT l.id, p, 'translate', jsonb_build_object('prompt', repeat('peyv ', 80)) FROM l, generate_series(1, 10) p`,
          [suffix],
        );
        await client.query(`INSERT INTO users (email, username) VALUES ('hri_learner_' || $1 || '@it.kurda.app', 'hri_learner_' || $1)`, [suffix]);
        await client.query(
          `INSERT INTO review_items (user_id, item_id, due_at)
           SELECT (SELECT id FROM users WHERE username = 'hri_learner_' || $1), e.id::text, now()
             FROM exercises e JOIN lessons l ON l.id = e.lesson_id JOIN skills s ON s.id = l.skill_id JOIN units u ON u.id = s.unit_id
             JOIN courses c ON c.id = u.course_id
            WHERE c.slug = 'hri-' || $1 AND l.position <= 3`,
          [suffix],
        );
      },
      ['exercises', 'review_items'],
      async (client) => ({
        sql: `SELECT e.lesson_id, r.easiness FROM review_items r JOIN exercises e ON e.id::text = r.item_id WHERE r.user_id = $1`,
        params: [(await client.query<{ id: string }>(`SELECT id FROM users WHERE username = 'hri_learner_' || $1`, [suffix])).rows[0]!.id],
      }),
    );
    expect(plan).toMatch(/"Index Name":"exercises_id_text_idx"[^}]*"Index Cond":"\(\(id\)::text = r\.item_id\)"/);
    expect(plan).not.toMatch(/"Node Type":"Seq Scan"[^}]*"Relation Name":"exercises"/);
  });
});
