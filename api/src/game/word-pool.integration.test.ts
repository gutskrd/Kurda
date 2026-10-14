/**
 * Wordle's targets against real Postgres: only Kurmancî words the keyboard can
 * type, however the pool is curated.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { dictionaryKey, letterKey } from '@kurda/shared';
import { loadWordlePool } from './word-pool.js';
import { WordleService } from './wordle-service.js';
import { WordleBattleService } from './wordle-battle-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('the Wordle word pool (integration)', () => {
  let pool: pg.Pool;
  const suffix = Math.random().toString(36).slice(2, 8);

  async function seedWord(client: Pick<pg.Pool, 'query'>, headword: string, dialect: string): Promise<void> {
    await client.query(
      `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games)
       VALUES ($1, $2, $3, $4, true)`,
      [headword, letterKey(headword), dictionaryKey(headword), dialect],
    );
  }

  /**
   * Run with a pool holding nothing but `words`, inside a transaction that is
   * rolled back: the rest of the dictionary is left out of the games for the
   * length of the test and nobody else sees it.
   */
  async function withPool<T>(words: Array<[string, string]>, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE dict_entries SET in_games = false WHERE in_games`);
      for (const [w, d] of words) await seedWord(client, w, d);
      return await run(client);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  }

  let userId = '';

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const res = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id`,
      [`wordpool_${suffix}@it.kurda.app`, `wordpool_${suffix}`],
    );
    userId = res.rows[0]!.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.end();
  });

  it('leaves out Soranî words and words with a letter the keyboard does not have', async () => {
    const words = await withPool(
      [
        ['mala', 'kurmanji'],
        ['çîrok', 'kurmanji'],
        ['کورد', 'sorani'],
        ['kafé', 'kurmanji'],
        ['roj', 'zazaki'],
      ],
      (client) => loadWordlePool(client),
    );
    expect(words.sort()).toEqual(['mala', 'çîrok'].sort());
  });

  it('never sets a daily or practice Wordle the player could not type', async () => {
    await withPool(
      [
        ['mala', 'kurmanji'],
        ['کورد', 'sorani'],
        ['kafé', 'kurmanji'],
      ],
      async (client) => {
        // the service only reads through the pool's query, so the transaction can stand in for it
        const wordle = new WordleService(client as unknown as pg.Pool);
        for (let i = 0; i < 8; i++) {
          const res = await wordle.startPractice(userId, 'easy');
          expect(res.ok).toBe(true);
          if (res.ok) expect(res.game.targetLength).toBe(4);
        }
        const targets = await client.query<{ target: string }>(
          `SELECT DISTINCT target FROM wordle_games WHERE user_id = $1`,
          [userId],
        );
        expect(targets.rows.map((r) => r.target)).toEqual(['mala']);

        const daily = await wordle.startDaily(userId, 'easy');
        expect(daily.ok).toBe(true);
        const row = await client.query<{ target: string }>(
          `SELECT target FROM wordle_games WHERE user_id = $1 AND mode = 'daily'`,
          [userId],
        );
        expect(row.rows[0]!.target).toBe('mala');
      },
    );
  });

  it('says the pool is empty rather than set a word nobody can type', async () => {
    await withPool(
      [
        ['کورد', 'sorani'],
        ['kafé', 'kurmanji'],
      ],
      async (client) => {
        const res = await new WordleService(client as unknown as pg.Pool).startPractice(userId, 'easy');
        expect(res).toEqual({ ok: false, reason: 'empty-pool' });
      },
    );
  });

  it('picks a battle’s word from the same pool', async () => {
    await withPool(
      [
        ['kafé', 'kurmanji'],
        ['کورد', 'sorani'],
      ],
      async (client) => {
        // nothing in it can be typed, so there is no battle to start (and
        // nothing is written: the word is picked before the lobby is made)
        const battles = new WordleBattleService(client as unknown as pg.Pool);
        expect(await battles.create(userId, { difficulty: 'easy' })).toEqual({ ok: false, reason: 'empty-pool' });
      },
    );
  });
});
