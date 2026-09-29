/** Admin management of the shared game word pool (dict_entries) against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { normalizeWord } from '../game/rhyme.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { letterCount } from '@kurda/shared';

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
    await activate(app, pool, res);
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

  /**
   * The cliff these exist for: a round falls back to the whole pool while
   * NOTHING is marked, so marking the first word silently takes every other
   * word out of the game. Two marked words is not a narrower game, it is a
   * two-word game — which is what happened in production to a 159-word pool.
   *
   * These share one dictionary with every other suite, so the write test puts
   * the flags back exactly as it found them.
   */
  describe('putting the base words back', () => {
    const snapshot = async (): Promise<Array<{ id: string; is_rhyme_prompt: boolean }>> =>
      (await pool.query<{ id: string; is_rhyme_prompt: boolean }>(`SELECT id, is_rhyme_prompt FROM dict_entries`))
        .rows;

    const restore = async (rows: Array<{ id: string; is_rhyme_prompt: boolean }>): Promise<void> => {
      const on = rows.filter((r) => r.is_rhyme_prompt).map((r) => r.id);
      const off = rows.filter((r) => !r.is_rhyme_prompt).map((r) => r.id);
      if (on.length) await pool.query(`UPDATE dict_entries SET is_rhyme_prompt = true WHERE id = ANY($1)`, [on]);
      if (off.length) await pool.query(`UPDATE dict_entries SET is_rhyme_prompt = false WHERE id = ANY($1)`, [off]);
    };

    it('is refused to someone without the role', async () => {
      const res = await authed('POST', '/admin/rhyme/prompts/rebuild', userToken, {});
      expect(res.statusCode).toBe(403);
    });

    it('says what it would do without doing it', async () => {
      // its own rhyming pair, so the numbers below do not depend on what any
      // earlier test happened to leave in the shared dictionary
      await seed(`stêrk${suffix}`);
      await seed(`pêrk${suffix}`);
      const before = await snapshot();

      const res = await authed('POST', '/admin/rhyme/prompts/rebuild', editorToken, { dryRun: true });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.dryRun).toBe(true);
      expect(body.poolSize).toBeGreaterThan(0);
      expect(body.baseWords).toBeGreaterThan(0);
      // a preview that wrote something would be a trap, not a preview
      expect(await snapshot()).toEqual(before);
    });

    /**
     * The guarantee the flag exists to give: a round can always be played.
     *
     * Asserted as an invariant over the result rather than against a word
     * invented to have no rhyme — every word this suite seeds carries the same
     * `suffix`, so they all rhyme with each other and no such word can be
     * built here.
     */
    it('leaves no base word that a round could not be played on', async () => {
      const a = `bilind${suffix}`;
      const b = `kilind${suffix}`;
      await seed(a);
      await seed(b);
      // after seeding, so restoring also puts these back as they started
      const before = await snapshot();

      try {
        const res = await authed('POST', '/admin/rhyme/prompts/rebuild', editorToken, {});
        expect(res.statusCode).toBe(200);
        const body = res.json();

        // every word is either usable as a prompt or explicitly set aside
        expect(body.baseWords + body.withoutRhymes.length).toBe(body.poolSize);

        const marked = await pool.query<{ is_rhyme_prompt: boolean }>(
          `SELECT is_rhyme_prompt FROM dict_entries WHERE headword = ANY($1)`,
          [[a, b]],
        );
        expect(marked.rows.every((r) => r.is_rhyme_prompt)).toBe(true);

        // and the page agrees: nothing offered as a base word has nothing to
        // rhyme against, which is what made a round unplayable
        const view = await authed('GET', '/admin/rhyme/prompts?limit=100', editorToken);
        for (const w of view.json().words as Array<{ headword: string; perfect: number; near: number }>) {
          expect(w.perfect + w.near, `${w.headword} is a base word with nothing to rhyme with`).toBeGreaterThan(0);
        }
      } finally {
        await restore(before);
      }
    });

    /**
     * The whole point, end to end: from a pool serving two prompts back to one
     * serving all of them.
     */
    it('takes a two-word game back to the whole playable pool', async () => {
      const a = `çirûsk${suffix}`;
      const b = `birûsk${suffix}`;
      const c = `hirûsk${suffix}`;
      await seed(a);
      await seed(b);
      await seed(c); // a third that rhymes, so "wider than two" cannot be a fluke
      const before = await snapshot();

      try {
        // exactly the state that broke: everything off, then two marked
        await pool.query(`UPDATE dict_entries SET is_rhyme_prompt = false`);
        await pool.query(`UPDATE dict_entries SET is_rhyme_prompt = true WHERE headword = ANY($1)`, [[a, b]]);

        const narrowed = await authed('GET', '/admin/rhyme/prompts?limit=100', editorToken);
        expect(narrowed.json().total).toBe(2);
        expect(narrowed.json().usingFallback).toBe(false);

        const res = await authed('POST', '/admin/rhyme/prompts/rebuild', editorToken, {});
        expect(res.json().newlyMarked).toBeGreaterThan(0);

        const widened = await authed('GET', '/admin/rhyme/prompts?limit=100', editorToken);
        expect(widened.json().total).toBeGreaterThan(2);
        expect(widened.json().total).toBe(res.json().baseWords);
      } finally {
        await restore(before);
      }
    });
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

  describe('the pool and the dictionary behind it', () => {
    /**
     * A word that arrived the way an import arrives: straight into the table,
     * with no `in_games`.
     *
     * The normalized form is computed rather than reusing the headword, because
     * the games' normalizer drops everything that is not a letter — and the
     * unique suffix these tests build names with contains digits. Storing the
     * raw word means the search, which normalizes what you type, can never match
     * it.
     */
    async function imported(word: string): Promise<void> {
      added.push(word);
      // the games' normalizer, which is what the seed migration and the admin
      // screen both write — not the repository's, which folds diacritics and
      // would not be found by the search this suite exercises
      const normalized = normalizeWord(word);
      await pool.query(
        `INSERT INTO dict_entries (headword, headword_normalized, dialect, letter_count)
         VALUES ($1, $2, 'kurmanji', $3)`,
        [word, normalized, letterCount(word)],
      );
    }

    it('keeps an admin-added word in the pool and an imported one out of it', async () => {
      const mine = `zp${suffix}a`;
      const theirs = `zp${suffix}b`;
      added.push(mine);
      await authed('POST', '/admin/dictionary', editorToken, { words: [mine] });
      await imported(theirs);

      const inPool = await authed('GET', `/admin/dictionary?q=zp${suffix}`, editorToken);
      expect(inPool.json().words.map((w: { headword: string }) => w.headword)).toEqual([mine]);

      /*
       * The regression. `z.coerce.boolean()` is `Boolean(value)`, so the string
       * "false" coerced to **true** and this view returned the pool — the one
       * input a flag like this is guaranteed to be given.
       */
      const outOfPool = await authed('GET', `/admin/dictionary?q=zp${suffix}&inGames=false`, editorToken);
      expect(outOfPool.json().words.map((w: { headword: string }) => w.headword)).toEqual([theirs]);
    });

    /**
     * The band filter and the page are SQL now (1751000114000). They used to be
     * a `.filter()` and a `.slice()` over every matching row, which the
     * dictionary-only view — the one that holds a whole imported lexicon, and
     * the one an admin has to use to promote anything out of it — would have
     * made unusable.
     *
     * What is asserted is the part that is easy to get wrong when a filter moves
     * into SQL beside a LIMIT: the total has to be how many words matched the
     * filter, not how many are on the page.
     */
    it('filters by letter length and pages, in agreement with the games', async () => {
      for (const w of ['pênûs', 'hirmî', 'zêrîn', 'sêvî', 'kevn']) await imported(w);

      const band = await authed('GET', '/admin/dictionary?inGames=false&length=5&limit=2', editorToken);
      const words = band.json().words as Array<{ headword: string; length: number }>;
      expect(words).toHaveLength(2); // the page
      expect(band.json().total).toBeGreaterThanOrEqual(3); // …of everything that matched
      for (const w of words) {
        expect(w.length, w.headword).toBe(5);
        expect(letterCount(w.headword), w.headword).toBe(5);
      }

      const second = await authed('GET', '/admin/dictionary?inGames=false&length=5&limit=2&offset=2', editorToken);
      expect(second.json().total).toBe(band.json().total);
      const seen = new Set(words.map((w) => w.headword));
      for (const w of second.json().words) expect(seen.has(w.headword), w.headword).toBe(false);
    });

    /**
     * A rename is the only thing that changes a headword after it is written, so
     * it is the only thing that can leave the stored length describing a word
     * that is no longer there.
     */
    it('keeps the stored length right when a word is renamed', async () => {
      const short = `zn${suffix}`;
      const id = await seed(short);
      const longer = `${short}ker`;
      added.push(longer);

      await authed('PATCH', `/admin/dictionary/${id}`, editorToken, { headword: longer });
      const found = await authed('GET', `/admin/dictionary?q=${longer}`, editorToken);
      expect(found.json().words[0].length).toBe(letterCount(longer));
    });

    it('counts the pool and the dictionary separately', async () => {
      const before = (await authed('GET', '/admin/dictionary/stats', editorToken)).json();
      await imported(`zq${suffix}`);
      const after = (await authed('GET', '/admin/dictionary/stats', editorToken)).json();

      // an import adds to what a guess is checked against, and to nothing else
      expect(after.dictionary).toBe(before.dictionary + 1);
      expect(after.total).toBe(before.total);
    });

    it('promotes an imported word into the pool, and drops one back out', async () => {
      const word = `zr${suffix}`;
      await imported(word);

      const found = await authed('GET', `/admin/dictionary?q=${word}&inGames=false`, editorToken);
      const id = found.json().words[0].id as string;

      await authed('PATCH', `/admin/dictionary/${id}`, editorToken, { inGames: true });
      const promoted = await authed('GET', `/admin/dictionary?q=${word}`, editorToken);
      expect(promoted.json().words[0].inGames).toBe(true);

      await authed('PATCH', `/admin/dictionary/${id}`, editorToken, { inGames: false });
      const demoted = await authed('GET', `/admin/dictionary?q=${word}&inGames=false`, editorToken);
      expect(demoted.json().words[0].inGames).toBe(false);
    });

    /**
     * A prompt outside the pool is a round the game will never open, so dropping
     * a word out has to take its prompt flag with it rather than leave a promise
     * the coverage view would go on counting.
     */
    it('clears the rhyme-prompt flag when a word leaves the pool', async () => {
      const word = `zs${suffix}`;
      const id = await seed(word, true);

      await authed('PATCH', `/admin/dictionary/${id}`, editorToken, { inGames: false });
      const after = await authed('GET', `/admin/dictionary?q=${word}&inGames=false`, editorToken);
      expect(after.json().words[0].isRhymePrompt).toBe(false);
    });
  });
});
