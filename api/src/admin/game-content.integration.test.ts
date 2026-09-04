/** Admin management of the shared game word pool (dict_entries) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('admin game content (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let editorToken = '';
  let userToken = '';
  const added: string[] = [];

  async function register(name: string, ip: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${suffix}@it.kurda.app`,
        username: `${name}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const authed = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: '10.98.9.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const editor = await register('gcEditor', '10.98.0.1');
    editorToken = editor.token;
    userToken = (await register('gcPlain', '10.98.0.2')).token;
    await pool.query(`UPDATE users SET roles = '{content_editor}' WHERE id = $1`, [editor.id]);
  });

  afterAll(async () => {
    if (added.length) await pool.query(`DELETE FROM dict_entries WHERE headword = ANY($1)`, [added]);
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('refuses word management to a non-admin', async () => {
    const res = await authed('POST', '/admin/dictionary', userToken, { words: ['sêvik'] });
    expect(res.statusCode).toBe(403);
    expect(await authed('GET', '/admin/dictionary', userToken).then((r) => r.statusCode)).toBe(403);
  });

  it('adds words, skips duplicates, and rejects junk', async () => {
    const w1 = `zt${suffix}a`; // letters only, unique to this run
    const w2 = `zt${suffix}b`;
    added.push(w1, w2);
    const res = await authed('POST', '/admin/dictionary', editorToken, { words: [w1, w2, '  ', '42'] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.added).toEqual(expect.arrayContaining([w1, w2]));
    expect(body.invalid.length).toBeGreaterThan(0); // '  ' and '42' are not words

    // re-adding the same word is a no-op, not a duplicate
    const again = await authed('POST', '/admin/dictionary', editorToken, { words: [w1] });
    expect(again.json().skipped).toContain(w1);
    expect(again.json().added).toHaveLength(0);
  });

  it('lists and searches the pool, and deletes a word', async () => {
    const word = `zq${suffix}`;
    added.push(word);
    await authed('POST', '/admin/dictionary', editorToken, { words: [word] });

    const found = await authed('GET', `/admin/dictionary?q=${encodeURIComponent(word)}`, editorToken);
    expect(found.statusCode).toBe(200);
    const match = found.json().words.find((w: { headword: string }) => w.headword === word);
    expect(match).toBeTruthy();
    // `length` counts Kurdish *letters* (the games' view), so the digits in the
    // run suffix are excluded — not the raw character count.
    const letters = Array.from(word.normalize('NFC').replace(/[^\p{L}]/gu, '')).length;
    expect(match.length).toBe(letters);

    const del = await authed('DELETE', `/admin/dictionary/${match.id}`, editorToken);
    expect(del.statusCode).toBe(200);
    const gone = await authed('GET', `/admin/dictionary?q=${encodeURIComponent(word)}`, editorToken);
    expect(gone.json().words).toHaveLength(0);
  });

  it('computes which dictionary words rhyme with a given word', async () => {
    // 'gul' and 'kul' share a rime; 'roj' does not
    const rhyming = [`gul`, `kul`, `roj`];
    for (const w of rhyming) {
      const r = await authed('POST', '/admin/dictionary', editorToken, { words: [w] });
      if (r.json().added.length) added.push(w);
    }
    const res = await authed('GET', '/admin/dictionary/rhymes?word=gul', editorToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.perfect).toContain('kul');
    expect(body.perfect).not.toContain('roj'); // different rime
    expect(body.perfect).not.toContain('gul'); // never rhymes with itself
  });

  it('lets an admin decide a rhyme pair in both directions', async () => {
    // 'gul'/'kul' share a rime, so it is accepted by the derived rule; 'roj' is not
    for (const w of ['gul', 'kul', 'roj']) {
      const r = await authed('POST', '/admin/dictionary', editorToken, { words: [w] });
      if (r.json().added.length) added.push(w);
    }

    // rule OUT a pair the endings accept
    const off = await authed('PUT', '/admin/dictionary/rhymes', editorToken, { word: 'gul', rhyme: 'kul', quality: 'none' });
    expect(off.statusCode).toBe(200);
    // and rule IN one they reject
    const on = await authed('PUT', '/admin/dictionary/rhymes', editorToken, { word: 'gul', rhyme: 'roj', quality: 'perfect' });
    expect(on.statusCode).toBe(200);

    const report = await authed('GET', '/admin/dictionary/rhymes?word=gul', editorToken);
    expect(report.json().overrides).toMatchObject({ kul: 'none', roj: 'perfect' });
    // candidates lists the pool so a curator can rule in a word the endings missed
    expect(report.json().candidates).toEqual(expect.arrayContaining(['roj']));

    // 'auto' hands the pair back to the derived result
    await authed('PUT', '/admin/dictionary/rhymes', editorToken, { word: 'gul', rhyme: 'kul', quality: 'auto' });
    const after = await authed('GET', '/admin/dictionary/rhymes?word=gul', editorToken);
    expect(after.json().overrides.kul).toBeUndefined();

    await pool.query(`DELETE FROM rhyme_overrides WHERE prompt_normalized = 'gul'`);
  });

  it('refuses a word rhyming with itself', async () => {
    const res = await authed('PUT', '/admin/dictionary/rhymes', editorToken, { word: 'gul', rhyme: 'gul', quality: 'perfect' });
    expect(res.statusCode).toBe(400);
  });

  it('creates, edits and deletes a quiz question', async () => {
    const body = {
      prompt: `test-${suffix}?`,
      options: ['a', 'b', 'c', 'd'],
      correctIndex: 1,
      category: 'vocabulary',
      level: 2,
    };
    const made = await authed('POST', '/admin/quiz/questions', editorToken, body);
    expect(made.statusCode).toBe(201);
    const id = made.json().id;

    const edited = await authed('PUT', `/admin/quiz/questions/${id}`, editorToken, {
      ...body,
      prompt: `edited-${suffix}?`,
      correctIndex: 3,
      active: false,
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ prompt: `edited-${suffix}?`, correctIndex: 3, active: false });

    const listed = await authed('GET', '/admin/quiz/questions', editorToken);
    expect(listed.json().questions.some((q: { id: string }) => q.id === id)).toBe(true);

    expect((await authed('DELETE', `/admin/quiz/questions/${id}`, editorToken)).statusCode).toBe(200);
    expect((await authed('DELETE', `/admin/quiz/questions/${id}`, editorToken)).statusCode).toBe(404);
  });

  it('rejects a question that does not have exactly four options', async () => {
    const res = await authed('POST', '/admin/quiz/questions', editorToken, {
      prompt: 'too few?',
      options: ['a', 'b'],
      correctIndex: 0,
      category: 'vocabulary',
      level: 1,
    });
    expect(res.statusCode).toBe(400);
  });
  it('reports pool coverage per Wordle difficulty band', async () => {
    const res = await authed('GET', '/admin/dictionary/stats', editorToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThan(0);
    const easy = body.difficulties.find((d: { difficulty: string }) => d.difficulty === 'easy');
    expect(easy.lengths).toEqual([4]);
    expect(typeof easy.words).toBe('number');
  });
});
