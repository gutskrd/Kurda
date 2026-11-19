/**
 * The busiest reads use their indexes (migrations `dm-messages-either-side`, `dm-messages-unread-either-side`,
 * `exercises-by-review-item`, `wallet-ledger-by-time`, `group-reads-by-member` and `wall-in-time-order`) on tables
 * filled enough to plan like a full database; everything, statistics included, is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { ChatService } from '../chat/service.js';
import { EconomyService } from '../economy/service.js';
import { FeedService } from '../feed/service.js';
import { ImagePostService } from '../images/service.js';
import { LibraryService } from '../library/service.js';

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

  /** In a rolled-back transaction: `fill` the tables, analyze them, and return the plan of what `ask` returns. */
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

  /** The first statement `run` sends through a pool that is really `client`, to plan exactly what a service asks. */
  async function firstStatement(client: pg.PoolClient, run: (pool: pg.Pool) => Promise<unknown>): Promise<{ sql: string; params: unknown[] }> {
    const sent: Array<{ sql: string; params: unknown[] }> = [];
    const pool = {
      query: (sql: string, params: unknown[] = []) => {
        sent.push({ sql, params });
        return client.query(sql, params);
      },
    } as unknown as pg.Pool;
    await run(pool);
    return sent[0]!;
  }

  /** One author with `n` published written posts and `n` pictures, an hour apart, newest last. */
  async function fillWall(client: pg.PoolClient, n: number): Promise<void> {
    await client.query(`INSERT INTO users (email, username) VALUES ('hri_wall_' || $1 || '@it.kurda.app', 'hri_wall_' || $1)`, [suffix]);
    await client.query(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, status, published_at, created_at)
       SELECT u.id, 'user', 'poem', 'Helbest', repeat('peyv ', 60), 'published', now() - g * interval '1 hour', now() - g * interval '1 hour'
         FROM users u, generate_series(1, $2) g WHERE u.username = 'hri_wall_' || $1`,
      [suffix, n],
    );
    await client.query(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, created_at)
       SELECT u.id, 'user', 'hri/' || g, 'Wêne', now() - g * interval '1 hour' - interval '30 minutes'
         FROM users u, generate_series(1, $2) g WHERE u.username = 'hri_wall_' || $1`,
      [suffix, n],
    );
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
    // either partial index of unread messages: both are led by the pair
    expect(plan).toMatch(/"Index Name":"dm_messages_unread(_hi)?_idx"/);
  });

  it('counts a person’s unread messages for the badges from the unread ones on each side of the pair', async () => {
    // chat/service.ts `unread`, what GET /chat/unread answers with
    const plan = await planAfter(fillMessages, ['users', 'dm_messages'], async (client) => {
      const me = await someoneInTheMiddle(client);
      return firstStatement(client, (pool) => new ChatService(pool, {} as never, {} as never).unread(me));
    });
    expect(plan).toMatch(/"Index Name":"dm_messages_unread_idx"[^}]*"Index Cond":"\(user_lo = /);
    expect(plan).toMatch(/"Index Name":"dm_messages_unread_hi_idx"[^}]*"Index Cond":"\(user_hi = /);
    expect(plan).not.toMatch(/"Node Type":"Seq Scan"[^}]*"Relation Name":"dm_messages"/);
  });

  it('finds the exercise behind each of a learner’s review items by its id', async () => {
    // The join the practice count, course maps, practice hub and placement strengths make for a first-week learner.
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

  it('sums a day of the wallet ledger from that day’s pages, not the whole ledger', async () => {
    // the economy rollup (economy/service.ts `aggregateDay`), over a ledger written in time order as it always is
    const plan = await planAfter(
      async (client) => {
        await client.query(`INSERT INTO users (email, username) VALUES ('hri_payer_' || $1 || '@it.kurda.app', 'hri_payer_' || $1)`, [suffix]);
        await client.query(
          `INSERT INTO wallet_ledger (user_id, currency, amount, reason, created_at)
           SELECT u.id, 'zer', 10, 'lesson', now() - interval '60 days' + g * interval '1 minute'
             FROM users u, generate_series(1, 60 * 24 * 60 / 2) g WHERE u.username = 'hri_payer_' || $1 ORDER BY g`,
          [suffix],
        );
      },
      ['wallet_ledger'],
      (client) => firstStatement(client, (pool) => new EconomyService(pool).aggregateDay(new Date(Date.now() - 10 * 86_400_000))),
    );
    expect(plan).toContain('"Index Name":"wallet_ledger_created_at_brin"');
    expect(plan).not.toMatch(/"Node Type":"Seq Scan"[^}]*"Relation Name":"wallet_ledger"/);
  });

  it('finds one member’s read marks without reading every group’s', async () => {
    // the join the group unread counts make (groups/chat-service.ts `unread`), polled by the social rail
    const plan = await planAfter(
      async (client) => {
        await fillMessages(client);
        await client.query(
          `WITH g AS (INSERT INTO groups (name) SELECT 'hri ' || n FROM generate_series(1, 40) n RETURNING id)
           INSERT INTO group_reads (group_id, user_id) SELECT g.id, u.id FROM g, users u WHERE u.username LIKE 'hri\\_%\\_' || $1`,
          [suffix],
        );
      },
      ['group_reads'],
      async (client) => ({ sql: `SELECT group_id, last_read_at FROM group_reads WHERE user_id = $1`, params: [await someoneInTheMiddle(client)] }),
    );
    expect(plan).toContain('"Index Name":"group_reads_user_idx"');
    expect(plan).not.toMatch(/"Node Type":"Seq Scan"[^}]*"Relation Name":"group_reads"/);
  });

  it('reads the newest page of the wall off both tables’ indexes, without sorting every post', async () => {
    const plan = await planAfter(
      (client) => fillWall(client, 2000),
      ['users', 'library_posts', 'image_posts'],
      (client) => firstStatement(client, (pool) => new FeedService(pool).list(null, { limit: 20 })),
    );
    expect(plan).toContain('"Index Name":"library_posts_wall_idx"');
    expect(plan).toContain('"Index Name":"image_posts_wall_idx"');
    expect(plan).not.toMatch(/"Node Type":"Seq Scan"[^}]*"Relation Name":"(library|image)_posts"/);
  });

  it('lists the newest published stories and pictures off an index', async () => {
    for (const [index, run] of [
      ['library_posts_published_idx', (pool: pg.Pool) => new LibraryService(pool).list({ limit: 20 })],
      ['image_posts_wall_idx', (pool: pg.Pool) => new ImagePostService(pool).list({ limit: 20 })],
    ] as const) {
      const plan = await planAfter((client) => fillWall(client, 2000), ['users', 'library_posts', 'image_posts'], (client) => firstStatement(client, run));
      expect(plan).toContain(`"Index Name":"${index}"`);
    }
  });
});
