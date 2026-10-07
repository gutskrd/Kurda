/**
 * The audio studio's lesson recordings, against real Postgres: what the admin
 * list says the lessons need, recording and removing, and the recordings
 * arriving with the exercises a learner is given.
 *
 * Runs on DATABASE_URL alone. With S3_ENDPOINT set it stores into that bucket;
 * without it the storage PUT is stubbed, since what is under test is the
 * route and the delivery, not the bucket.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { lessonAudioKey } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;
const realS3 = Boolean(process.env.S3_ENDPOINT);

/** A PCM WAV: `seconds` of a quiet tone, varied by `seed` so each is a new file. */
function wav(seconds: number, seed = 1, channels = 1): Buffer {
  const rate = 22050;
  const frames = Math.round(seconds * rate);
  const bytes = frames * 2 * channels;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + bytes, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2 * channels, 28);
  b.writeUInt16LE(2 * channels, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < frames * channels; i++) b.writeInt16LE(Math.round(Math.sin((i * seed) / 10) * 3000), 44 + i * 2);
  return b;
}

interface Usage {
  lessonId: string;
  lessonTitle: string;
  lessonStatus: string;
  lessonVersion: number;
  live: boolean;
  courseTitle: string;
  unitTitle: string;
  skillTitle: string;
  exerciseTypes: string[];
  listeningNeedsIt: boolean;
}
interface Item {
  key: string;
  text: string;
  recorded: boolean;
  url: string | null;
  durationMs: number | null;
  updatedAt: string | null;
  usedIn: Usage[];
  unused: boolean;
}

describe.skipIf(!DATABASE_URL)('lesson audio (integration)', () => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    ...(realS3
      ? {}
      : { S3_ENDPOINT: 'http://127.0.0.1:9', S3_BUCKET: 'lesson-audio-test', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test' }),
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  const s = Date.now().toString(36);
  const userIds: string[] = [];
  let editor = '';
  let reader = '';
  let learner = '';
  let courseId = '';
  let unitId = '';
  let skillId = '';
  let live = '';
  let draft = '';
  let nextVersion = '';
  const ex = { mc: '', tr: '', li: '', mp: '', un: '', sp: '', mcq: '' };

  /** the texts this run's lessons use, each unique to the run */
  const T = {
    mcSay: `Silav ${s}`,
    translate: `Spas dikim ${s}`,
    listening: `Ez baş im ${s}`,
    left1: `Av ${s}`,
    left2: `Nan ${s}`,
    unrecorded: `Nayê tomarkirin ${s}`,
    speaking: `Roj baş ${s}`,
    draftOnly: `Pirtûk ${s}`,
    newInV2: `Nû ${s}`,
    custom: `Newroz pîroz be ${s}`,
    sorani: `سوپاس ${s}`,
    ownClip: `Sêv ${s}`,
    quoted: `Çay ${s}`,
    silent: `Ez li malê me ${s}`,
  };
  const ourKeys = (): string[] => Object.values(T).map(lessonAudioKey);

  async function register(name: string, ip: string, roles: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `${name}_${s}@it.kurda.app`,
        username: `${name}_${s}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    userIds.push(id);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [id, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token);
    return token;
  }

  const put = (text: string, body: Buffer, token = editor, type = 'audio/wav') =>
    app.inject({
      method: 'PUT',
      url: `/admin/lesson-audio?text=${encodeURIComponent(text)}`,
      headers: { authorization: `Bearer ${token}`, 'content-type': type },
      payload: body,
      remoteAddress: '10.97.0.9',
    });
  const del = (key: string, token = editor, query = '') =>
    app.inject({
      method: 'DELETE',
      url: `/admin/lesson-audio?key=${encodeURIComponent(key)}${query}`,
      headers: { authorization: `Bearer ${token}` },
    });
  const list = async (token = editor): Promise<{ items: Item[]; summary: { needed: number; recorded: number; missing: number; unused: number } }> => {
    const res = await app.inject({ method: 'GET', url: '/admin/lesson-audio', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode, res.body).toBe(200);
    return res.json();
  };
  const item = (items: Item[], text: string): Item | undefined => items.find((i) => i.key === lessonAudioKey(text));

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);
    if (realS3) {
      const s3 = new S3Client({
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT,
        forcePathStyle: true,
        credentials: { accessKeyId: config.S3_ACCESS_KEY_ID!, secretAccessKey: config.S3_SECRET_ACCESS_KEY! },
      });
      await s3.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET })).catch(() => undefined);
    } else {
      app.storage!.put = async () => undefined;
    }

    courseId = await repo.createCourse({ slug: `la-${s}`, titleKu: 'Deng', titleEn: `Audio course ${s}` });
    unitId = await repo.createUnit(courseId, 1, 'Yek', 'Unit one');
    skillId = await repo.createSkill(unitId, 1, 'Silav', 'Greetings');

    // a published lesson with one exercise of each type
    live = await repo.createLesson(skillId, 1, 'Silav 1', 'Greetings 1');
    ex.mc = await repo.addExercise(live, 1, 'multiple_choice', {
      prompt: '"Hello" bi kurdî?',
      options: [T.mcSay, 'Spas', 'Na'],
      correctIndex: 0,
      say: T.mcSay,
    });
    ex.tr = await repo.addExercise(live, 2, 'translate', { prompt: 'Thank you', accepted: [T.translate, 'Spas'] });
    ex.li = await repo.addExercise(live, 3, 'listening', { prompt: 'Type what you hear', accepted: [T.listening] });
    ex.mp = await repo.addExercise(live, 4, 'match_pairs', {
      pairs: [
        { left: T.left1, right: 'water' },
        { left: T.left2, right: 'bread' },
      ],
    });
    ex.un = await repo.addExercise(live, 5, 'translate', { prompt: 'Not recorded', accepted: [T.unrecorded] });
    ex.sp = await repo.addExercise(live, 6, 'speaking', { prompt: 'Say: good day', reference: T.speaking });
    // its Kurdish is the question, not an option: hearing it first gives nothing away
    ex.mcq = await repo.addExercise(live, 8, 'multiple_choice', {
      prompt: `"${T.quoted}" tê çi wateyê?`,
      options: ['tea', 'milk'],
      correctIndex: 0,
      say: T.quoted,
    });
    await repo.publishLesson(live);

    // its next version, in draft: one item dropped, one added
    nextVersion = await repo.newLessonVersion(live);
    await pool.query(`DELETE FROM exercises WHERE lesson_id = $1 AND position = 5`, [nextVersion]);
    await repo.addExercise(nextVersion, 7, 'writing', { prompt: 'Write: new', accepted: [T.newInV2] });

    // a lesson nobody can play yet
    draft = await repo.createLesson(skillId, 2, 'Silav 2', 'Greetings 2');
    await repo.addExercise(draft, 1, 'translate', { prompt: 'book', accepted: [T.draftOnly] });
    await repo.addExercise(draft, 2, 'listening', { audioUrl: 'https://cdn.test/own.mp3', accepted: [T.ownClip] });

    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [ourKeys()]);
    editor = await register('laEditor', '10.97.0.1', '{content_editor}');
    reader = await register('laReader', '10.97.0.2', '{}');
    learner = reader;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [ourKeys()]);
    const client = await pool.connect();
    try {
      // the learner's lesson answers may have reached the append-only ledger
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      if (userIds.length) await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE status = 'published' AND skill_id IN (
         SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
      [courseId],
    );
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    await pool.end();
    await app.close();
  });

  it('is only for content editors', async () => {
    expect((await app.inject({ method: 'GET', url: '/admin/lesson-audio' })).statusCode).toBe(401);
    const asReader = await app.inject({ method: 'GET', url: '/admin/lesson-audio', headers: { authorization: `Bearer ${reader}` } });
    expect(asReader.statusCode).toBe(403);
    expect((await put(T.translate, wav(1), reader)).statusCode).toBe(403);
    expect((await del(lessonAudioKey(T.translate), reader)).statusCode).toBe(403);
    const anonPut = await app.inject({
      method: 'PUT',
      url: `/admin/lesson-audio?text=${encodeURIComponent(T.translate)}`,
      headers: { 'content-type': 'audio/wav' },
      payload: wav(1),
    });
    expect(anonPut.statusCode).toBe(401);
  });

  it('lists every text the lessons need, with where each is used', async () => {
    const { items, summary } = await list();

    const mc = item(items, T.mcSay)!;
    expect(mc).toMatchObject({ text: T.mcSay, recorded: false, url: null, unused: false });
    // the draft v2 and the live v1 are one lesson slot: one usage, live, named by the newest version
    expect(mc.usedIn).toHaveLength(1);
    expect(mc.usedIn[0]).toMatchObject({
      lessonId: nextVersion,
      lessonTitle: 'Greetings 1',
      lessonStatus: 'draft',
      lessonVersion: 2,
      live: true,
      courseId,
      courseTitle: `Audio course ${s}`,
      unitId,
      unitTitle: 'Unit one',
      skillId,
      skillTitle: 'Greetings',
      lessonPosition: 1,
      exerciseTypes: ['multiple_choice'],
    });

    // only the first accepted answer is asked for
    expect(item(items, T.translate)).toBeDefined();
    expect(item(items, 'Spas')?.usedIn.some((u) => u.lessonId === nextVersion)).not.toBe(true);
    // a listening item without a clip of its own cannot be done until its text is recorded
    expect(item(items, T.listening)!.usedIn[0]).toMatchObject({ exerciseTypes: ['listening'], listeningNeedsIt: true });
    expect(item(items, T.ownClip)!.usedIn[0]).toMatchObject({ exerciseTypes: ['listening'], listeningNeedsIt: false });
    expect(item(items, T.translate)!.usedIn[0]!.listeningNeedsIt).toBe(false);
    expect(item(items, T.left1)!.usedIn[0]!.exerciseTypes).toEqual(['match_pairs']);
    expect(item(items, T.left2)).toBeDefined();
    expect(item(items, T.speaking)!.usedIn[0]!.exerciseTypes).toEqual(['speaking']);
    // the right-hand cards and multiple-choice options are not
    expect(items.find((i) => i.key === 'water')?.usedIn.some((u) => u.courseTitle.endsWith(s))).not.toBe(true);

    // dropped from the draft but still played by learners: needed, from the live version
    expect(item(items, T.unrecorded)!.usedIn[0]).toMatchObject({ lessonId: live, lessonStatus: 'published', lessonVersion: 1, live: true });
    // added in the draft only: needed already, not heard by anyone yet
    expect(item(items, T.newInV2)!.usedIn[0]).toMatchObject({ lessonId: nextVersion, lessonStatus: 'draft', live: false });
    // a lesson that was never published
    expect(item(items, T.draftOnly)!.usedIn[0]).toMatchObject({
      lessonId: draft,
      lessonPosition: 2,
      lessonTitle: 'Greetings 2',
      lessonStatus: 'draft',
      live: false,
    });

    // in course order: the first lesson's items before the second's
    const at = (text: string) => items.findIndex((i) => i.key === lessonAudioKey(text));
    expect(at(T.mcSay)).toBeLessThan(at(T.translate));
    expect(at(T.translate)).toBeLessThan(at(T.draftOnly));

    expect(summary.needed).toBe(summary.recorded + summary.missing);
  });

  it('stores a recording and files it under the sentence, however it is punctuated', async () => {
    const first = await put(`${T.translate}.`, wav(1.5));
    expect(first.statusCode, first.body).toBe(201);
    expect(first.json()).toMatchObject({ key: lessonAudioKey(T.translate), text: `${T.translate}.`, durationMs: 1500 });
    expect(first.json().url).toMatch(/lesson-audio\/[0-9a-f]{64}\.wav$/);

    const { items, summary: before } = await list();
    expect(item(items, T.translate)).toMatchObject({ recorded: true, url: first.json().url, durationMs: 1500, unused: false });
    expect(item(items, T.translate)!.updatedAt).toEqual(expect.any(String));

    // the same sentence, typed differently: replaces the recording, not a second one
    const again = await put(`  ${T.translate.toUpperCase()}!`, wav(2, 2));
    expect(again.statusCode).toBe(201);
    expect(again.json().key).toBe(lessonAudioKey(T.translate));
    expect(again.json().url).not.toBe(first.json().url);
    const rows = await pool.query(`SELECT url, duration_ms, recorded_by FROM lesson_audio WHERE key = $1`, [lessonAudioKey(T.translate)]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ url: again.json().url, duration_ms: 2000, recorded_by: userIds[0] });
    expect((await list()).summary.recorded).toBe(before.recorded);

    const audit = await pool.query(`SELECT action, after FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at`, [
      lessonAudioKey(T.translate),
    ]);
    expect(audit.rows.map((r) => r.action)).toEqual(['lesson.audio.set', 'lesson.audio.set']);
    expect(audit.rows[1].after).toMatchObject({ url: again.json().url, durationMs: 2000 });
  });

  it('takes any text, and flags a recording no lesson uses', async () => {
    const custom = await put(T.custom, wav(3, 3));
    expect(custom.statusCode).toBe(201);
    const sorani = await put(`${T.sorani}؟`, wav(1, 4));
    expect(sorani.statusCode).toBe(201);
    expect(sorani.json().key).toBe(lessonAudioKey(T.sorani));

    const { items, summary } = await list();
    expect(item(items, T.custom)).toMatchObject({ text: T.custom, recorded: true, unused: true, usedIn: [] });
    expect(item(items, T.sorani)).toMatchObject({ text: `${T.sorani}؟`, unused: true });
    expect(summary.unused).toBeGreaterThanOrEqual(2);
    // what no lesson uses comes after everything that one does
    const firstUnused = items.findIndex((i) => i.unused);
    expect(items.slice(firstUnused).every((i) => i.unused)).toBe(true);
  });

  it('refuses what is not a short mono WAV of something to say', async () => {
    const code = async (res: Promise<{ statusCode: number; json: () => { code: string } }>) => {
      const r = await res;
      return [r.statusCode, r.json().code];
    };
    expect(await code(put('?!', wav(1)))).toEqual([400, 'EMPTY_TEXT']);
    expect(await code(put('', wav(1)))).toEqual([400, 'EMPTY_TEXT']);
    expect(await code(put('a'.repeat(301), wav(1)))).toEqual([400, 'TEXT_TOO_LONG']);
    expect(await code(put(T.left1, wav(16)))).toEqual([400, 'TOO_LONG']);
    expect(await code(put(T.left1, wav(0.05)))).toEqual([400, 'TOO_SHORT']);
    expect(await code(put(T.left1, wav(1, 1, 2)))).toEqual([400, 'NOT_MONO']);
    const mp3 = Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 0x03, 0, 0, 0, 0]), Buffer.alloc(4096, 0x11)]);
    expect((await put(T.left1, mp3, editor, 'audio/mpeg')).statusCode).toBe(415);
    expect((await put(T.left1, Buffer.from('not a wav at all, just some bytes padded out'.repeat(4)))).statusCode).toBe(415);
    const missingText = await app.inject({
      method: 'PUT',
      url: '/admin/lesson-audio',
      headers: { authorization: `Bearer ${editor}`, 'content-type': 'audio/wav' },
      payload: wav(1),
    });
    expect(missingText.json().code).toBe('EMPTY_TEXT');
    // none of those stored anything
    expect(item((await list()).items, T.left1)!.recorded).toBe(false);
  });

  it('removes a recording, and says so when there is none', async () => {
    const key = lessonAudioKey(T.custom);
    const res = await del(key);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ key, removed: true });
    expect(item((await list()).items, T.custom)).toBeUndefined();
    expect((await del(key)).statusCode).toBe(404);
    expect((await del('')).statusCode).toBe(400);
    const audit = await pool.query(`SELECT action, before FROM admin_audit_log WHERE target_id = $1 ORDER BY created_at`, [key]);
    expect(audit.rows.map((r) => r.action)).toEqual(['lesson.audio.set', 'lesson.audio.remove']);
    expect(audit.rows[1].before).toMatchObject({ text: T.custom });
  });

  describe('delivery', () => {
    const urls: Record<string, string> = {};

    beforeAll(async () => {
      for (const [name, seed] of [
        ['mcSay', 11],
        ['listening', 12],
        ['left1', 13],
        ['speaking', 14],
        ['quoted', 15],
      ] as const) {
        const res = await put(T[name], wav(1, seed));
        expect(res.statusCode, res.body).toBe(201);
        urls[name] = res.json().url;
      }
      urls.translate = (await pool.query(`SELECT url FROM lesson_audio WHERE key = $1`, [lessonAudioKey(T.translate)])).rows[0].url;
    });

    const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
      app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${learner}` }, remoteAddress: '10.97.0.20' });
    const byId = (exercises: Array<Record<string, unknown>>, id: string) => exercises.find((e) => e.id === id)!;

    it('gives a lesson its recordings, and an unrecorded item none', async () => {
      const res = await authed('GET', `/lessons/${live}/session`);
      expect(res.statusCode, res.body).toBe(200);
      const exercises = res.json().exercises as Array<Record<string, unknown>>;

      // the sentence to imitate, and the Kurdish a question already shows
      expect(byId(exercises, ex.sp)).toMatchObject({ modelAudioUrl: urls.speaking });
      expect(byId(exercises, ex.mcq)).toMatchObject({ modelAudioUrl: urls.quoted });
      // a listening item with no clip of its own plays the studio's recording
      expect(byId(exercises, ex.li)).toMatchObject({ audioUrl: urls.listening, modelAudioUrl: urls.listening });
      // match-pairs cards, by the text on the card; the unrecorded card has none
      expect(byId(exercises, ex.mp).audio).toEqual({ [T.left1]: urls.left1 });
      expect(byId(exercises, ex.mp).modelAudioUrl).toBeUndefined();

      // nothing recorded: no audio fields at all
      const unrecorded = byId(exercises, ex.un);
      expect(unrecorded).not.toHaveProperty('modelAudioUrl');
      expect(unrecorded).not.toHaveProperty('audioUrl');
      expect(unrecorded).not.toHaveProperty('audio');
    });

    it('never says the answer before it is given: not in text, not by URL', async () => {
      const res = await authed('GET', `/lessons/${live}/session`);
      const exercises = res.json().exercises as Array<Record<string, unknown>>;
      // recorded, but the translation's model is its answer and the multiple-choice model its right option
      for (const id of [ex.tr, ex.mc]) {
        expect(byId(exercises, id)).not.toHaveProperty('modelAudioUrl');
        expect(byId(exercises, id)).not.toHaveProperty('audio');
        expect(byId(exercises, id)).not.toHaveProperty('say');
      }
      const raw = res.body;
      // the answers of the other items appear nowhere in the response
      for (const answer of [T.translate, T.listening, T.speaking, T.unrecorded]) expect(raw).not.toContain(answer);
      // nor do the recordings of them, which a card could pair with their text
      for (const url of [urls.translate, urls.mcSay]) expect(raw).not.toContain(url);
    });

    it('sends the model with the grading, right or wrong', async () => {
      const lesson = await authed('GET', `/lessons/${live}/session`);
      const sessionId = lesson.json().sessionId as string;
      const answer = (exerciseId: string, given: unknown) =>
        authed('POST', `/sessions/${sessionId}/answers`, { exerciseId, answer: given });

      const mc = await answer(ex.mc, { choice: 1 });
      expect(mc.statusCode, mc.body).toBe(200);
      expect(mc.json()).toMatchObject({ verdict: 'wrong', correction: T.mcSay, modelAudioUrl: urls.mcSay });
      expect((await answer(ex.mcq, { choice: 0 })).json()).toMatchObject({ verdict: 'correct', modelAudioUrl: urls.quoted });
      // a replay says the same
      expect((await answer(ex.mc, { choice: 0 })).json()).toMatchObject({ duplicate: true, modelAudioUrl: urls.mcSay });
      // nothing recorded, or nothing to record: no field
      expect((await answer(ex.un, { text: 'x' })).json()).not.toHaveProperty('modelAudioUrl');
      expect((await answer(ex.mp, { matches: [] })).json()).not.toHaveProperty('modelAudioUrl');
    });

    it('gives a placement question only what it may hear before answering', async () => {
      const res = await authed('POST', `/courses/${courseId}/placement`, {});
      expect(res.statusCode, res.body).toBe(200);
      const q = res.json().question;
      expect(q.exerciseId).toBe(ex.mc);
      expect(q).not.toHaveProperty('modelAudioUrl');
      expect(q).not.toHaveProperty('audio');
    });

    it('gives a practice session its recordings', async () => {
      const lesson = await authed('GET', `/lessons/${live}/session`);
      const sessionId = lesson.json().sessionId as string;
      // answering puts the items into the learner's review queue
      for (const [id, answer] of [
        [ex.tr, { text: T.translate }],
        [ex.un, { text: 'wrong' }],
        [ex.mp, { matches: [] }],
      ] as const) {
        const r = await authed('POST', `/sessions/${sessionId}/answers`, { exerciseId: id, answer });
        expect(r.statusCode, r.body).toBe(200);
      }
      const res = await authed('POST', '/practice/session');
      expect(res.statusCode, res.body).toBe(200);
      const exercises = res.json().exercises as Array<Record<string, unknown>>;
      expect(byId(exercises, ex.mp).audio).toEqual({ [T.left1]: urls.left1 });
      expect(byId(exercises, ex.tr)).not.toHaveProperty('modelAudioUrl');
      expect(byId(exercises, ex.un)).not.toHaveProperty('modelAudioUrl');
      // the translation's model comes with its grading
      const graded = await authed('POST', `/practice/sessions/${res.json().sessionId}/answers`, {
        exerciseId: ex.tr,
        answer: { text: T.translate },
      });
      expect(graded.statusCode, graded.body).toBe(200);
      expect(graded.json()).toMatchObject({ verdict: 'correct', modelAudioUrl: urls.translate });
    });
  });

  /**
   * A listening item's own clip is optional: without one it plays the
   * studio's recording of its transcription, so publishing waits for that
   * recording and removing it needs saying so.
   */
  describe('a listening item with no clip of its own', () => {
    let lessonId = '';
    const lessonRoute = (verb: string) =>
      app.inject({ method: 'POST', url: `/admin/content/lessons/${lessonId}/${verb}`, headers: { authorization: `Bearer ${editor}` } });

    beforeAll(async () => {
      lessonId = await repo.createLesson(skillId, 3, 'Silav 3', 'Greetings 3');
      await repo.addExercise(lessonId, 1, 'listening', { prompt: 'Type what you hear', accepted: [`${T.silent}.`] });
      const submitted = await lessonRoute('submit');
      expect(submitted.statusCode, submitted.body).toBe(200);
    });

    it('is not published until its transcription is recorded', async () => {
      const refused = await lessonRoute('approve');
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ code: 'LISTENING_AUDIO_MISSING', missing: [`${T.silent}.`] });
      expect(refused.json().message).toContain(`“${T.silent}.”`);
      // and the studio shows it as what that listening item waits for
      expect(item((await list()).items, T.silent)!.usedIn[0]).toMatchObject({ lessonId, listeningNeedsIt: true, live: false });

      expect((await put(T.silent, wav(1, 21))).statusCode).toBe(201);
      const approved = await lessonRoute('approve');
      expect(approved.statusCode, approved.body).toBe(200);
      expect((await pool.query(`SELECT status FROM lessons WHERE id = $1`, [lessonId])).rows[0].status).toBe('published');
    });

    it('keeps the recording it plays from being removed unless the editor insists', async () => {
      const key = lessonAudioKey(T.silent);
      const refused = await del(key);
      expect(refused.statusCode).toBe(409);
      expect(refused.json()).toMatchObject({ code: 'LISTENING_AUDIO_IN_USE', details: { lessons: [{ lessonId, title: 'Greetings 3' }] } });
      expect(refused.json().message).toContain('“Greetings 3”');
      expect(item((await list()).items, T.silent)!.recorded).toBe(true);

      const forced = await del(key, editor, '&force=1');
      expect(forced.statusCode, forced.body).toBe(200);
      expect(item((await list()).items, T.silent)!.recorded).toBe(false);
      const audit = await pool.query(
        `SELECT reason FROM admin_audit_log WHERE target_id = $1 AND action = 'lesson.audio.remove'`,
        [key],
      );
      expect(audit.rows).toHaveLength(1);
      expect(audit.rows[0].reason).toContain('1 published lesson');
    });
  });
});
