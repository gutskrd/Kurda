/**
 * The XP ledger records what was earned and what counts for the league
 * (contract 4 §L4), against real Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { XpService, type AwardedXp } from './service.js';
import { makeLearner, removeLearners } from '../test/progress.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('XP ledger: earned and counted (integration)', () => {
  let pool: pg.Pool;
  let xp: XpService;
  const heard: AwardedXp[] = [];
  const suffix = Date.now().toString(36);
  let n = 0;
  const learner = async () => makeLearner(pool, `xpl${suffix}${++n}`);
  const ledger = async (userId: string) =>
    (
      await pool.query<{ source: string; amount: number; counted: number }>(
        `SELECT source, amount, counted FROM xp_ledger WHERE user_id = $1 ORDER BY created_at, id`,
        [userId],
      )
    ).rows;
  const total = async (userId: string) =>
    (await pool.query<{ xp: number }>(`SELECT xp FROM users WHERE id = $1`, [userId])).rows[0]!.xp;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 20 });
    xp = new XpService(pool, (a) => heard.push(a));
  });

  afterAll(async () => {
    await removeLearners(pool, `xpl${suffix}%`);
    await pool.end();
  });

  it('pays games in full to the total, but counts only 60 a day of them for the league', async () => {
    const p = await learner();
    await xp.award({ userId: p.id, source: 'wordle_battle', amount: 100, refId: `b1-${p.id}` });
    await xp.award({ userId: p.id, source: 'rhyme_match', amount: 80, refId: `m1-${p.id}` });
    await xp.award({ userId: p.id, source: 'lesson_complete', amount: 20, refId: `l1-${p.id}` });
    expect((await ledger(p.id)).map((r) => [r.source, r.amount, r.counted])).toEqual([
      ['wordle_battle', 100, 60],
      ['rhyme_match', 80, 0],
      ['lesson_complete', 20, 20],
    ]);
    expect(await total(p.id)).toBe(200);
    expect(heard.filter((h) => h.userId === p.id).map((h) => h.counted)).toEqual([60, 0, 20]);
  });

  it('counts a day past 300 at half and past 600 at a fifth', async () => {
    const p = await learner();
    for (let i = 0; i < 8; i++) await xp.award({ userId: p.id, source: 'practice_complete', amount: 100, refId: `p${i}-${p.id}` });
    const counted = (await ledger(p.id)).map((r) => r.counted);
    expect(counted).toEqual([100, 100, 100, 50, 50, 50, 20, 20]);
    expect(await total(p.id)).toBe(800);
  });

  it('counts awards that land at the same moment one after another, so the cap holds', async () => {
    const p = await learner();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => xp.award({ userId: p.id, source: 'race', amount: 30, refId: `r${i}-${p.id}` })),
    );
    const rows = await ledger(p.id);
    expect(rows).toHaveLength(10);
    expect(rows.reduce((a, r) => a + r.counted, 0)).toBe(60);
    expect(await total(p.id)).toBe(300);
  });

  it('records nothing twice, and a duplicate counts nothing', async () => {
    const p = await learner();
    expect(await xp.award({ userId: p.id, source: 'lesson_complete', amount: 20, refId: `dup-${p.id}` })).toBe(20);
    expect(await xp.award({ userId: p.id, source: 'lesson_complete', amount: 20, refId: `dup-${p.id}` })).toBe(0);
    expect(await ledger(p.id)).toHaveLength(1);
    expect(await xp.verifyConsistency(p.id)).toBe(true);
  });

  it('joins the caller’s transaction when given one', async () => {
    const p = await learner();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await xp.award({ userId: p.id, source: 'lesson_complete', amount: 20, refId: `tx-${p.id}` }, client);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(await ledger(p.id)).toHaveLength(0);
    expect(await total(p.id)).toBe(0);
  });
});
