/**
 * The learning games against real Postgres and Redis: only approved Kurdish
 * reaches a learner, the varieties never mix, a solo round is made, checked,
 * resumed, expired and paid on the server (performance XP, the first-try
 * bonus, nothing for a recent repeat, learning only at half right), the
 * ladder moves, and game content goes through the stories' review model in
 * the admin panel, with its importers and readiness view.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { foldForDialect, gameWords, learnGame, textScript, type GameDialect } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { XpService } from '../xp/service.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { poolQuiet, queriesDuring } from '../test/query-count.js';
import { bustAvailability } from './availability.js';
import { bustGamePools } from './sources.js';
import { learnGameServices } from './routes.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

interface StoredItem {
  key: string;
  ku: string;
  orders: string[];
  tiles: string[];
  rung: string;
  level: number;
}

describe.skipIf(!DATABASE_URL || !REDIS_URL)('learning games (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  // a word of letters only, unique to this run, so this suite's sentences are told from any other suite's
  const tag = `zx${s.replace(/[^a-z]/g, '')}`;
  const tagCkb = 'ژژژ';
  const userIds: string[] = [];
  const courseIds: string[] = [];
  let learner = '';
  let learnerId = '';
  let other = '';
  let otherId = '';
  let editor = '';
  let legacyAdmin = '';
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
      remoteAddress: `10.97.${(net = (net + 1) % 250)}.${userIds.length + 1}`,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    if (roles !== '{}') {
      await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
      await pass2fa(app, res.json().tokens.accessToken, '10.97.250.2');
    }
    return { token: res.json().tokens.accessToken as string, id };
  }

  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.97.251.3' });

  /** A round's items as the server keeps them, answers included. */
  async function stored(sessionId: string): Promise<StoredItem[]> {
    return (await pool.query<{ items: StoredItem[] }>(`SELECT items FROM game_sessions WHERE id = $1`, [sessionId])).rows[0]!.items;
  }

  /** The tiles, by place, that lay an item's first accepted order. */
  function rightOrder(item: StoredItem, dialect: GameDialect): number[] {
    const used = new Set<number>();
    return gameWords(item.orders[0]!).map((w) => {
      const at = item.tiles.findIndex((t, i) => !used.has(i) && foldForDialect(t, dialect) === foldForDialect(w, dialect));
      used.add(at);
      return at;
    });
  }

  /** The right order with its first two tiles swapped: a wrong line. */
  function wrongOrder(item: StoredItem, dialect: GameDialect): number[] {
    const order = rightOrder(item, dialect);
    return [order[1]!, order[0]!, ...order.slice(2)];
  }

  const play = (token: string, dialect: GameDialect, difficulty = 'beginner') =>
    call('POST', '/games/solo/sessions', token, { game: 'build-sentence', dialect, difficulty });
  const answer = (token: string, id: string, index: number, order: number[], attempt?: number) =>
    call('POST', `/games/solo/sessions/${id}/answers`, token, { index, answer: { order }, ...(attempt ? { attempt } : {}) });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const repo = new ContentRepository(pool);

    // a Kurmancî course: one published lesson of short sentences, one of questions, and a draft no game may read
    const kmr = await repo.createCourse({ slug: `games-kmr-${s}`, dialect: 'kurmanji', titleKu: 'K', titleEn: 'Games' });
    courseIds.push(kmr);
    const unit = await repo.createUnit(kmr, 1, 'Y', 'Unit');
    const skill = await repo.createSkill(unit, 1, 'S', 'Skill');
    const short = await repo.createLesson(skill, 1, 'D', 'Short');
    for (let i = 0; i < 36; i++) {
      await repo.addExercise(short, i + 1, 'translate', { prompt: `In Kurdish: “This is thing ${i}.”`, accepted: [`Ev ${tag}${letters(i)} mezin e.`] });
    }
    await repo.publishLesson(short);
    const questions = await repo.createLesson(skill, 2, 'D', 'Questions');
    for (let i = 0; i < 8; i++) {
      await repo.addExercise(questions, i + 1, 'translate', { prompt: `In Kurdish: “Where is thing ${i}?”`, accepted: [`${tag}${letters(i)} li ku ye?`] });
    }
    await repo.publishLesson(questions);
    const draft = await repo.createLesson(skill, 3, 'D', 'Draft');
    await repo.addExercise(draft, 1, 'translate', { prompt: 'In Kurdish: “This is the draft.”', accepted: [`Ev ${tag}draftonly mezin e.`] });

    // a Soranî course of the same shape
    const ckb = await repo.createCourse({ slug: `games-ckb-${s}`, dialect: 'sorani', titleKu: 'ک', titleEn: 'Games ckb' });
    courseIds.push(ckb);
    const cunit = await repo.createUnit(ckb, 1, 'ی', 'Unit');
    const cskill = await repo.createSkill(cunit, 1, 'س', 'Skill');
    const cshort = await repo.createLesson(cskill, 1, 'د', 'Short');
    for (let i = 0; i < 34; i++) {
      await repo.addExercise(cshort, i + 1, 'translate', { prompt: `In Kurdish: “This is thing ${i}.”`, accepted: [`ئەمە ${tagCkb}${arabicLetters(i)} گەورەیە`] });
    }
    await repo.publishLesson(cshort);

    await bustGamePools(app.cache);
    await bustAvailability(app.cache);

    ({ token: learner, id: learnerId } = await register('gmLearner'));
    ({ token: other, id: otherId } = await register('gmOther'));
    ({ token: editor } = await register('gmEditor', '{content_editor}'));
    ({ token: legacyAdmin } = await register('gmAdmin', '{admin}'));
  });

  afterAll(async () => {
    await poolQuiet(pool);
    await pool.query(`DELETE FROM game_content WHERE payload::text LIKE $1`, [`%${tag}%`]);
    await pool.query(`DELETE FROM game_content WHERE payload::text LIKE $1`, [`%${tagCkb}%`]);
    await pool.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courseIds]);
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

  describe('availability', () => {
    it('counts only approved content, per variety, and needs no account', async () => {
      const res = await call('GET', '/games/availability?dialect=kmr', '');
      expect(res.statusCode, res.body).toBe(200);
      const game = res.json().games.find((g: { id: string }) => g.id === 'build-sentence');
      expect(game.minimum).toBe(learnGame('build-sentence').minimum);
      expect(game.available).toBe(true);
      expect(game.difficulties).toContain('beginner');
      expect(game.levels['1']).toBeGreaterThanOrEqual(44);
      expect((await call('GET', '/games/availability?dialect=kurmanji', '')).statusCode).toBe(400);
    });

    it('offers no game made of content nobody has published', async () => {
      const res = await call('GET', '/games/availability?dialect=ckb', '');
      const detective = res.json().games.find((g: { id: string }) => g.id === 'detective');
      expect(detective.available).toBe(false);
      expect(detective.difficulties).toEqual([]);
    });
  });

  describe('a round of Build a Kurdish Sentence', () => {
    it('is made on the server and sent without its answers, from published lessons only', async () => {
      const res = await play(learner, 'kmr');
      expect(res.statusCode, res.body).toBe(201);
      const view = res.json();
      expect(view.items).toHaveLength(8);
      expect(view.states.every((st: { attempts: number }) => st.attempts === 0)).toBe(true);
      for (const item of view.items) {
        expect(Object.keys(item).sort()).toEqual(['index', 'key', 'level', 'meaning', 'rung', 'tiles']);
        expect(item.tiles.join(' ')).not.toContain('draftonly');
        for (const t of item.tiles) expect(textScript(t)).toBe('latin');
      }
      for (const item of await stored(view.id)) expect(item.ku).not.toContain('draftonly');
    });

    it('never mixes the varieties: a Soranî round is Soranî through and through', async () => {
      const res = await play(learner, 'ckb');
      expect(res.statusCode, res.body).toBe(201);
      for (const item of res.json().items) for (const t of item.tiles) expect(textScript(t)).toBe('arabic');
      for (const item of await stored(res.json().id)) expect(textScript(item.ku)).toBe('arabic');
    });

    it('checks each try, nudges before it corrects, and takes no third try', async () => {
      const { id } = (await play(learner, 'kmr')).json();
      const items = await stored(id);

      const first = await answer(learner, id, 0, wrongOrder(items[0]!, 'kmr'), 1);
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json()).toMatchObject({ correct: false, done: false, attempt: 1, correction: null });
      expect(first.json().hint.firstWrong).toBe(0);
      // the same try sent again is the same answer, not a second try
      const again = await answer(learner, id, 0, wrongOrder(items[0]!, 'kmr'), 1);
      expect(again.json()).toEqual(first.json());

      const second = await answer(learner, id, 0, rightOrder(items[0]!, 'kmr'), 2);
      expect(second.json()).toMatchObject({ correct: true, firstTry: false, done: true, hint: null });
      expect(second.json().correction.answer).toBe(items[0]!.ku);
      expect(second.json().correction.words.map((w: { word: string }) => w.word)).toEqual(gameWords(items[0]!.ku));
      expect(second.json().why).toBe(items[0]!.rung);
      expect((await answer(learner, id, 0, rightOrder(items[0]!, 'kmr'))).statusCode).toBe(409);

      const wrongTwice = await answer(learner, id, 1, wrongOrder(items[1]!, 'kmr'));
      expect(wrongTwice.json().done).toBe(false);
      const spent = await answer(learner, id, 1, wrongOrder(items[1]!, 'kmr'));
      expect(spent.json()).toMatchObject({ correct: false, done: true });
      expect(spent.json().correction.firstWrong).toBe(0);
      expect((await answer(learner, id, 99, [0])).statusCode).toBe(404);
      expect((await call('POST', `/games/solo/sessions/${id}/answers`, learner, { index: 2, answer: { order: 'no' } })).statusCode).toBe(400);
    });

    it('is the learner’s own: nobody else reads or answers it', async () => {
      const { id } = (await play(learner, 'kmr')).json();
      expect((await call('GET', `/games/solo/sessions/${id}`, other)).statusCode).toBe(404);
      expect((await answer(other, id, 0, [0])).statusCode).toBe(404);
      expect((await call('POST', `/games/solo/sessions/${id}/finish`, other)).statusCode).toBe(404);
      expect((await call('GET', `/games/solo/sessions/${id}`, '')).statusCode).toBe(401);
    });

    it('can be come back to, and not once it has expired', async () => {
      const { id } = (await play(other, 'kmr')).json();
      const items = await stored(id);
      await answer(other, id, 0, rightOrder(items[0]!, 'kmr'));
      expect((await call('GET', '/games/solo/open?game=build-sentence&dialect=kmr', other)).json().id).toBe(id);
      const view = (await call('GET', `/games/solo/sessions/${id}`, other)).json();
      expect(view.states[0]).toMatchObject({ attempts: 1, correct: true, firstTry: true, done: true });
      expect(view.expired).toBe(false);

      await pool.query(`UPDATE game_sessions SET expires_at = now() - interval '1 second' WHERE id = $1`, [id]);
      expect((await answer(other, id, 1, rightOrder(items[1]!, 'kmr'))).statusCode).toBe(410);
      expect((await call('POST', `/games/solo/sessions/${id}/finish`, other)).statusCode).toBe(410);
      expect((await call('GET', '/games/solo/open?game=build-sentence&dialect=kmr', other)).json().id).toBeNull();
      expect((await call('GET', `/games/solo/sessions/${id}`, other)).json().expired).toBe(true);
    });

    it('pays by performance once, with the first-try bonus, records the learning and opens the next rung', async () => {
      const { id } = (await play(learner, 'kmr')).json();
      const items = await stored(id);
      for (let i = 0; i < items.length; i++) {
        const res = await answer(learner, id, i, rightOrder(items[i]!, 'kmr'));
        expect(res.json().correct, res.body).toBe(true);
      }
      const done = await call('POST', `/games/solo/sessions/${id}/finish`, learner);
      expect(done.statusCode, done.body).toBe(200);
      const results = done.json();
      expect(results).toMatchObject({ correct: 8, total: 8, firstTry: 8, learningCounted: true });
      // two each at level 1 (one for the answer, one for the first try), less any item answered right lately
      const expected = results.items.reduce((sum: number, i: { repeat: boolean }) => sum + (i.repeat ? 0 : 2), 0);
      expect(results.xp).toBe(expected);
      expect(results.streak).toBeGreaterThanOrEqual(1);

      const ledger = await pool.query(`SELECT source, amount, ref_id FROM xp_ledger WHERE ref_id = $1`, [`${id}:${learnerId}`]);
      expect(ledger.rows).toEqual([{ source: 'game_build_sentence', amount: expected, ref_id: `${id}:${learnerId}` }]);
      // asking again answers the same, and pays nothing more
      expect((await call('POST', `/games/solo/sessions/${id}/finish`, learner)).json()).toEqual(results);
      expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE ref_id = $1`, [`${id}:${learnerId}`])).rowCount).toBe(1);
      expect((await answer(learner, id, 0, [0])).statusCode).toBe(409);

      const seen = await pool.query(`SELECT count(*)::int AS n FROM game_seen WHERE user_id = $1 AND game = 'build-sentence' AND last_correct_at IS NOT NULL`, [learnerId]);
      expect(seen.rows[0].n).toBeGreaterThanOrEqual(8);
      const ladder = (await call('GET', '/games/build-sentence/ladder?dialect=kmr', learner)).json();
      expect(ladder.step).toBe(2);
      expect(ladder.rungs.find((r: { rung: string }) => r.rung === 'question').open).toBe(true);
      // the day shows in the streak's recent days
      const recent = await pool.query(`SELECT learning_counted FROM game_sessions WHERE id = $1`, [id]);
      expect(recent.rows[0].learning_counted).toBe(true);
    });

    it('pays nothing for an item answered right in the last two weeks', async () => {
      const { id } = (await play(learner, 'kmr')).json();
      const items = await stored(id);
      // the learner answered the first item right yesterday, in a round this test does not show
      await pool.query(
        `INSERT INTO game_seen (user_id, game, item_key, attempts, correct, last_seen_at, last_correct_at)
         VALUES ($1, 'build-sentence', $2, 1, 1, now() - interval '1 day', now() - interval '1 day')
         ON CONFLICT (user_id, game, item_key) DO UPDATE SET last_correct_at = now() - interval '1 day'`,
        [learnerId, items[0]!.key],
      );
      for (let i = 0; i < items.length; i++) await answer(learner, id, i, rightOrder(items[i]!, 'kmr'));
      const results = (await call('POST', `/games/solo/sessions/${id}/finish`, learner)).json();
      expect(results.items[0]).toMatchObject({ correct: true, repeat: true, xp: 0 });
    });

    it('is not learning when less than half was right: no XP, no streak day', async () => {
      const { id } = (await play(other, 'kmr')).json();
      const items = await stored(id);
      for (let i = 0; i < 3; i++) await answer(other, id, i, rightOrder(items[i]!, 'kmr'));
      for (let i = 3; i < items.length; i++) {
        await answer(other, id, i, wrongOrder(items[i]!, 'kmr'));
        await answer(other, id, i, wrongOrder(items[i]!, 'kmr'));
      }
      const results = (await call('POST', `/games/solo/sessions/${id}/finish`, other)).json();
      expect(results).toMatchObject({ correct: 3, total: 8, xp: 0, learningCounted: false, needed: 4, streak: null });
      expect((await pool.query(`SELECT 1 FROM xp_ledger WHERE ref_id LIKE $1`, [`${id}:%`])).rowCount).toBe(0);
    });

    it('keeps one round open: a new one gives the open one up, and records what it covered as seen', async () => {
      const { id: left } = (await play(other, 'kmr')).json();
      const items = await stored(left);
      // the first item answered wrong twice, its correction read
      await answer(other, left, 0, wrongOrder(items[0]!, 'kmr'));
      await answer(other, left, 0, wrongOrder(items[0]!, 'kmr'));
      const { id: next } = (await play(other, 'kmr')).json();
      expect((await call('GET', '/games/solo/open?game=build-sentence&dialect=kmr', other)).json().id).toBe(next);
      // the round left behind takes nothing more and pays nothing
      expect((await call('GET', `/games/solo/sessions/${left}`, other)).json()).toMatchObject({ expired: true, finished: false });
      expect((await answer(other, left, 1, rightOrder(items[1]!, 'kmr'))).statusCode).toBe(410);
      expect((await call('POST', `/games/solo/sessions/${left}/finish`, other)).statusCode).toBe(410);
      const seen = await pool.query(`SELECT correct, last_correct_at FROM game_seen WHERE user_id = $1 AND game = 'build-sentence' AND item_key = $2`, [otherId, items[0]!.key]);
      expect(seen.rows).toEqual([{ correct: 0, last_correct_at: null }]);
      // so the corrected item comes after the ones never met, not first again
      const fresh = await stored(next);
      expect(fresh.findIndex((i) => i.key === items[0]!.key)).toBe(-1);
      expect((await pool.query(`SELECT count(*)::int AS n FROM game_sessions WHERE user_id = $1 AND game = 'build-sentence' AND finished_at IS NULL AND expires_at > now()`, [otherId])).rows[0].n).toBe(1);
    });

    it('starts at most a few rounds a minute', async () => {
      const { token: hurried } = await register('gHurried');
      const codes: number[] = [];
      for (let i = 0; i < 21; i++) codes.push((await play(hurried, 'kmr')).statusCode);
      expect(codes.slice(0, 20).every((c) => c === 201)).toBe(true);
      expect(codes[20]).toBe(429);
    });

    it('refuses a difficulty with too little approved content', async () => {
      const res = await play(learner, 'kmr', 'advanced');
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('NOT_ENOUGH_CONTENT');
    });

    it('answers a try within a small statement budget', async () => {
      const { id } = (await play(learner, 'kmr')).json();
      const items = await stored(id);
      // the offline gate's setting is read once every few seconds by whichever request comes then: not this call's
      const own = (statements: readonly string[]) => statements.filter((sql) => !/\bFROM maintenance\b/.test(sql));
      await poolQuiet(app.db);
      const answered = await queriesDuring(app.db, () => answer(learner, id, 0, rightOrder(items[0]!, 'kmr')));
      expect(own(answered.statements).length, answered.statements.join('\n')).toBeLessThanOrEqual(12);
      await poolQuiet(app.db);
      // the pools are cached, so a round is made from the learner's own rows and nothing else
      const made = await queriesDuring(app.db, () => play(learner, 'kmr'));
      expect(own(made.statements).length, made.statements.join('\n')).toBeLessThanOrEqual(12);
    });
  });

  describe('game content in the admin panel', () => {
    const sentence = (ku: string) => ({ kind: 'sentence', dialect: 'kmr', level: 1, payload: { ku, meanings: { en: 'This is the test.' } } });

    it('is for the people who edit content, behind the capability', async () => {
      expect((await call('GET', '/admin/game-content', '')).statusCode).toBe(401);
      expect((await call('GET', '/admin/game-content', learner)).statusCode).toBe(404);
      expect((await call('GET', '/admin/game-content', legacyAdmin)).statusCode).toBe(403);
      expect((await call('GET', '/admin/game-content', editor)).statusCode).toBe(200);
    });

    it('refuses Kurdish in the other variety’s script, and a broken payload, with every issue', async () => {
      const soranI = await call('POST', '/admin/game-content', editor, { ...sentence(`ئەمە ${tagCkb} نییە`), dialect: 'kmr' });
      expect(soranI.statusCode).toBe(422);
      expect(soranI.json().details.errors[0].path).toBe('ku');
      const broken = await call('POST', '/admin/game-content', editor, { kind: 'sentence', dialect: 'kmr', level: 1, payload: { ku: 'Ev e' } });
      expect(broken.statusCode).toBe(422);
    });

    it('publishes only what a reviewer approved, and approval goes with a change of content', async () => {
      const created = await call('POST', '/admin/game-content', editor, sentence(`Ev ${tag}review ceribandin e.`));
      expect(created.statusCode, created.body).toBe(201);
      let row = created.json();
      expect(row).toMatchObject({ status: 'draft', reviewStatus: 'unreviewed', source: 'admin', game: 'build-sentence' });

      const services = learnGameServices(app, { xp: new XpService(app.db) });
      const live = async () => (await services.sources.content('sentence', 'kmr')).map((c) => c.id);
      await bustGamePools(app.cache);
      expect(await live()).not.toContain(row.id);

      const early = await call('POST', `/admin/game-content/${row.id}/publish`, editor, { lockVersion: row.lockVersion });
      expect(early.statusCode).toBe(409);
      expect(early.json().code).toBe('NOT_REVIEWED');
      // the table holds the rule too
      await expect(pool.query(`UPDATE game_content SET status = 'published' WHERE id = $1`, [row.id])).rejects.toThrow(/published_is_approved/);

      row = (await call('POST', `/admin/game-content/${row.id}/review`, editor, { approved: true, note: 'read it', lockVersion: row.lockVersion })).json();
      expect(row.reviewStatus).toBe('approved');
      expect((await call('POST', `/admin/game-content/${row.id}/review`, editor, { approved: true, lockVersion: row.lockVersion - 1 })).statusCode).toBe(409);
      const published = await call('POST', `/admin/game-content/${row.id}/publish`, editor, { lockVersion: row.lockVersion });
      expect(published.statusCode, published.body).toBe(200);
      row = published.json();
      expect(row.status).toBe('published');
      expect(await live()).toContain(row.id);

      expect((await call('PUT', `/admin/game-content/${row.id}`, editor, { level: 1, payload: row.payload, lockVersion: row.lockVersion })).statusCode).toBe(409);
      row = (await call('POST', `/admin/game-content/${row.id}/unpublish`, editor, { lockVersion: row.lockVersion })).json();
      expect(await live()).not.toContain(row.id);
      // the same content saved again keeps its approval; changed content loses it
      row = (await call('PUT', `/admin/game-content/${row.id}`, editor, { level: 1, payload: row.payload, lockVersion: row.lockVersion })).json();
      expect(row.reviewStatus).toBe('approved');
      const changed = { ...row.payload, meanings: { en: 'This is another test.' } };
      row = (await call('PUT', `/admin/game-content/${row.id}`, editor, { level: 1, payload: changed, lockVersion: row.lockVersion })).json();
      expect(row.reviewStatus).toBe('unreviewed');

      const audit = await pool.query(`SELECT action FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at`, [row.id]);
      expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['game_content.review', 'game_content.publish', 'game_content.unpublish']));
    });

    it('never lets a row stored in the wrong script reach a learner, even if one got into the table', async () => {
      const bad = await pool.query<{ id: string }>(
        `INSERT INTO game_content (kind, dialect, level, payload, status, review_status)
         VALUES ('sentence', 'kmr', 1, $1::jsonb, 'published', 'approved') RETURNING id`,
        [JSON.stringify({ ku: `ئەمە ${tagCkb} نییە باشە`, meanings: { en: 'mixed' }, orders: [], glosses: [] })],
      );
      await bustGamePools(app.cache);
      const services = learnGameServices(app, { xp: new XpService(app.db) });
      expect((await services.sources.content('sentence', 'kmr')).map((c) => c.id)).not.toContain(bad.rows[0]!.id);
      expect((await services.sources.content('sentence', 'ckb')).map((c) => c.id)).not.toContain(bad.rows[0]!.id);
    });

    it('imports drafts from published lessons without retyping, once', async () => {
      const first = await call('POST', '/admin/game-content/import', editor, { from: 'lessons', dialect: 'kmr' });
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json().created).toBeGreaterThanOrEqual(44);
      const again = (await call('POST', '/admin/game-content/import', editor, { from: 'lessons', dialect: 'kmr' })).json();
      expect(again.created).toBe(0);
      const rows = await pool.query(`SELECT status, review_status, origin, payload FROM game_content WHERE kind = 'sentence' AND payload::text LIKE $1 AND origin IS NOT NULL`, [`%${tag}%`]);
      expect(rows.rows.length).toBeGreaterThanOrEqual(44);
      for (const r of rows.rows) {
        expect(r).toMatchObject({ status: 'draft', review_status: 'unreviewed' });
        expect(r.origin).toMatch(/^(lesson|conversation):/);
        expect(r.payload.ku).not.toContain('draftonly');
      }
      const list = (await call('GET', `/admin/game-content?game=build-sentence&dialect=kmr&status=draft&q=${tag}`, editor)).json();
      expect(list.total).toBeGreaterThanOrEqual(44);
    });

    it('shows each game’s readiness per variety', async () => {
      const res = await call('GET', '/admin/game-content/readiness', editor);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().availability.map((a: { dialect: string }) => a.dialect)).toEqual(['kmr', 'ckb']);
      expect(res.json().counts.some((c: { kind: string; status: string }) => c.kind === 'sentence' && c.status === 'draft')).toBe(true);
    });
  });
});

/** A short letters-only suffix for the i-th sentence: a, b, … z, ba, bb, … */
function letters(i: number): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz';
  return i < 26 ? abc[i]! : abc[Math.floor(i / 26)]! + abc[i % 26]!;
}

/** The same in Arabic letters, for the Soranî sentences. */
function arabicLetters(i: number): string {
  const abc = 'ابپتجچحخدرزسشعغفقکگلمنوهی';
  return i < abc.length ? abc[i]! : abc[Math.floor(i / abc.length)]! + abc[i % abc.length]!;
}
