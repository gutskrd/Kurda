/** Dictionary search against real Postgres (CI job). KUR-044. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { DictionaryRepository } from './repository.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('dictionary search (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: DictionaryRepository;
  let token: string;
  const ids: string[] = [];
  const suffix = Date.now().toString(36);

  const authed = (url: string) =>
    app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.95.0.1' });

  async function entry(headword: string, pos: 'noun' | 'verb', def: string): Promise<string> {
    const id = await repo.createEntry(headword);
    await repo.addSense(id, 1, pos, def);
    ids.push(id);
    return id;
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new DictionaryRepository(pool);

    await entry('sêv', 'noun', 'apple');
    await entry('ser', 'noun', 'head; top');
    await entry('şev', 'noun', 'night');
    await entry('mamoste', 'noun', 'teacher');

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: `dict_${suffix}@it.kurda.app`, username: `dict_${suffix}`.slice(0, 30), password: 'a-strong-password1', acceptTerms: true },
      remoteAddress: '10.95.0.2',
    });
    token = reg.json().tokens.accessToken;
  });

  afterAll(async () => {
    if (ids.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1)`, [ids]);
    await pool.query(`DELETE FROM users WHERE email = $1`, [`dict_${suffix}@it.kurda.app`]);
    await pool.end();
    await app.close();
  });

  it('normalized prefix "se" finds sêv, ser and şev', async () => {
    const res = await authed('/dictionary/search?q=se');
    expect(res.statusCode).toBe(200);
    const words = res.json().results.map((r: { headword: string }) => r.headword);
    expect(words).toEqual(expect.arrayContaining(['sêv', 'ser', 'şev']));
    expect(res.json().fuzzy).toBe(false);
  });

  it('is bidirectional: English "teacher" finds mamoste', async () => {
    const res = await authed('/dictionary/search?q=teacher');
    const words = res.json().results.map((r: { headword: string }) => r.headword);
    expect(words).toContain('mamoste');
  });

  it('falls back to fuzzy (1 edit) when nothing matches exactly', async () => {
    const res = await authed('/dictionary/search?q=mamoxte'); // one substitution
    expect(res.json().fuzzy).toBe(true);
    expect(res.json().results.map((r: { headword: string }) => r.headword)).toContain('mamoste');
  });

  it('mixed-script / emoji input returns empty, not 500', async () => {
    const res = await authed(`/dictionary/search?q=${encodeURIComponent('🙂🔥')}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([]);
  });

  it('an exact headword ranks first with its sense attached', async () => {
    const res = await authed('/dictionary/search?q=sêv');
    const first = res.json().results[0];
    expect(first).toMatchObject({ headword: 'sêv', matchType: 'exact', pos: 'noun', definitionEn: 'apple' });
  });
});
