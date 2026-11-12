/**
 * Who Am I? beside its table, and the cards made of picked words, against
 * real Postgres and Redis: the game on one phone (where it is offered, and a
 * card for everyone in the room), no round of it alone any more and what
 * becomes of one left open; the admin picking approved words for identities
 * without retyping the Kurdish; and the starter questions, drafts nobody
 * meets until they are approved.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { checkGameContent, dictionaryKey, letterKey, type GameWordCandidate, type WhoAmICouchDeals } from '@kurda/shared';
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

  describe('on one phone', () => {
    it('is listed once there are enough approved identities and questions', async () => {
      const res = await app.inject({ method: 'GET', url: '/games/availability?dialect=kmr' });
      expect(res.json().games.find((g: { id: string }) => g.id === 'who-am-i')).toMatchObject({ available: true, difficulties: expect.arrayContaining(['beginner']) });
    });

    it('says where it can be played, to someone signed in', async () => {
      expect((await app.inject({ method: 'GET', url: '/games/who-am-i/couch?dialect=kmr' })).statusCode).toBe(401);
      const offer = (await call('GET', '/games/who-am-i/couch?dialect=kmr', learner)).json();
      expect(offer).toMatchObject({ dialect: 'kmr', difficulties: expect.arrayContaining(['beginner']) });
      // a variety with no identities is offered at no difficulty, rather than with a deal that would fail
      expect((await call('GET', '/games/who-am-i/couch?dialect=ckb', learner)).json().difficulties).not.toContain('advanced');
    });

    it('deals a card for everyone in the room: each a different one, with the facts that answer its questions, and no tile another player wears', async () => {
      const res = await call('POST', '/games/who-am-i/couch/deal', learner, { dialect: 'kmr', difficulty: 'beginner', players: 4 });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const dealt = res.json() as WhoAmICouchDeals;
      expect(dealt).toMatchObject({ dialect: 'kmr', difficulty: 'beginner' });
      expect(dealt.deals).toHaveLength(4);
      const worn = dealt.deals.map((d) => d.identity.id);
      expect(new Set(worn).size).toBe(4);
      for (const d of dealt.deals) {
        expect(d.candidates.some((c) => c.id === d.identity.id)).toBe(true);
        expect(d.candidates.some((c) => c.id !== d.identity.id && worn.includes(c.id))).toBe(false);
        expect(d.questions.length).toBeGreaterThanOrEqual(4);
        // the phone answers a question from the card's own facts
        for (const q of d.questions) expect(typeof d.identity.facts[q.fact]).toBe('boolean');
      }
      // another room is dealt differently
      const again = (await call('POST', '/games/who-am-i/couch/deal', learner, { dialect: 'kmr', difficulty: 'beginner', players: 4 })).json() as WhoAmICouchDeals;
      expect(again.deals.map((d) => d.candidates.map((c) => c.id).join()).join('|')).not.toBe(dealt.deals.map((d) => d.candidates.map((c) => c.id).join()).join('|'));
    });

    it('refuses a room of one or of seven, a difficulty with nothing to deal, and anything else in the body', async () => {
      for (const players of [1, 7]) {
        expect((await call('POST', '/games/who-am-i/couch/deal', learner, { dialect: 'kmr', difficulty: 'beginner', players })).statusCode).toBe(400);
      }
      expect((await call('POST', '/games/who-am-i/couch/deal', learner, { dialect: 'kmr', difficulty: 'beginner', players: 2, names: ['a', 'b'] })).statusCode).toBe(400);
      const none = await call('POST', '/games/who-am-i/couch/deal', learner, { dialect: 'ckb', difficulty: 'advanced', players: 2 });
      expect(none.statusCode).toBe(409);
      expect(none.body).toContain('GAME_UNAVAILABLE');
      expect((await app.inject({ method: 'POST', url: '/games/who-am-i/couch/deal', payload: { dialect: 'kmr', difficulty: 'beginner', players: 2 } })).statusCode).toBe(401);
    });
  });

  describe('a round alone', () => {
    it('cannot be made any more, and one left open is given up without paying', async () => {
      const made = await call('POST', '/games/solo/sessions', learner, { game: 'who-am-i', dialect: 'kmr', difficulty: 'beginner' });
      expect(made.statusCode).toBe(404);
      expect(made.body).toContain('GAME_NOT_FOUND');

      // a round from before, still open on the day the migration runs
      const open = await pool.query<{ id: string }>(
        `INSERT INTO game_sessions (user_id, game, dialect, difficulty, items, total_count, expires_at)
         VALUES ($1, 'who-am-i', 'kmr', 'beginner', '[]'::jsonb, 5, now() + interval '1 day') RETURNING id`,
        [learnerId],
      );
      // the migration as it is written (a path the compiler does not follow: a migration is plain JavaScript)
      const path = '../../migrations/1751000470000_who-am-i-alone-ends.js';
      const migration = (await import(/* @vite-ignore */ path)) as { up: (pgm: unknown) => void };
      const statements: string[] = [];
      migration.up({ sql: (q: string) => statements.push(q) });
      expect(statements).toHaveLength(1);
      for (const q of statements) await pool.query(q);
      const row = (await pool.query<{ expired: boolean; abandoned: boolean; xp: number | null }>(
        `SELECT expires_at <= now() AS expired, (meta->>'abandoned')::boolean AS abandoned, xp_awarded AS xp FROM game_sessions WHERE id = $1`,
        [open.rows[0]!.id],
      )).rows[0]!;
      expect(row).toMatchObject({ expired: true, abandoned: true });
      expect(row.xp ?? 0).toBe(0);
      // it is not opened either: there is nothing here to play it with
      expect((await call('GET', `/games/solo/sessions/${open.rows[0]!.id}`, learner)).statusCode).toBe(404);
      await pool.query(`DELETE FROM game_sessions WHERE id = $1`, [open.rows[0]!.id]);
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

    it('makes no card for a game that is no longer part of Hevalo', async () => {
      const club = words.find((w) => w.word === `${tag}gurz`)!;
      const res = await call('POST', '/admin/game-content/from-word', editor, { kind: 'bluff_card', dialect: 'kmr', ref: club.ref, level: 4 });
      expect(res.statusCode).toBe(400);
      const none = await pool.query(`SELECT 1 FROM game_content WHERE origin = $1`, [club.ref]);
      expect(none.rowCount).toBe(0);
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
      const row = made.json();
      expect(row).toMatchObject({ kind: 'identity', status: 'draft', reviewStatus: 'unreviewed', origin: bear.ref, level: 2 });
      const listed = (await call('GET', `/admin/game-content/words?dialect=kmr&q=${tag}`, editor)).json().words as GameWordCandidate[];
      expect(listed.find((w) => w.ref === bear.ref)!.made).toEqual({ identity: row.id });
      // a word becomes one card of a kind
      const again = await call('POST', '/admin/game-content/from-word', editor, { kind: 'identity', dialect: 'kmr', ref: bear.ref, level: 2, category: 'animal', facts });
      expect(again.statusCode).toBe(409);
      expect(again.json()).toMatchObject({ code: 'ALREADY_MADE', details: { id: row.id } });

      // its meanings in other languages are the editor's to add; its Kurdish is never typed over
      const added = await call('PUT', `/admin/game-content/${row.id}`, editor, {
        level: 2,
        payload: { ...row.payload, meanings: { ...row.payload.meanings, de: 'Bär' } },
        lockVersion: row.lockVersion,
      });
      expect(added.statusCode, added.body).toBe(200);
      const retyped = await call('PUT', `/admin/game-content/${row.id}`, editor, { level: 2, payload: { ...added.json().payload, word: `${tag}hirçç` }, lockVersion: added.json().lockVersion });
      expect(retyped.statusCode).toBe(422);
      expect(retyped.json().details.errors[0].path).toBe('word');
      // a draft no game deals
      const services = learnGameServices(app, { xp: new XpService(app.db) });
      await bustGamePools(app.cache);
      expect((await services.sources.content('identity', 'kmr')).map((c) => c.id)).not.toContain(row.id);
    });

    it('makes identities only of words the lessons teach', async () => {
      const club = words.find((w) => w.word === `${tag}gurz`)!;
      const facts = { alive: false, animal: false, 'four-legs': false, 'can-fly': false };
      const res = await call('POST', '/admin/game-content/from-word', editor, { kind: 'identity', dialect: 'kmr', ref: club.ref, level: 2, category: 'object', facts });
      expect(res.statusCode).toBe(422);
    });

    it('refuses a word that is not approved', async () => {
      const facts = { alive: false, animal: false, 'four-legs': false, 'can-fly': false };
      const res = await call('POST', '/admin/game-content/from-word', editor, {
        kind: 'identity',
        dialect: 'kmr',
        ref: 'vocab:kmr:kmr:000000000000000000000000',
        level: 2,
        category: 'object',
        facts,
      });
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
