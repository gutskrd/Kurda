/** Admin management of the shared game word pool (dict_entries) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { normalizeWord } from '../game/rhyme.js';
import { pass2fa } from '../test/admin-2fa.js';

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

  const authed = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: '10.98.9.9' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const editor = await register('gcEditor', '10.98.0.1');
    editorToken = editor.token;
    userToken = (await register('gcPlain', '10.98.0.2')).token;
    await pool.query(`UPDATE users SET roles = '{content_editor}' WHERE id = $1`, [editor.id]);
    // /admin is gated on 2FA, so a role alone no longer reaches it
    await pass2fa(app, editorToken);
  });

  afterAll(async () => {
    if (added.length) {
      // Decisions are keyed by the normalized word and outlive the entry when it
      // is removed with raw SQL like this. A test that fails mid-way would
      // otherwise leave one behind and silently break a later suite — which is
      // exactly what happened: a stray 'gul'/'kul' ruling made the rhyme
      // training suite reject a word it expects to accept.
      // the fixed words this suite uses are named explicitly: a re-run finds them
      // already present, so they never enter `added` and would escape cleanup
      const forms = [...new Set([...added, 'gul', 'kul', 'roj'].map(normalizeWord))];
      await pool.query(
        `DELETE FROM rhyme_overrides WHERE prompt_normalized = ANY($1) OR rhyme_normalized = ANY($1)`,
        [forms],
      );
      await pool.query(`DELETE FROM dict_entries WHERE headword = ANY($1)`, [added]);
    }
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  /** Add a throwaway word and remember it for cleanup. */
  async function seed(word: string, isRhymePrompt = false): Promise<string> {
    added.push(word);
    await authed('POST', '/admin/dictionary', editorToken, { words: [word], isRhymePrompt });
    const list = await authed('GET', `/admin/dictionary?q=${encodeURIComponent(word)}`, editorToken);
    return list.json().words.find((w: { headword: string }) => w.headword === word).id as string;
  }

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
    const at = (w: string) => body.rhymes.find((r: { word: string }) => r.word === w);
    expect(at('kul')).toMatchObject({ quality: 'perfect', source: 'derived' });
    expect(at('roj')).toBeUndefined(); // different rime
    expect(at('gul')).toBeUndefined(); // never rhymes with itself
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

    const report = (await authed('GET', '/admin/dictionary/rhymes?word=gul', editorToken)).json();
    // ruled in: accepted, and flagged as a decision rather than the endings
    expect(report.rhymes.find((r: { word: string }) => r.word === 'roj')).toMatchObject({
      quality: 'perfect',
      derived: 'none',
      source: 'decided',
    });
    // ruled out: gone from the accepted list, listed separately so it can be undone
    expect(report.rhymes.some((r: { word: string }) => r.word === 'kul')).toBe(false);
    expect(report.ruledOut.find((r: { word: string }) => r.word === 'kul')).toMatchObject({ derived: 'perfect' });
    // candidates are what a curator could still rule in
    expect(report.candidates).toEqual(expect.arrayContaining(['kul']));

    // 'auto' hands the pair back to the derived result
    await authed('PUT', '/admin/dictionary/rhymes', editorToken, { word: 'gul', rhyme: 'kul', quality: 'auto' });
    const after = (await authed('GET', '/admin/dictionary/rhymes?word=gul', editorToken)).json();
    expect(after.rhymes.find((r: { word: string }) => r.word === 'kul')).toMatchObject({
      quality: 'perfect',
      source: 'derived',
    });
    expect(after.ruledOut).toHaveLength(0);
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

  it('adding a word can mark it a base word in one step', async () => {
    const word = `bazbend${suffix}`;
    await seed(word, true);
    const res = await authed('GET', '/admin/rhyme/prompts?limit=100', editorToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().words.some((w: { headword: string }) => w.headword === word)).toBe(true);
  });

  it('re-adding an existing word still promotes it to a base word', async () => {
    const word = `serbilind${suffix}`;
    await seed(word); // not a prompt yet
    const again = await authed('POST', '/admin/dictionary', editorToken, { words: [word], isRhymePrompt: true });
    expect(again.json().skipped).toContain(word); // not duplicated...
    const list = await authed('GET', `/admin/dictionary?q=${encodeURIComponent(word)}`, editorToken);
    expect(list.json().words[0].isRhymePrompt).toBe(true); // ...but promoted
  });

  it('lists base words with how much each has to rhyme against', async () => {
    const base = `kanîzar${suffix}`;
    const mate = `gulzar${suffix}`;
    await seed(base, true);
    await seed(mate);
    await authed('PUT', '/admin/dictionary/rhymes', editorToken, { word: base, rhyme: mate, quality: 'perfect' });

    const res = await authed('GET', `/admin/rhyme/prompts?q=${encodeURIComponent(base)}`, editorToken);
    const row = res.json().words.find((w: { headword: string }) => w.headword === base);
    expect(row.perfect).toBeGreaterThanOrEqual(1);
    expect(row.decided).toBeGreaterThanOrEqual(1);
  });

  it('a renamed base word keeps its rhyme decisions', async () => {
    // decisions are keyed by the normalized word, not its id, so without a
    // migration a rename silently orphans every curated pair
    const before = `hêvîdar${suffix}`;
    const after = `hêvîdarî${suffix}`;
    const mate = `bextiyar${suffix}`;
    const id = await seed(before, true);
    await seed(mate);
    added.push(after);
    await authed('PUT', '/admin/dictionary/rhymes', editorToken, { word: before, rhyme: mate, quality: 'near' });

    const renamed = await authed('PATCH', `/admin/dictionary/${id}`, editorToken, { headword: after });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().headword).toBe(after);

    const view = await authed('GET', `/admin/dictionary/rhymes?word=${encodeURIComponent(after)}`, editorToken);
    const kept = view.json().rhymes.find((r: { word: string }) => r.word === mate);
    expect(kept).toMatchObject({ quality: 'near', source: 'decided' });
  });

  it('refuses a rename that would duplicate another word', async () => {
    const a = `dilşad${suffix}`;
    const b = `dilgeş${suffix}`;
    const id = await seed(a);
    await seed(b);
    const res = await authed('PATCH', `/admin/dictionary/${id}`, editorToken, { headword: b });
    expect(res.statusCode).toBe(409);
  });

  it('deleting a word clears the decisions that referenced it', async () => {
    const base = `çiyager${suffix}`;
    const mate = `rêwîger${suffix}`;
    await seed(base, true);
    const mateId = await seed(mate);
    await authed('PUT', '/admin/dictionary/rhymes', editorToken, { word: base, rhyme: mate, quality: 'perfect' });

    await authed('DELETE', `/admin/dictionary/${mateId}`, editorToken);
    const left = await pool.query(
      `SELECT 1 FROM rhyme_overrides WHERE prompt_normalized = $1 OR rhyme_normalized = $1`,
      // normalizing is more than lowercasing — it strips the digits in the
      // test suffix too, so use the server's own function
      [normalizeWord(mate)],
    );
    // otherwise they linger and quietly reattach if the word is ever added back
    expect(left.rowCount).toBe(0);
  });

  it('adding a rhyme can put it in the pool, because the game needs it there', async () => {
    const base = `dengbêj${suffix}`;
    const fresh = `hunermend${suffix}`;
    await seed(base, true);
    added.push(fresh);

    const res = await authed('PUT', '/admin/dictionary/rhymes', editorToken, {
      word: base,
      rhyme: fresh,
      quality: 'near',
      addToPool: true,
    });
    expect(res.json()).toMatchObject({ ok: true, addedToPool: true });

    const pool2 = await authed('GET', `/admin/dictionary?q=${encodeURIComponent(fresh)}`, editorToken);
    expect(pool2.json().words.map((w: { headword: string }) => w.headword)).toContain(fresh);
  });

  it('separates accepted rhymes from ones a curator ruled out', async () => {
    const base = `zarok${suffix}`;
    const mate = `kanok${suffix}`;
    await seed(base, true);
    await seed(mate);
    // the endings accept it; the curator disagrees
    await authed('PUT', '/admin/dictionary/rhymes', editorToken, { word: base, rhyme: mate, quality: 'none' });

    const view = await authed('GET', `/admin/dictionary/rhymes?word=${encodeURIComponent(base)}`, editorToken);
    const body = view.json();
    expect(body.rhymes.some((r: { word: string }) => r.word === mate)).toBe(false);
    expect(body.ruledOut.some((r: { word: string }) => r.word === mate)).toBe(true);
  });

});
