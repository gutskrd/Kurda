/**
 * Kurdish Detective against real Postgres and Redis: the line picker lists
 * published lines only; a case is put together from them without typing
 * Kurdish, and offered only once it is published; its board keeps every
 * meaning back until it is found or a hint buys it, and each hint costs a
 * point at the finish; the starter case is seeded once, published, made of
 * the course's own lines.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { DETECTIVE_HINTS, conversationLineKey } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';
import { poolQuiet } from '../test/query-count.js';
import { bustAvailability } from './availability.js';
import { bustGamePools } from './sources.js';
import { seedStarterGameContent } from './starters.js';
import { removeCourses } from '../test/courses.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('Kurdish Detective (integration)', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  // a word of letters only, unique to this run, so this suite's lines are told from any other suite's
  const tag = `zq${s.replace(/[^a-z]/g, '')}`;
  const userIds: string[] = [];
  const courseIds: string[] = [];
  const conversationIds: string[] = [];
  let learner = '';
  let learnerId = '';
  let other = '';
  let editor = '';
  let net = 0;
  let scratch = '';

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
      remoteAddress: `10.96.${(net = (net + 1) % 250)}.${userIds.length + 1}`,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    if (roles !== '{}') {
      await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
      await pass2fa(app, res.json().tokens.accessToken, '10.96.250.2');
    }
    return { token: res.json().tokens.accessToken as string, id };
  }

  const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.96.251.3' });

  const word = (i: number, line: number) => `${tag}${letters(i)}${letters(line)}`;

  /** A published conversation of four lines, two people, every line with its English; each line has a word of its own. */
  const conversation = (i: number, id: string) => ({
    id,
    title: 'Axaftin',
    speakers: [{ character: 'hamo' }, { character: 'xezo' }],
    lines: [
      { speaker: 0, text: `${word(i, 0)} li ku ye?`, en: `Where is thing ${i}?` },
      { speaker: 1, text: `${word(i, 1)} li malê ye, xalo.`, en: `Thing ${i} is at home, uncle.` },
      { speaker: 0, text: `Spas, ${word(i, 2)} baş e.`, en: `Thanks, ${i} is fine.` },
      { speaker: 1, text: `Ez ${word(i, 3)} dixwazim niha.`, en: `I want ${i} now.` },
    ],
    prompt: 'Where is it?',
    options: ['At home', 'In town'],
    correctIndex: 0,
  });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const repo = new ContentRepository(pool);
    const course = await repo.createCourse({ slug: `cases-kmr-${s}`, dialect: 'kurmanji', titleKu: 'K', titleEn: 'Cases' });
    courseIds.push(course);
    const unit = await repo.createUnit(course, 1, 'Y', 'Unit');
    const skill = await repo.createSkill(unit, 1, 'S', 'Skill');
    const lesson = await repo.createLesson(skill, 1, 'A', 'Talk');
    for (let i = 0; i < 12; i++) {
      const id = `c${s.replace(/[^a-z0-9]/g, '')}${letters(i)}`.slice(0, 32);
      conversationIds.push(id);
      await repo.addExercise(lesson, i + 1, 'conversation', conversation(i, id));
    }
    await repo.publishLesson(lesson);
    // a draft lesson's conversation, which no game and no import may read
    const draft = await repo.createLesson(skill, 2, 'B', 'Draft');
    await repo.addExercise(draft, 1, 'conversation', { ...conversation(99, `d${s.replace(/[^a-z0-9]/g, '')}`.slice(0, 32)), lines: conversation(99, 'x').lines.map((l) => ({ ...l, text: l.text.replace(word(99, 0), `${tag}draftonly`) })) });
    await bustGamePools(app.cache);
    await bustAvailability(app.cache);

    ({ token: learner, id: learnerId } = await register('wsLearner'));
    ({ token: other } = await register('wsOther'));
    ({ token: editor } = await register('wsEditor', '{content_editor}'));
    scratch = await mkdtemp(path.join(tmpdir(), 'starters-'));
  });

  afterAll(async () => {
    await poolQuiet(pool);
    await pool.query(`DELETE FROM game_content WHERE payload::text LIKE $1 OR origin = $2`, [`%${tag}%`, `starter:${tag}-case`]);
    await pool.query(`DELETE FROM content_seeds WHERE name = $1`, [`game_content:starter:${tag}-case`]);
    await removeCourses(pool, courseIds);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await rm(scratch, { recursive: true, force: true });
    await bustGamePools(app.cache);
    await bustAvailability(app.cache);
    await pool.end();
    await app.close();
  });

  describe('the line picker in the admin panel', () => {
    it('lists published lines to copy into a case, never a draft’s', async () => {
      expect((await call('GET', `/admin/game-content/lines?dialect=kmr&q=${tag}`, learner)).statusCode).toBe(404);
      const res = await call('GET', `/admin/game-content/lines?dialect=kmr&q=${tag}`, editor);
      expect(res.statusCode, res.body).toBe(200);
      const lines = res.json().lines as Array<{ ku: string; en: string; speaker: string; recording: string; origin: { type: string; ref: string } }>;
      expect(lines.length).toBeGreaterThanOrEqual(40);
      expect(lines.some((l) => l.ku.includes('draftonly'))).toBe(false);
      const first = lines.find((l) => l.ku.startsWith(word(0, 0)))!;
      expect(first).toMatchObject({ en: 'Where is thing 0?', speaker: 'hamo', origin: { type: 'conversation' } });
      expect(first.recording).toBe(conversationLineKey(conversationIds[0]!, 0, first.ku));
    });
  });

  describe('Kurdish Detective', () => {
    let caseId = '';

    it('puts a case together from published lines, and offers it only once it is published', async () => {
      const lines = (await call('GET', `/admin/game-content/lines?dialect=kmr&q=${tag}`, editor)).json().lines as Array<{
        ku: string;
        en: string;
        speaker: string;
        recording: string;
        origin: { type: 'conversation'; ref: string };
      }>;
      const pick = (start: string) => lines.find((l) => l.ku.startsWith(start) || l.ku.includes(start))!;
      const card = (id: string, line: ReturnType<typeof pick>, kind: string, from?: string) => ({
        id,
        kind,
        ku: line.ku,
        meanings: { en: line.en },
        speaker: line.speaker,
        recording: line.recording,
        origin: line.origin,
        ...(from ? { from } : {}),
      });
      const payload = {
        title: { en: 'The lost thing' },
        intro: { en: 'Something is missing.' },
        suspects: [
          { id: 'hamo', name: 'Hamo', about: { en: 'The uncle.' }, portrait: 'hamo' },
          { id: 'xezo', name: 'Xezo', about: { en: 'The niece.' }, portrait: 'xezo' },
        ],
        evidence: [card('where', pick(word(1, 0)), 'overheard', 'hamo'), card('home', pick(word(1, 1)), 'statement', 'xezo'), card('want', pick(word(2, 3)), 'message', 'xezo')],
        steps: [
          { prompt: { en: 'Where is it?' }, options: [{ en: 'At home' }, { en: 'In town' }], correctIndex: 0, evidence: ['home'] },
          { prompt: { en: 'Who wants it?' }, options: [{ en: 'Hamo' }, { en: 'Xezo' }], correctIndex: 1, evidence: ['want'] },
        ],
        culprit: 'xezo',
        solution: { en: `Xezo wanted it, and it was at home.` },
        hints: [{ en: 'Read who says what.' }],
      };
      const created = await call('POST', '/admin/game-content', editor, { kind: 'case_file', dialect: 'kmr', level: 2, payload });
      expect(created.statusCode, created.body).toBe(201);
      let row = created.json();
      caseId = row.id;
      expect(row).toMatchObject({ status: 'draft', reviewStatus: 'unreviewed', game: 'detective' });
      await bustAvailability(app.cache);
      const before = (await call('GET', '/games/availability?dialect=kmr', '')).json().games.find((g: { id: string }) => g.id === 'detective');
      const waiting = before.levels['2'];
      row = (await call('POST', `/admin/game-content/${row.id}/review`, editor, { approved: true, lockVersion: row.lockVersion })).json();
      row = (await call('POST', `/admin/game-content/${row.id}/publish`, editor, { lockVersion: row.lockVersion })).json();
      expect(row.status).toBe('published');
      const after = (await call('GET', '/games/availability?dialect=kmr', '')).json().games.find((g: { id: string }) => g.id === 'detective');
      expect(after.levels['2']).toBe(waiting + 1);
      expect(after.difficulties).toContain('beginner');
    });

    it('deals the case with its board, hides every meaning until found or bought with a hint, and pays no XP for a case solved alone', async () => {
      // any other published case was met lately, so this one, never met, is dealt first
      await pool.query(
        `INSERT INTO game_seen (user_id, game, item_key, attempts, correct, last_seen_at, last_correct_at)
         SELECT $1, 'detective', 'gc:' || id || ':accuse', 1, 1, now(), now() FROM game_content
          WHERE kind = 'case_file' AND status = 'published' AND id <> $2
         ON CONFLICT (user_id, game, item_key) DO NOTHING`,
        [learnerId, caseId],
      );
      const res = await call('POST', '/games/solo/sessions', learner, { game: 'detective', dialect: 'kmr', difficulty: 'beginner' });
      expect(res.statusCode, res.body).toBe(201);
      const view = res.json();
      const { id } = view;
      const items = (await pool.query<{ items: Array<{ key: string; kind: string; shown?: number[]; correctIndex?: number; suspects?: string[]; culprit?: string }> }>(
        `SELECT items FROM game_sessions WHERE id = $1`,
        [id],
      )).rows[0]!.items;
      expect(items[0]!.key).toBe(`gc:${caseId}:step:0`);
      expect(view.items.map((i: { kind: string }) => i.kind)).toEqual(['step', 'step', 'accuse']);
      expect(view.board.evidence.every((e: { meanings: unknown }) => e.meanings === null)).toBe(true);
      expect(JSON.stringify(view)).not.toMatch(/culprit|solution|Read who says what/);

      // a hint buys a card's meaning, another reads the written hint, and there are only so many
      const bought = await call('POST', `/games/solo/sessions/${id}/hints`, learner, { evidence: 'where' });
      expect(bought.statusCode, bought.body).toBe(200);
      expect(bought.json().board.evidence.find((e: { id: string }) => e.id === 'where').meanings.en).toBeTruthy();
      expect((await call('POST', `/games/solo/sessions/${id}/hints`, learner, { evidence: 'where' })).json().code).toBe('ALREADY_FOUND');
      const read = (await call('POST', `/games/solo/sessions/${id}/hints`, learner, {})).json();
      expect(read.board).toMatchObject({ hintsUsed: 2, hintsLeft: DETECTIVE_HINTS - 2, hints: [{ en: 'Read who says what.' }], moreHints: false });
      expect((await call('POST', `/games/solo/sessions/${id}/hints`, learner, {})).statusCode).toBe(409);
      expect((await call('POST', `/games/solo/sessions/${id}/hints`, other, { evidence: 'home' })).statusCode).toBe(404);

      // the steps, then the accusation, all right first time
      for (let i = 0; i < 2; i++) {
        const choice = items[i]!.shown!.indexOf(items[i]!.correctIndex!);
        const answered = await call('POST', `/games/solo/sessions/${id}/answers`, learner, { index: i, answer: { choice } });
        expect(answered.json()).toMatchObject({ correct: true, done: true, why: 'step' });
        expect(answered.json().correction.entry.evidence.length).toBeGreaterThan(0);
      }
      const resumed = (await call('GET', `/games/solo/sessions/${id}`, learner)).json();
      expect(resumed.board.notebook).toHaveLength(2);
      expect(resumed.board.evidence.find((e: { id: string }) => e.id === 'home').meanings.en).toBeTruthy();
      const accused = await call('POST', `/games/solo/sessions/${id}/answers`, learner, { index: 2, answer: { choice: items[2]!.suspects!.indexOf('xezo') } });
      expect(accused.json()).toMatchObject({ correct: true, why: 'accuse', correction: { culprit: 'xezo', solution: { en: 'Xezo wanted it, and it was at home.' } } });
      expect(accused.json().correction.walk).toHaveLength(2);

      const done = (await call('POST', `/games/solo/sessions/${id}/finish`, learner)).json();
      // solved, and a day learned; but a game played alone earns no XP, whatever was right and whatever hints were spent
      expect(done).toMatchObject({ correct: 3, total: 3, learningCounted: true, xp: 0 });
      expect(done.deducted).toBeUndefined();
      expect(done.items.every((i: { xp: number }) => i.xp === 0)).toBe(true);
      const ledger = await pool.query(`SELECT source, amount FROM xp_ledger WHERE user_id = $1 AND source LIKE 'game_%'`, [learnerId]);
      expect(ledger.rows).toEqual([]);
      expect((await pool.query(`SELECT xp_awarded, learning_counted FROM game_sessions WHERE id = $1`, [id])).rows[0]).toEqual({ xp_awarded: 0, learning_counted: true });
      expect((await call('POST', `/games/solo/sessions/${id}/hints`, learner, {})).statusCode).toBe(409);
    });

    it('carries the hints spent on a case in a round given up into the next round of it', async () => {
      const { token: sleuth, id: sleuthId } = await register('wsSleuth');
      // every other published case met lately, so this one is dealt
      await pool.query(
        `INSERT INTO game_seen (user_id, game, item_key, attempts, correct, last_seen_at, last_correct_at)
         SELECT $1, 'detective', 'gc:' || id || ':accuse', 1, 1, now(), now() FROM game_content
          WHERE kind = 'case_file' AND status = 'published' AND id <> $2
         ON CONFLICT (user_id, game, item_key) DO NOTHING`,
        [sleuthId, caseId],
      );
      const first = (await call('POST', '/games/solo/sessions', sleuth, { game: 'detective', dialect: 'kmr', difficulty: 'beginner' })).json();
      expect((await call('POST', `/games/solo/sessions/${first.id}/hints`, sleuth, { evidence: 'where' })).statusCode).toBe(200);

      // given up for a new round: the old one takes nothing more, and the new one starts with the hint spent and the card read
      const second = (await call('POST', '/games/solo/sessions', sleuth, { game: 'detective', dialect: 'kmr', difficulty: 'beginner' })).json();
      expect((await call('GET', `/games/solo/sessions/${first.id}`, sleuth)).json().expired).toBe(true);
      expect((await call('POST', `/games/solo/sessions/${first.id}/hints`, sleuth, {})).statusCode).toBe(410);
      const items = (await pool.query<{ items: Array<{ key: string; shown?: number[]; correctIndex?: number; suspects?: string[] }> }>(
        `SELECT items FROM game_sessions WHERE id = $1`,
        [second.id],
      )).rows[0]!.items;
      expect(items[0]!.key).toBe(`gc:${caseId}:step:0`);
      expect(second.board).toMatchObject({ hintsUsed: 1, hintsLeft: DETECTIVE_HINTS - 1 });
      expect(second.board.evidence.find((e: { id: string }) => e.id === 'where').meanings.en).toBeTruthy();

      // played through right: the case is solved, with the one hint it began with spent
      for (let i = 0; i < 2; i++) {
        await call('POST', `/games/solo/sessions/${second.id}/answers`, sleuth, { index: i, answer: { choice: items[i]!.shown!.indexOf(items[i]!.correctIndex!) } });
      }
      await call('POST', `/games/solo/sessions/${second.id}/answers`, sleuth, { index: 2, answer: { choice: items[2]!.suspects!.indexOf('xezo') } });
      const done = (await call('POST', `/games/solo/sessions/${second.id}/finish`, sleuth)).json();
      expect(done).toMatchObject({ correct: 3, learningCounted: true, xp: 0 });

      // a round after one that was finished starts with nothing spent
      await pool.query(`UPDATE game_seen SET last_seen_at = now() - interval '30 days' WHERE user_id = $1 AND item_key = $2`, [sleuthId, `gc:${caseId}:accuse`]);
      const third = (await call('POST', '/games/solo/sessions', sleuth, { game: 'detective', dialect: 'kmr', difficulty: 'beginner' })).json();
      expect(third.board).toMatchObject({ hintsUsed: 0 });

      // a round finished empty did not solve the case: its hint stays spent in the next round of it
      expect((await call('POST', `/games/solo/sessions/${third.id}/hints`, sleuth, { evidence: 'where' })).statusCode).toBe(200);
      const empty = (await call('POST', `/games/solo/sessions/${third.id}/finish`, sleuth)).json();
      expect(empty).toMatchObject({ correct: 0, learningCounted: false, xp: 0 });
      const fourth = (await call('POST', '/games/solo/sessions', sleuth, { game: 'detective', dialect: 'kmr', difficulty: 'beginner' })).json();
      expect(fourth.board).toMatchObject({ hintsUsed: 1, hintsLeft: DETECTIVE_HINTS - 1 });
    });

    it('seeds a starter case once, as an unreviewed draft made of the course’s own lines', async () => {
      const c1 = conversation(1, conversationIds[1]!);
      const file = path.join(scratch, 'detective.json');
      await writeFile(
        file,
        JSON.stringify({
          cases: [
            {
              slug: `${tag}-case`,
              dialect: 'kmr',
              level: 1,
              title: { en: 'A starter' },
              intro: { en: 'Read the cards.' },
              suspects: [
                { id: 'hamo', name: 'Hamo', about: { en: 'The uncle.' } },
                { id: 'xezo', name: 'Xezo', about: { en: 'The niece.' } },
              ],
              evidence: c1.lines.slice(0, 3).map((l, i) => ({ id: `e${i}`, kind: 'statement', line: { conversation: conversationIds[1], en: l.en } })),
              steps: [{ prompt: { en: 'Where?' }, options: [{ en: 'Home' }, { en: 'Town' }], correctIndex: 0, evidence: ['e1'] }],
              culprit: 'hamo',
              solution: { en: 'Hamo.' },
            },
          ],
        }),
      );
      const quiet = { info: () => undefined, warn: () => undefined };
      expect((await seedStarterGameContent(pool, quiet, [pathToFileURL(file)])).seeded).toEqual([`${tag}-case`]);
      const row = (await pool.query(`SELECT status, review_status, source, payload FROM game_content WHERE origin = $1`, [`starter:${tag}-case`])).rows[0];
      // a starter goes in published, with no reviewer named
      expect(row).toMatchObject({ status: 'published', review_status: 'approved', source: 'starter' });
      expect(row.payload.evidence.map((e: { ku: string }) => e.ku)).toEqual(c1.lines.slice(0, 3).map((l) => l.text));
      expect(row.payload.evidence[0].recording).toBe(conversationLineKey(conversationIds[1]!, 0, c1.lines[0]!.text));
      // once only, even after an editor deletes it
      await pool.query(`DELETE FROM game_content WHERE origin = $1`, [`starter:${tag}-case`]);
      expect((await seedStarterGameContent(pool, quiet, [pathToFileURL(file)])).seeded).toEqual([]);
    });
  });
});

/** A short letters-only suffix: a, b, … z, ba, bb, … */
function letters(i: number): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz';
  return i < 26 ? abc[i]! : abc[Math.floor(i / 26)]! + abc[i % 26]!;
}
