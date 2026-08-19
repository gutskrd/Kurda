/** Saved words → SM-2 feed against real Postgres (CI job). KUR-047. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { DictionaryRepository } from './repository.js';
import { NEW_WORDS_PER_DAY, dictItemId } from './saved-words-service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('saved words (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: DictionaryRepository;
  let token: string;
  let userId: string;
  const entryIds: string[] = [];
  const suffix = Date.now().toString(36);

  const authed = (method: 'GET' | 'PUT' | 'DELETE', url: string) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.96.0.1' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new DictionaryRepository(pool);

    for (let i = 0; i < NEW_WORDS_PER_DAY + 3; i++) {
      const id = await repo.createEntry(`sw${suffix}${i}`);
      await repo.addSense(id, 1, 'noun', `def ${i}`);
      entryIds.push(id);
    }

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `sw_${suffix}@it.kurda.app`, username: `sw_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: '10.96.0.2',
    });
    token = reg.json().tokens.accessToken;
    userId = reg.json().user.id;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [entryIds]);
    await pool.end();
    await app.close();
  });

  it('saving bookmarks the entry and schedules it into the review queue', async () => {
    const res = await authed('PUT', `/dictionary/entries/${entryIds[0]}/save`);
    expect(res.json()).toMatchObject({ saved: true, scheduled: true });

    const queue = await authed('GET', '/review/queue');
    expect(queue.json().items.map((i: { itemId: string }) => i.itemId)).toContain(dictItemId(entryIds[0]!));
  });

  it('the entry reports its saved state', async () => {
    expect((await authed('GET', `/dictionary/entries/${entryIds[0]}`)).json().saved).toBe(true);
    expect((await authed('GET', `/dictionary/entries/${entryIds[1]}`)).json().saved).toBe(false);
  });

  it('unsaving keeps the SM-2 row but drops it from the queue', async () => {
    await authed('DELETE', `/dictionary/entries/${entryIds[0]}/save`);
    const queue = await authed('GET', '/review/queue');
    expect(queue.json().items.map((i: { itemId: string }) => i.itemId)).not.toContain(dictItemId(entryIds[0]!));

    // history preserved: the review_items row still exists
    const row = await pool.query(`SELECT 1 FROM review_items WHERE user_id = $1 AND item_id = $2`, [userId, dictItemId(entryIds[0]!)]);
    expect(row.rowCount).toBe(1);
  });

  it('re-saving does not reset the existing history', async () => {
    // age the item so we can tell it was not re-initialized
    await pool.query(`UPDATE review_items SET repetitions = 4 WHERE user_id = $1 AND item_id = $2`, [userId, dictItemId(entryIds[0]!)]);
    const res = await authed('PUT', `/dictionary/entries/${entryIds[0]}/save`);
    expect(res.json().scheduled).toBe(false); // already existed → not newly scheduled
    const row = await pool.query<{ repetitions: number }>(`SELECT repetitions FROM review_items WHERE user_id = $1 AND item_id = $2`, [userId, dictItemId(entryIds[0]!)]);
    expect(row.rows[0]!.repetitions).toBe(4); // untouched
  });

  it('caps new scheduling at 10 per day (still bookmarks)', async () => {
    // entryIds[0] already scheduled; save 9 more to hit the cap of 10
    for (let i = 1; i <= 9; i++) await authed('PUT', `/dictionary/entries/${entryIds[i]}/save`);
    const capped = await authed('PUT', `/dictionary/entries/${entryIds[10]}/save`);
    expect(capped.json()).toMatchObject({ saved: true, scheduled: false }); // bookmarked, not scheduled

    const list = await authed('GET', '/me/saved-words');
    expect(list.json().words.length).toBeGreaterThanOrEqual(10);
  });
});
