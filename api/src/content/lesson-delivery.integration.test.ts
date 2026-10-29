/** Lesson delivery + submission (KUR-028) against real Postgres (CI job). */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { isArabicScript, pairKey, tileAnswer, type DeliveredExercise } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from './repository.js';
import { DictionaryRepository } from '../dictionary/repository.js';
import { PracticeService } from '../practice/service.js';
import { activate } from '../test/activate.js';
import { wordsOf } from './item-words.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('lesson delivery (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  let token: string;
  let userId: string;
  let courseId: string;
  let lessonId: string;
  const ex: Record<string, string> = {};
  const suffix = Date.now().toString(36);

  const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      payload: payload as never,
      headers: { authorization: `Bearer ${token}` },
      remoteAddress: '10.30.0.1',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);

    // seed a small published lesson with one exercise of each type
    courseId = await repo.createCourse({ slug: `del-${suffix}`, titleKu: 'K', titleEn: 'Delivery' });
    const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
    const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
    lessonId = await repo.createLesson(skillId, 1, 'D', 'Lesson');
    ex.mc = await repo.addExercise(lessonId, 1, 'multiple_choice', {
      prompt: '"Sêv"?',
      options: ['Apple', 'Bread', 'Water'],
      correctIndex: 0,
    });
    ex.tr = await repo.addExercise(lessonId, 2, 'translate', { prompt: 'apple', accepted: ['sêv'] });
    ex.mp = await repo.addExercise(lessonId, 3, 'match_pairs', {
      pairs: [
        { left: 'sêv', right: 'apple' },
        { left: 'av', right: 'water' },
      ],
    });
    await repo.publishLesson(lessonId);

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `del_${suffix}@it.kurda.app`,
        username: `del_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.30.0.2',
    });
    await activate(app, pool, reg);
    token = reg.json().tokens.accessToken;
    userId = reg.json().user.id;
  });

  afterAll(async () => {
    // hard-deleting the user cascades into the append-only xp_ledger, which
    // only permits DELETE under the admin flag (see the xp migration).
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  let sessionId: string;
  /** the multiple-choice options in the order this session shows them */
  let mcOptions: string[];
  /** Options are shuffled per session, so a choice is where an option was shown. */
  const shownMcOptions = (view: { exercises: Array<{ id: string; options?: string[] }> }) =>
    view.exercises.find((e) => e.id === ex.mc)!.options!;

  it('starts a session and never leaks the correct answers', async () => {
    const res = await authed('GET', `/lessons/${lessonId}/session`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    sessionId = body.sessionId;
    mcOptions = shownMcOptions(body);
    expect([...mcOptions].sort()).toEqual(['Apple', 'Bread', 'Water']);
    expect(body.exercises).toHaveLength(3);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('correctIndex');
    expect(raw).not.toContain('accepted');
    // match-pairs sent as separate shuffled sides, no pairing
    const mp = body.exercises.find((e: { type: string }) => e.type === 'match_pairs');
    expect(mp.lefts.sort()).toEqual(['av', 'sêv']);
    expect(mp.rights.sort()).toEqual(['apple', 'water']);
    expect(mp.pairs).toBeUndefined();
  });

  it('grades a correct multiple-choice answer', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/answers`, {
      exerciseId: ex.mc,
      answer: { choice: mcOptions.indexOf('Apple') },
    });
    expect(res.json()).toMatchObject({ verdict: 'correct', accepted: true, duplicate: false });
  });

  it('answering is idempotent per exercise (first answer wins)', async () => {
    const replay = await authed('POST', `/sessions/${sessionId}/answers`, {
      exerciseId: ex.mc,
      answer: { choice: mcOptions.indexOf('Water') }, // different, wrong choice
    });
    expect(replay.json()).toMatchObject({ verdict: 'correct', accepted: true, duplicate: true });
  });

  it('accepts a diacritic slip as a typo (still counted right)', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/answers`, {
      exerciseId: ex.tr,
      answer: { text: 'sev' }, // missing ê
    });
    expect(res.json()).toMatchObject({ verdict: 'typo', accepted: true, correction: 'sêv' });
  });

  it('grades match-pairs by content, order-independent', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/answers`, {
      exerciseId: ex.mp,
      answer: {
        matches: [
          { left: 'av', right: 'water' },
          { left: 'sêv', right: 'apple' },
        ],
      },
    });
    expect(res.json()).toMatchObject({ verdict: 'correct', accepted: true });
  });

  it('resume shows which exercises were answered, with the options in the same order', async () => {
    const res = await authed('GET', `/sessions/${sessionId}`);
    const answered = res.json().answered as Record<string, unknown>;
    expect(Object.keys(answered).sort()).toEqual([ex.mc, ex.tr, ex.mp].sort());
    expect(shownMcOptions(res.json())).toEqual(mcOptions);
  });

  it('completes with a results summary, awards full XP, and starts a streak', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/complete`);
    expect(res.statusCode).toBe(200);
    // perfect first completion: BASE (10) + accuracy bonus (10) = 20
    expect(res.json()).toMatchObject({ correct: 3, total: 3, accuracy: 1, xpAwarded: 20 });
    // first lesson finished today → streak of 1
    expect(res.json().streak).toMatchObject({ current: 1, longest: 1, freezes: 0 });
  });

  it('re-completing awards no further XP (idempotent)', async () => {
    const res = await authed('POST', `/sessions/${sessionId}/complete`);
    expect(res.json()).toMatchObject({ xpAwarded: 0, correct: 3, total: 3 });
  });

  it('exposes the XP total and streak on the profile', async () => {
    const res = await authed('GET', `/me`);
    expect(res.json().user.xp).toBe(20);
    expect(res.json().user.streak).toMatchObject({ current: 1, longest: 1 });
  });

  it('completing the lesson meets the default daily goal (KUR-032)', async () => {
    // the perfect completion above awarded 20 XP == the default goal of 20
    const res = await authed('GET', `/me/daily-goal`);
    expect(res.json()).toMatchObject({ goal: 20, earnedXp: 20, completed: true });
  });

  it('a new start after completing creates a fresh session', async () => {
    const res = await authed('GET', `/lessons/${lessonId}/session`);
    expect(res.json().sessionId).not.toBe(sessionId);
  });

  it('repeating a completed lesson pays decayed XP (anti-farm)', async () => {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId;
    // answer everything correctly again
    const choice = shownMcOptions(start.json()).indexOf('Apple');
    await authed('POST', `/sessions/${sid}/answers`, { exerciseId: ex.mc, answer: { choice } });
    await authed('POST', `/sessions/${sid}/answers`, { exerciseId: ex.tr, answer: { text: 'sêv' } });
    await authed('POST', `/sessions/${sid}/answers`, {
      exerciseId: ex.mp,
      answer: {
        matches: [
          { left: 'av', right: 'water' },
          { left: 'sêv', right: 'apple' },
        ],
      },
    });
    const res = await authed('POST', `/sessions/${sid}/complete`);
    // repeat of a perfect lesson: round(20 * 0.25) = 5
    expect(res.json().xpAwarded).toBe(5);
    const me = await authed('GET', `/me`);
    expect(me.json().user.xp).toBe(25);
  });

  it('starting the same lesson twice resumes the same active session', async () => {
    const a = await authed('GET', `/lessons/${lessonId}/session`);
    const b = await authed('GET', `/lessons/${lessonId}/session`);
    expect(a.json().sessionId).toBe(b.json().sessionId);
  });

  it('delivers the skill grammar note in the session + via the route (KUR-038)', async () => {
    const skill = await pool.query<{ skill_id: string }>(
      `SELECT skill_id FROM lessons WHERE id = $1`,
      [lessonId],
    );
    const skillId = skill.rows[0]!.skill_id;
    await pool.query(`UPDATE skills SET grammar_md = $2 WHERE id = $1`, [
      skillId,
      '# Sêv\n\nThe oblique of **sêv** is **sêvê**.',
    ]);

    // rebuilt view (even on resume) carries the note — no session state lost
    const session = await authed('GET', `/lessons/${lessonId}/session`);
    expect(session.json().grammarMd).toContain('**sêvê**');

    const grammar = await authed('GET', `/skills/${skillId}/grammar`);
    expect(grammar.statusCode).toBe(200);
    expect(grammar.json()).toMatchObject({ skillId });
    expect(grammar.json().grammarMd).toContain('oblique');
  });

  it('rejects an unpublished lesson', async () => {
    const draft = await repo.createLesson(
      (await pool.query(`SELECT skill_id FROM lessons WHERE id = $1`, [lessonId])).rows[0].skill_id,
      50,
      'Draft',
      'Draft',
    );
    const res = await authed('GET', `/lessons/${draft}/session`);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('LESSON_NOT_PUBLISHED');
  });

  it('rejects answers to an expired session', async () => {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId;
    await pool.query(
      `UPDATE lesson_sessions SET expires_at = now() - interval '1 hour' WHERE id = $1`,
      [sid],
    );
    const res = await authed('POST', `/sessions/${sid}/answers`, {
      exerciseId: ex.mc,
      answer: { choice: 0 },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('SESSION_EXPIRED');
  });

  it('rejects an answer to an exercise not in the lesson', async () => {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId;
    const res = await authed('POST', `/sessions/${sid}/answers`, {
      exerciseId: '00000000-0000-0000-0000-000000000000',
      answer: { choice: 0 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('another user cannot touch this session', async () => {
    const start = await authed('GET', `/lessons/${lessonId}/session`);
    const sid = start.json().sessionId;
    const other = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `del2_${suffix}@it.kurda.app`,
        username: `del2_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.30.0.3',
    });
    const res = await app.inject({
      method: 'GET',
      url: `/sessions/${sid}`,
      headers: { authorization: `Bearer ${other.json().tokens.accessToken}` },
      remoteAddress: '10.30.0.4',
    });
    expect(res.statusCode).toBe(404);
    await pool.query(`DELETE FROM users WHERE email = $1`, [`del2_${suffix}@it.kurda.app`]);
  });
});

/** The places in `bank` of the answer's words, in order: the tiles a learner lays on the line. */
function rightTiles(bank: readonly string[], answer: string): number[] {
  const placed: number[] = [];
  for (const word of wordsOf(answer)) placed.push(bank.findIndex((tile, i) => tile === word && !placed.includes(i)));
  expect(placed).not.toContain(-1);
  return placed;
}

/** Each word of a prompt that has meanings, with them. */
const meaningsOf = (ex: DeliveredExercise): Record<string, string[]> =>
  Object.fromEntries((ex.promptTokens ?? []).flatMap((t) => (t.meanings ? [[t.text, t.meanings]] : [])));

describe.skipIf(!DATABASE_URL)('word tiles, pairs answered as they are made, and word meanings (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let token: string;
  let userId: string;
  const courses: string[] = [];
  const entries: string[] = [];
  const lessons: Record<'kurmanci' | 'sorani' | 'bare', string> = { kurmanci: '', sorani: '', bare: '' };
  const ex: Record<string, string> = {};
  const suffix = Date.now().toString(36);

  const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${token}` }, remoteAddress: '10.38.0.1' });
  const session = async (lesson: keyof typeof lessons) => {
    const res = await authed('GET', `/lessons/${lessons[lesson]}/session`);
    expect(res.statusCode).toBe(200);
    return res.json() as { sessionId: string; exercises: DeliveredExercise[] };
  };
  const find = (view: { exercises: DeliveredExercise[] }, id: string) => view.exercises.find((e) => e.id === id)!;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const repo = new ContentRepository(pool);
    const lesson = async (dialect: string, name: string) => {
      const courseId = await repo.createCourse({ slug: `tiles-${name}-${suffix}`, dialect, titleKu: 'K', titleEn: `Tiles ${name}` });
      courses.push(courseId);
      const unitId = await repo.createUnit(courseId, 1, 'Y', 'Unit');
      const skillId = await repo.createSkill(unitId, 1, 'B', 'Basics');
      return repo.createLesson(skillId, 1, 'D', 'Lesson');
    };

    lessons.kurmanci = await lesson('kurmanji', 'ku');
    ex.mp = await repo.addExercise(lessons.kurmanci, 1, 'match_pairs', {
      pairs: [
        { left: 'sêv', right: 'apple' },
        { left: 'av', right: 'water' },
        { left: 'nan', right: 'bread' },
        { left: 'şîr', right: 'milk' },
      ],
    });
    ex.tr = await repo.addExercise(lessons.kurmanci, 2, 'translate', { prompt: 'I am fine, thanks.', accepted: ['Ez baş im, spas.'] });
    ex.ls = await repo.addExercise(lessons.kurmanci, 3, 'listening', { prompt: 'Type what you hear.', accepted: ['Navê min Hamo ye.'] });
    ex.mc = await repo.addExercise(lessons.kurmanci, 4, 'multiple_choice', {
      say: 'Sêv',
      prompt: '"Sêv" tê çi wateyê?',
      options: ['apple', 'bread', 'water'],
      correctIndex: 0,
    });
    ex.tr2 = await repo.addExercise(lessons.kurmanci, 5, 'translate', { prompt: 'Bread and milk, please', accepted: ['Nan û şîr, ji kerema xwe'] });
    await repo.publishLesson(lessons.kurmanci);

    lessons.sorani = await lesson('sorani', 'ckb');
    ex.smp = await repo.addExercise(lessons.sorani, 1, 'match_pairs', {
      pairs: [
        { left: 'سێو', right: 'apple' },
        { left: 'ئاو', right: 'water' },
        { left: 'نان', right: 'bread' },
      ],
    });
    ex.str = await repo.addExercise(lessons.sorani, 2, 'translate', { prompt: 'I am fine, thanks.', accepted: ['باشم، سوپاس.'] });
    ex.sls = await repo.addExercise(lessons.sorani, 3, 'listening', { prompt: 'Type what you hear.', accepted: ['ناوم هامۆیە.'] });
    await repo.publishLesson(lessons.sorani);

    // a lesson with nothing to build tiles or meanings from: delivered as it always was
    lessons.bare = await lesson('kurmanji', 'bare');
    ex.btr = await repo.addExercise(lessons.bare, 1, 'translate', { prompt: 'apple', accepted: ['sêv'] });
    ex.bmc = await repo.addExercise(lessons.bare, 2, 'multiple_choice', { prompt: 'Which is a fruit?', options: ['Apple', 'Stone'], correctIndex: 0 });
    await repo.publishLesson(lessons.bare);

    // the dictionary knows two of the question's words
    const dictionary = new DictionaryRepository(pool);
    for (const [headword, meaning] of [
      ['tê', 'comes'],
      ['çi', 'what'],
    ] as const) {
      const id = await dictionary.createEntry(headword, 'kurmanji');
      entries.push(id);
      await dictionary.addSense(id, 1, 'other', meaning);
    }

    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `tiles_${suffix}@it.kurda.app`,
        username: `tiles_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: '10.38.0.2',
    });
    await activate(app, pool, reg);
    token = reg.json().tokens.accessToken;
    userId = reg.json().user.id;
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(`DELETE FROM dict_entries WHERE id = ANY($1::uuid[])`, [entries]);
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = ANY($1::uuid[]))`,
      [courses],
    );
    await pool.query(`DELETE FROM courses WHERE id = ANY($1::uuid[])`, [courses]);
    await pool.end();
    await app.close();
  });

  it('says which meaning each match card pairs with after both sides are shuffled, the same on resume, and grades those pairs right', async () => {
    const view = await session('kurmanci');
    const mp = find(view, ex.mp!);
    const key = pairKey(mp.lefts!, mp.rights!, mp.pairOf)!;
    expect(Object.fromEntries(key)).toEqual({ sêv: 'apple', av: 'water', nan: 'bread', şîr: 'milk' });

    const resumed = (await authed('GET', `/sessions/${view.sessionId}`)).json() as { exercises: DeliveredExercise[] };
    const again = find(resumed, ex.mp!);
    expect([again.lefts, again.rights, again.pairOf]).toEqual([mp.lefts, mp.rights, mp.pairOf]);

    const matches = [...key].map(([left, right]) => ({ left, right }));
    const graded = await authed('POST', `/sessions/${view.sessionId}/answers`, { exerciseId: ex.mp, answer: { matches } });
    expect(graded.json()).toMatchObject({ verdict: 'correct', accepted: true });
  });

  it('accepts the right tiles of a bank joined by spaces, though the answer has capitals, a comma, a full stop and diacritics', async () => {
    const view = await session('kurmanci');
    const tr = find(view, ex.tr!);
    expect(tr.bank).toEqual(expect.arrayContaining(['Ez', 'baş', 'im', 'spas']));
    expect(tr.bank!.length).toBe(8);
    // the tiles that are not the answer are Kurdish, from the session's other items
    const others = tr.bank!.filter((_, i) => !rightTiles(tr.bank!, 'Ez baş im, spas.').includes(i));
    for (const word of others) expect(['sêv', 'av', 'nan', 'şîr', 'Navê', 'min', 'Hamo', 'ye', 'Sêv', 'û', 'ji', 'kerema', 'xwe']).toContain(word);

    const text = tileAnswer(tr.bank!, rightTiles(tr.bank!, 'Ez baş im, spas.'));
    expect(text).toBe('Ez baş im spas');
    const graded = await authed('POST', `/sessions/${view.sessionId}/answers`, { exerciseId: ex.tr, answer: { text } });
    expect(graded.json()).toMatchObject({ verdict: 'correct', accepted: true });
  });

  it('builds the bank of a listening item from what the clip says, and the same bank on resume', async () => {
    const view = await session('kurmanci');
    const ls = find(view, ex.ls!);
    const resumed = (await authed('GET', `/sessions/${view.sessionId}`)).json() as { exercises: DeliveredExercise[] };
    expect(find(resumed, ex.ls!).bank).toEqual(ls.bank);
    const text = tileAnswer(ls.bank!, rightTiles(ls.bank!, 'Navê min Hamo ye.'));
    const graded = await authed('POST', `/sessions/${view.sessionId}/answers`, { exerciseId: ex.ls, answer: { text } });
    expect(graded.json()).toMatchObject({ verdict: 'correct', accepted: true });
  });

  it('builds a Soranî bank in Arabic script, and its right tiles are accepted', async () => {
    const view = await session('sorani');
    for (const id of [ex.str!, ex.sls!]) {
      const bank = find(view, id).bank!;
      expect(bank.length).toBeGreaterThanOrEqual(4);
      for (const tile of bank) expect(isArabicScript(tile) && !/[A-Za-z]/.test(tile)).toBe(true);
    }
    const tr = find(view, ex.str!);
    const text = tileAnswer(tr.bank!, rightTiles(tr.bank!, 'باشم، سوپاس.'));
    expect(text).toBe('باشم سوپاس');
    const graded = await authed('POST', `/sessions/${view.sessionId}/answers`, { exerciseId: ex.str, answer: { text } });
    expect(graded.json()).toMatchObject({ verdict: 'correct', accepted: true });
    const heard = find(view, ex.sls!);
    const said = tileAnswer(heard.bank!, rightTiles(heard.bank!, 'ناوم هامۆیە.'));
    expect((await authed('POST', `/sessions/${view.sessionId}/answers`, { exerciseId: ex.sls, answer: { text: said } })).json()).toMatchObject({ accepted: true });
  });

  it('cuts prompts into words that join back to them, with meanings from the pairs and from the dictionary', async () => {
    const view = await session('kurmanci');
    for (const e of view.exercises.filter((e) => e.promptTokens)) expect(e.promptTokens!.map((t) => t.text).join('')).toBe(e.prompt);
    expect(meaningsOf(find(view, ex.tr2!))).toEqual({ Bread: ['nan'], milk: ['şîr'] });
    expect(meaningsOf(find(view, ex.mc!))).toEqual({ tê: ['comes'], çi: ['what'] });
  });

  it('gives no meaning that hands over a multiple-choice answer', async () => {
    const mc = find(await session('kurmanci'), ex.mc!);
    // "Sêv" pairs with apple in the session, and apple is an option
    expect(mc.promptTokens!.find((t) => t.text === 'Sêv')).toEqual({ text: 'Sêv' });
  });

  it('delivers items with nothing to build tiles or meanings from as before', async () => {
    const view = await session('bare');
    for (const e of view.exercises) {
      expect(e.bank).toBeUndefined();
      expect(e.promptTokens).toBeUndefined();
      expect(e.pairOf).toBeUndefined();
    }
    const graded = await authed('POST', `/sessions/${view.sessionId}/answers`, { exerciseId: ex.btr, answer: { text: 'sêv' } });
    expect(graded.json()).toMatchObject({ verdict: 'correct', accepted: true });
  });

  it('gives each item of a practice session that mixes courses tiles of its own variety, the same on resume', async () => {
    const practice = new PracticeService(pool);
    const started = (await practice.begin(userId, [ex.tr!, ex.str!, ex.smp!, ex.mp!, ex.ls!]))!;
    const ku = started.exercises.find((e) => e.id === ex.tr)!;
    const ckb = started.exercises.find((e) => e.id === ex.str)!;
    for (const tile of ku.bank!) expect(isArabicScript(tile)).toBe(false);
    for (const tile of ckb.bank!) expect(isArabicScript(tile)).toBe(true);
    expect(started.exercises.find((e) => e.id === ex.smp)!.pairOf).toHaveLength(3);

    const resumed = (await authed('GET', `/practice/sessions/${started.sessionId}`)).json() as { exercises: DeliveredExercise[] };
    expect(resumed.exercises.map((e) => e.bank)).toEqual(started.exercises.map((e) => e.bank));
    for (const [id, bank, answer] of [
      [ex.tr!, ku.bank!, 'Ez baş im, spas.'],
      [ex.str!, ckb.bank!, 'باشم، سوپاس.'],
    ] as const) {
      const text = tileAnswer(bank, rightTiles(bank, answer));
      const graded = await authed('POST', `/practice/sessions/${started.sessionId}/answers`, { exerciseId: id, answer: { text } });
      expect(graded.json()).toMatchObject({ verdict: 'correct', accepted: true });
    }
  });
});
