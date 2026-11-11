/**
 * Who Am I? alone, and the cards made of picked words, against real Postgres
 * and Redis: a round of hidden identities sent without them, questions
 * answered from the facts and kept with the round, guesses judged and paid by
 * the kit; the admin picking approved words for Bluff cards and identities
 * without retyping the Kurdish; and the starter questions, drafts nobody
 * meets until they are approved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { checkGameContent, dictionaryKey, letterKey, type GameWordCandidate, type WhoAmIItemView } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { XpService } from '../xp/service.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { poolQuiet } from '../test/query-count.js';
import { bustAvailability } from './availability.js';
import { bustGamePools } from './sources.js';
import { learnGameServices } from './routes.js';
import { removeCourses } from '../test/courses.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

const FACTS = ['alive', 'animal', 'person', 'edible', 'place', 'can-fly', 'lives-in-water', 'four-legs', 'bigger-than-person', 'at-home', 'sweet', 'uses-electricity'];

interface StoredItem {
  identity: { id: string; facts: Record<string, boolean> };
  questions: Array<{ id: string; fact: string }>;
  tiles: Array<{ id: string }>;
}

/** What the player knows the identity's own tile by: its place among the round's tiles. */
const handleOf = (item: StoredItem): string => String.fromCharCode(97 + item.tiles.findIndex((t) => t.id === item.identity.id));

describe.skipIf(!DATABASE_URL || !REDIS_URL)('Who Am I? and cards from picked words (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  const tag = `zw${s.replace(/[^a-z]/g, '')}`;
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const contentIds: string[] = [];
  const entryIds: string[] = [];
  let learner = '';
  let learnerId = '';
  let other = '';
  let editor = '';
  let net = 0;

  async function register(name: string, roles = '{}'): Promise<{ token: string; id: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${s}@it.kurda.app`,
        username: `${name}_${s}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: `10.98.${(net = (net + 1) % 250)}.${userIds.length + 1}`,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    if (roles !== '{}') {
      await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
      await pass2fa(app, res.json().tokens.accessToken, '10.98.250.2');
    }
    return { token: res.json().tokens.accessToken as string, id };
  }

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.98.251.3' });

  const stored = async (id: string): Promise<StoredItem[]> => (await pool.query<{ items: StoredItem[] }>(`SELECT items FROM game_sessions WHERE id = $1`, [id])).rows[0]!.items;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });

    // a dozen published identities, each with a full table in its own pattern, and a published question per fact
    for (let i = 0; i < 12; i++) {
      const facts = Object.fromEntries(FACTS.map((f, j) => [f, ((i >> (j % 4)) & 1) === 1]));
      const r = await pool.query<{ id: string }>(
        `INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ('identity', 'kmr', 1, $1::jsonb, 'published', 'approved') RETURNING id`,
        [JSON.stringify({ word: `${tag}id${letters(i)}`, meanings: { en: `identity ${i}` }, category: 'animal', facts })],
      );
      contentIds.push(r.rows[0]!.id);
    }
    for (const [j, fact] of FACTS.entries()) {
      const r = await pool.query<{ id: string }>(
        `INSERT INTO game_content (kind, dialect, level, payload, status, review_status) VALUES ('question_template', 'kmr', 1, $1::jsonb, 'published', 'approved') RETURNING id`,
        [JSON.stringify({ ku: `${tag} pirs ${letters(j)}?`, meanings: { en: `Question about ${fact}?` }, fact })],
      );
      contentIds.push(r.rows[0]!.id);
    }

    // a published lesson teaching two words, and a sentence that uses one of them
    const repo = new ContentRepository(pool);
    const course = await repo.createCourse({ slug: `whoami-${s}`, dialect: 'kurmanji', titleKu: 'K', titleEn: 'Who' });
    courseIds.push(course);
    const unit = await repo.createUnit(course, 1, 'Y', 'Unit');
    const skill = await repo.createSkill(unit, 1, 'S', 'Skill');
    const lesson = await repo.createLesson(skill, 1, 'D', 'Words');
    await repo.addExercise(lesson, 1, 'match_pairs', {
      pairs: [
        { left: `${tag}hirç`, right: 'bear' },
        { left: `${tag}gur`, right: 'wolf' },
      ],
    });
    await repo.addExercise(lesson, 2, 'translate', { prompt: 'In Kurdish: “The bear is big.”', accepted: [`Ev ${tag}hirç mezin e.`] });
    await repo.publishLesson(lesson);

    // a curated dictionary entry with a sense and an example
    const entry = await pool.query<{ id: string }>(
      `INSERT INTO dict_entries (headword, headword_normalized, headword_folded, dialect, in_games, letter_count)
       VALUES ($1, $2, $3, 'kurmanji', true, $4) RETURNING id`,
      [`${tag}gurz`, letterKey(`${tag}gurz`), dictionaryKey(`${tag}gurz`), tag.length + 4],
    );
    entryIds.push(entry.rows[0]!.id);
    const sense = await pool.query<{ id: string }>(`INSERT INTO dict_senses (entry_id, position, pos, definition_en) VALUES ($1, 0, 'noun', 'a club, a mace') RETURNING id`, [
      entry.rows[0]!.id,
    ]);
    await pool.query(`INSERT INTO dict_examples (sense_id, position, text_ku, text_en) VALUES ($1, 0, $2, 'He picked up the club.')`, [sense.rows[0]!.id, `Wî ${tag}gurz hilda.`]);

    await bustGamePools(app.cache);
    await bustAvailability(app.cache);
    ({ token: learner, id: learnerId } = await register('waLearner'));
    ({ token: other } = await register('waOther'));
    ({ token: editor } = await register('waEditor', '{content_editor}'));
  });

  afterAll(async () => {
    await poolQuiet(pool);
    await pool.query(`DELETE FROM game_content WHERE id = ANY($1::uuid[]) OR payload::text LIKE $2`, [contentIds, `%${tag}%`]);
    await removeCourses(pool, courseIds);
    if (entryIds.length) await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1::uuid[])`, [entryIds]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await bustGamePools(app.cache);
    await bustAvailability(app.cache);
    await pool.end();
    await app.close();
  });

  describe('a round alone', () => {
    it('is offered once there are enough approved identities and questions', async () => {
      const res = await app.inject({ method: 'GET', url: '/games/availability?dialect=kmr' });
      expect(res.json().games.find((g: { id: string }) => g.id === 'who-am-i')).toMatchObject({ available: true, difficulties: expect.arrayContaining(['beginner']) });
    });

    it('is sent without its identities, answers questions from the facts once, and judges the guesses', async () => {
      const made = await call('POST', '/games/solo/sessions', learner, { game: 'who-am-i', dialect: 'kmr', difficulty: 'beginner' });
      expect(made.statusCode, made.body).toBe(201);
      const session = made.json();
      const items = session.items as WhoAmIItemView[];
      expect(items.length).toBeGreaterThan(0);
      expect(made.body).not.toContain('"facts"');
      expect(made.body).not.toContain('"identity"');
      expect(items[0]!.tiles.length).toBeGreaterThanOrEqual(3);
      expect(items[0]!.asked).toEqual([]);

      const kept = await stored(session.id);
      const first = kept[0]!;
      // a tile is known by its place in the round, never by the identity behind it
      expect(items[0]!.tiles.map((t) => t.id)).toEqual(first.tiles.map((_, i) => String.fromCharCode(97 + i)));
      for (const t of first.tiles) expect(made.body).not.toContain(t.id);
      const q = first.questions[0]!;
      const ask = (token: string, index: number, question: string) => call('POST', `/games/who-am-i/sessions/${session.id}/ask`, token, { index, question });
      const asked = await ask(learner, 0, q.id);
      expect(asked.statusCode, asked.body).toBe(200);
      expect(asked.json()).toEqual({ index: 0, question: q.id, answer: first.identity.facts[q.fact] === true, asked: [{ question: q.id, answer: first.identity.facts[q.fact] === true }] });
      // asked again: the same answer, counted once
      expect((await ask(learner, 0, q.id)).json().asked).toHaveLength(1);
      // nobody else's round, and nothing it does not offer
      expect((await ask(other, 0, q.id)).statusCode).toBe(404);
      expect((await ask(learner, 0, 'not-a-question')).statusCode).toBe(400);
      // a round come back to shows what was asked
      expect((await call('GET', `/games/solo/sessions/${session.id}`, learner)).json().items[0].asked).toHaveLength(1);

      const wrong = items[0]!.tiles.find((t) => t.id !== handleOf(first))!;
      const miss = (await call('POST', `/games/solo/sessions/${session.id}/answers`, learner, { index: 0, answer: { guess: wrong.id }, attempt: 1 })).json();
      expect(miss).toMatchObject({ correct: false, done: false, hint: { notThis: wrong.id }, correction: null });
      const hit = (await call('POST', `/games/solo/sessions/${session.id}/answers`, learner, { index: 0, answer: { guess: handleOf(first) }, attempt: 2 })).json();
      expect(hit).toMatchObject({ correct: true, done: true, correction: { id: handleOf(first), category: 'animal' } });
      // done: no more questions about it
      expect((await ask(learner, 0, first.questions[1]!.id)).statusCode).toBe(409);
    });

    it('pays by the kit at the finish: right guesses by level, the first-try bonus, once', async () => {
      const session = (await call('POST', '/games/solo/sessions', learner, { game: 'who-am-i', dialect: 'kmr', difficulty: 'beginner' })).json();
      const kept = await stored(session.id);
      for (const [index, item] of kept.entries()) {
        await call('POST', `/games/solo/sessions/${session.id}/answers`, learner, { index, answer: { guess: handleOf(item) }, attempt: 1 });
      }
      const results = (await call('POST', `/games/solo/sessions/${session.id}/finish`, learner)).json();
      expect(results).toMatchObject({ correct: kept.length, firstTry: kept.length, learningCounted: true });
      const ledger = await pool.query<{ amount: number }>(`SELECT amount FROM xp_ledger WHERE source = 'game_who_am_i' AND ref_id = $1`, [`${session.id}:${learnerId}`]);
      expect(ledger.rows[0]!.amount).toBe(results.xp);
      expect((await call('POST', `/games/solo/sessions/${session.id}/finish`, learner)).json()).toEqual(results);
    });
  });

  describe('cards from picked words', () => {
    let words: GameWordCandidate[] = [];

    it('lists approved words, from published lessons and the curated dictionary, with their meanings and an example', async () => {
      const res = await call('GET', `/admin/game-content/words?dialect=kmr&q=${tag}`, editor);
      expect(res.statusCode, res.body).toBe(200);
      words = res.json().words;
      const bear = words.find((w) => w.word === `${tag}hirç`)!;
      expect(bear).toMatchObject({ source: 'vocabulary', meanings: { en: 'bear' }, example: { ku: `Ev ${tag}hirç mezin e.` }, made: {} });
      const club = words.find((w) => w.word === `${tag}gurz`)!;
      expect(club).toMatchObject({ source: 'dictionary', meanings: { en: 'a club, a mace' }, example: { ku: `Wî ${tag}gurz hilda.` } });
      expect((await call('GET', `/admin/game-content/words?dialect=kmr`, learner)).statusCode).toBe(404);
    });

    it('makes a Bluff card of a word as a draft, its Kurdish copied, once per word', async () => {
      const club = words.find((w) => w.word === `${tag}gurz`)!;
      const made = await call('POST', '/admin/game-content/from-word', editor, { kind: 'bluff_card', dialect: 'kmr', ref: club.ref, level: 4 });
      expect(made.statusCode, made.body).toBe(201);
      const row = made.json();
      expect(row).toMatchObject({ kind: 'bluff_card', status: 'draft', reviewStatus: 'unreviewed', origin: club.ref, level: 4 });
      expect(row.payload).toEqual({ word: `${tag}gurz`, definitions: { en: 'a club, a mace' }, example: { ku: `Wî ${tag}gurz hilda.`, meanings: { en: 'He picked up the club.' } } });
      const again = await call('POST', '/admin/game-content/from-word', editor, { kind: 'bluff_card', dialect: 'kmr', ref: club.ref, level: 4 });
      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ code: 'ALREADY_MADE', details: { id: row.id } });

      // its meanings in other languages are the editor's to add; its Kurdish is never typed over
      const added = await call('PUT', `/admin/game-content/${row.id}`, editor, {
        level: 4,
        payload: { ...row.payload, definitions: { ...row.payload.definitions, de: 'eine Keule' } },
        lockVersion: row.lockVersion,
      });
      expect(added.statusCode, added.body).toBe(200);
      const retyped = await call('PUT', `/admin/game-content/${row.id}`, editor, { level: 4, payload: { ...added.json().payload, word: `${tag}gurzz` }, lockVersion: added.json().lockVersion });
      expect(retyped.statusCode).toBe(422);
      expect(retyped.json().details.errors[0].path).toBe('word');
      // a draft no game deals
      const services = learnGameServices(app, { xp: new XpService(app.db) });
      await bustGamePools(app.cache);
      expect((await services.sources.content('bluff_card', 'kmr')).map((c) => c.id)).not.toContain(row.id);
    });

    it('makes an identity of a word with its category and facts, and refuses one without', async () => {
      const bear = words.find((w) => w.word === `${tag}hirç`)!;
      const bare = await call('POST', '/admin/game-content/from-word', editor, { kind: 'identity', dialect: 'kmr', ref: bear.ref, level: 2 });
      expect(bare.statusCode).toBe(422);
      const few = await call('POST', '/admin/game-content/from-word', editor, { kind: 'identity', dialect: 'kmr', ref: bear.ref, level: 2, category: 'animal', facts: { alive: true } });
      expect(few.statusCode).toBe(422);
      const facts = { alive: true, animal: true, 'four-legs': true, 'can-fly': false, 'made-up-fact': true };
      const made = await call('POST', '/admin/game-content/from-word', editor, { kind: 'identity', dialect: 'kmr', ref: bear.ref, level: 2, category: 'animal', facts });
      expect(made.statusCode, made.body).toBe(201);
      expect(made.json().payload).toEqual({ word: `${tag}hirç`, meanings: { en: 'bear' }, category: 'animal', facts: { alive: true, animal: true, 'four-legs': true, 'can-fly': false } });
      const listed = (await call('GET', `/admin/game-content/words?dialect=kmr&q=${tag}`, editor)).json().words as GameWordCandidate[];
      expect(listed.find((w) => w.ref === bear.ref)!.made).toEqual({ identity: made.json().id });
    });

    it('makes identities only of words the lessons teach', async () => {
      const club = words.find((w) => w.word === `${tag}gurz`)!;
      const facts = { alive: false, animal: false, 'four-legs': false, 'can-fly': false };
      const res = await call('POST', '/admin/game-content/from-word', editor, { kind: 'identity', dialect: 'kmr', ref: club.ref, level: 2, category: 'object', facts });
      expect(res.statusCode).toBe(422);
    });

    it('refuses a word that is not approved', async () => {
      const res = await call('POST', '/admin/game-content/from-word', editor, { kind: 'bluff_card', dialect: 'kmr', ref: 'dict:00000000-0000-4000-8000-000000000000', level: 4 });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('the starter questions', () => {
    it('arrive as drafts for native review, a question per fact and variety, each with what to check first', async () => {
      const rows = await pool.query<{ dialect: 'kmr' | 'ckb'; payload: unknown; status: string; review_status: string; review_note: string | null }>(
        `SELECT dialect, payload, status, review_status, review_note FROM game_content WHERE kind = 'question_template' AND source = 'starter'`,
      );
      for (const d of ['kmr', 'ckb'] as const) expect(rows.rows.filter((r) => r.dialect === d).length).toBeGreaterThanOrEqual(12);
      for (const r of rows.rows) {
        expect(checkGameContent('question_template', r.dialect, r.payload).ok).toBe(true);
        if (r.status === 'draft') expect(r.review_note).toMatch(/^Starter/);
      }
      const services = learnGameServices(app, { xp: new XpService(app.db) });
      await bustGamePools(app.cache);
      const live = new Set((await services.sources.content('question_template', 'ckb')).map((c) => c.id));
      const starters = await pool.query<{ id: string }>(`SELECT id FROM game_content WHERE kind = 'question_template' AND source = 'starter' AND status <> 'published'`);
      for (const r of starters.rows) expect(live.has(r.id)).toBe(false);
    });
  });
});

/** A short letters-only suffix for the i-th item: a, b, … z, ba, bb, … */
function letters(i: number): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz';
  return i < 26 ? abc[i]! : abc[Math.floor(i / 26)]! + abc[i % 26]!;
}
