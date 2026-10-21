/**
 * Speaking characters, against real Postgres: saving a recording with who
 * says it and its mouth's timeline, changing either later, and every payload
 * that sends a recording to the apps carrying them — only for recordings with
 * a speaker.
 *
 * Runs on DATABASE_URL alone. With S3_ENDPOINT set it stores into that bucket;
 * without it the storage PUT is stubbed, since what is under test is the
 * routes and the payloads, not the bucket.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import {
  ALPHABET_CLIPS,
  decodeLipsync,
  encodeLipsync,
  lessonAudioKey,
  lipsyncFromAudio,
  lipsyncFromText,
  storyAudioSentences,
  type LipsyncData,
} from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { DictionaryRepository } from '../dictionary/repository.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { insertStory } from '../test/story-fixtures.js';
import { LIPSYNC_TOLERANCE_MS } from './voice.js';

const DATABASE_URL = process.env.DATABASE_URL;
const realS3 = Boolean(process.env.S3_ENDPOINT);
const RATE = 22050;

/** Syllables of a buzz (each number a syllable that long, in ms), after 80 ms of silence and before 150. */
function speech(syllables: number[], loudness = 0.3): Float32Array {
  const total = 80 + 150 + syllables.reduce((a, b) => a + b, 0);
  const pcm = new Float32Array(Math.round((total / 1000) * RATE));
  let at = 80;
  for (const ms of syllables) {
    const a = Math.round((at / 1000) * RATE);
    const n = Math.round((ms / 1000) * RATE);
    for (let i = 0; i < n; i++) {
      const level = 0.15 + 0.85 * Math.sin((Math.PI * i) / n) ** 2;
      pcm[a + i] = loudness * level * Math.sin((2 * Math.PI * 140 * (a + i)) / RATE);
    }
    at += ms;
  }
  return pcm;
}

/** The samples as a 16-bit mono PCM WAV, as the admin panel sends it. */
function wav(pcm: Float32Array): Buffer {
  const b = Buffer.alloc(44 + pcm.length * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + pcm.length * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24);
  b.writeUInt32LE(RATE * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i]!)) * 32767), 44 + i * 2);
  return b;
}

const durationOf = (pcm: Float32Array): number => Math.round((pcm.length / RATE) * 1000);

describe.skipIf(!DATABASE_URL)('speaking characters (integration)', () => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    ...(realS3
      ? {}
      : { S3_ENDPOINT: 'http://127.0.0.1:9', S3_BUCKET: 'speakers-test', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test' }),
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  const s = Date.now().toString(36);
  const userIds: string[] = [];
  let editor = '';
  let learner = '';
  let courseId = '';
  let live = '';
  const ex = { li: '', sp: '', mp: '', tr: '' };
  let storyId = '';
  let entryId = '';
  const dictAudio = { voiced: '', plain: '' };

  /** the texts this run records, each unique to the run */
  const T = {
    listening: `Ez baş im ${s}`,
    speaking: `Roj baş ${s}`,
    left1: `Av ${s}`,
    left2: `Nan ${s}`,
    translate: `Spas dikim ${s}`,
    other: `Pirtûk ${s}`,
    story1: `Bavê min li malê ye ${s}.`,
    story2: `Diya min li bajêr e ${s}.`,
  };
  const ourKeys = (): string[] => Object.values(T).map(lessonAudioKey);
  /** sounds on the alphabet page this run records, put back as they were afterwards */
  const LETTERS = ['kmr:sound:b', 'kmr:word:m'];

  /** Each recording's sound and the timeline the admin panel would make for it. */
  const takes = new Map<string, { pcm: Float32Array; lipsync: LipsyncData }>();
  const take = (text: string, syllables: number[], loudness = 0.3) => {
    const pcm = speech(syllables, loudness);
    const made = { pcm, lipsync: encodeLipsync(lipsyncFromAudio(text, pcm, RATE)) };
    takes.set(text, made);
    return made;
  };

  async function register(name: string, ip: string, roles: string): Promise<string> {
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

  /** PUT a lesson recording, with `extra` query parameters (speaker, lipsync) */
  const putLesson = (text: string, body: Buffer, extra: Record<string, string> = {}, token = editor) =>
    app.inject({
      method: 'PUT',
      url: `/admin/lesson-audio?${new URLSearchParams({ text, ...extra })}`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/wav' },
      payload: body,
      remoteAddress: '10.96.0.9',
    });
  const putLetter = (key: string, body: Buffer, extra: Record<string, string> = {}) =>
    app.inject({
      method: 'PUT',
      url: `/admin/alphabet/audio?${new URLSearchParams({ key, ...extra })}`,
      headers: { authorization: `Bearer ${editor}`, 'content-type': 'audio/wav' },
      payload: body,
      remoteAddress: '10.96.0.9',
    });
  const patch = (kind: string, key: string, payload: unknown, token: string | null = editor) =>
    app.inject({
      method: 'PATCH',
      url: `/admin/audio/${kind}?${new URLSearchParams({ key })}`,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: payload as object,
      remoteAddress: '10.96.0.9',
    });
  const row = async (key: string) =>
    (await pool.query(`SELECT speaker, lipsync, duration_ms FROM lesson_audio WHERE key = $1`, [key])).rows[0];
  const authed = (method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${learner}` }, remoteAddress: '10.96.0.20' });

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

    courseId = await repo.createCourse({ slug: `sp-${s}`, titleKu: 'Deng', titleEn: `Speakers ${s}` });
    const unitId = await repo.createUnit(courseId, 1, 'Yek', 'Unit one');
    const skillId = await repo.createSkill(unitId, 1, 'Silav', 'Greetings');
    live = await repo.createLesson(skillId, 1, 'Silav 1', 'Greetings 1');
    ex.li = await repo.addExercise(live, 1, 'listening', { prompt: 'Type what you hear', accepted: [T.listening] });
    ex.sp = await repo.addExercise(live, 2, 'speaking', { prompt: 'Say: good day', reference: T.speaking });
    ex.mp = await repo.addExercise(live, 3, 'match_pairs', {
      pairs: [
        { left: T.left1, right: 'water' },
        { left: T.left2, right: 'bread' },
      ],
    });
    ex.tr = await repo.addExercise(live, 4, 'translate', { prompt: 'Thank you', accepted: [T.translate] });
    await repo.publishLesson(live);

    const story = await insertStory(pool, { slug: `sp-${s}` });
    storyId = story.id;
    await pool.query(`UPDATE stories SET body = $2 WHERE id = $1`, [storyId, `${T.story1} ${T.story2}`]);

    const dictionary = new DictionaryRepository(pool);
    entryId = await dictionary.createEntry(`dengbêj${s}`);
    await dictionary.addAudio(entryId, `https://cdn.test/dict/${s}-1.mp3`);
    await dictionary.addAudio(entryId, `https://cdn.test/dict/${s}-2.mp3`);
    const audio = await pool.query<{ id: string; audio_url: string }>(
      `SELECT id, audio_url FROM dict_audio WHERE entry_id = $1 ORDER BY audio_url`,
      [entryId],
    );
    dictAudio.voiced = audio.rows[0]!.id;
    dictAudio.plain = audio.rows[1]!.id;

    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [ourKeys()]);
    await pool.query(`DELETE FROM alphabet_audio WHERE key = ANY($1)`, [LETTERS]);
    editor = await register('spEditor', '10.96.0.1', '{content_editor}');
    learner = await register('spLearner', '10.96.0.2', '{}');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [ourKeys()]);
    await pool.query(`DELETE FROM alphabet_audio WHERE key = ANY($1)`, [LETTERS]);
    if (entryId) await pool.query(`DELETE FROM dict_entries WHERE id = $1`, [entryId]);
    if (storyId) {
      await pool.query(`DELETE FROM story_questions WHERE story_id = $1`, [storyId]);
      await pool.query(`DELETE FROM stories WHERE id = $1`, [storyId]);
    }
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

  describe('saving a recording', () => {
    it('stores who says it and its timeline with the recording', async () => {
      const { pcm, lipsync } = take(T.listening, [150, 200, 180]);
      const res = await putLesson(T.listening, wav(pcm), { speaker: 'xezo', lipsync: JSON.stringify(lipsync) });
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json()).toMatchObject({ key: lessonAudioKey(T.listening), durationMs: durationOf(pcm), speaker: 'xezo', lipsync });
      expect(await row(lessonAudioKey(T.listening))).toMatchObject({ speaker: 'xezo', lipsync });
      // a stored timeline is one the apps can decode
      expect(decodeLipsync(res.json().lipsync).durationMs).toBe(durationOf(pcm));

      // the studio's list says so, without the timeline itself
      const list = await app.inject({ method: 'GET', url: '/admin/lesson-audio', headers: { authorization: `Bearer ${editor}` } });
      const item = (list.json().items as Array<Record<string, unknown>>).find((i) => i.key === lessonAudioKey(T.listening));
      expect(item).toMatchObject({ recorded: true, speaker: 'xezo', hasLipsync: true });
      expect(item).not.toHaveProperty('lipsync');
      const unrecorded = (list.json().items as Array<Record<string, unknown>>).find((i) => i.key === lessonAudioKey(T.translate));
      expect(unrecorded).toMatchObject({ recorded: false, speaker: null, hasLipsync: false });
    });

    it('keeps the speaker for a new take that does not name one, but not the old take’s timeline', async () => {
      const key = lessonAudioKey(T.other);
      const first = take(T.other, [200, 200]);
      expect((await putLesson(T.other, wav(first.pcm), { speaker: 'hamo', lipsync: JSON.stringify(first.lipsync) })).statusCode).toBe(201);
      const again = await putLesson(T.other, wav(speech([220, 260], 0.25)));
      expect(again.statusCode, again.body).toBe(201);
      expect(again.json()).toMatchObject({ speaker: 'hamo', lipsync: null });
      expect(await row(key)).toMatchObject({ speaker: 'hamo', lipsync: null });
      // "none" takes the character away
      const none = await putLesson(T.other, wav(speech([210, 260], 0.22)), { speaker: 'none' });
      expect(none.json()).toMatchObject({ speaker: null, lipsync: null });
    });

    it('refuses an unknown speaker or a timeline that is not this recording’s, and stores nothing', async () => {
      const key = lessonAudioKey(T.translate);
      const pcm = speech([200, 240]);
      const lipsync = encodeLipsync(lipsyncFromAudio(T.translate, pcm, RATE));

      const unknown = await putLesson(T.translate, wav(pcm), { speaker: 'dragon' });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json().code).toBe('UNKNOWN_SPEAKER');

      const garbled = await putLesson(T.translate, wav(pcm), { speaker: 'hamo', lipsync: '{"v":1,' });
      expect(garbled.statusCode).toBe(400);
      expect(garbled.json().code).toBe('INVALID_LIPSYNC');

      const backwards = { ...lipsync, k: [...lipsync.k].reverse() };
      const bad = await putLesson(T.translate, wav(pcm), { lipsync: JSON.stringify(backwards) });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().code).toBe('INVALID_LIPSYNC');

      // a timeline made from a longer take
      const longer = { ...lipsync, d: durationOf(pcm) + LIPSYNC_TOLERANCE_MS + 1 };
      const tooLong = await putLesson(T.translate, wav(pcm), { lipsync: JSON.stringify(longer) });
      expect(tooLong.statusCode).toBe(400);
      expect(tooLong.json().code).toBe('LIPSYNC_TOO_LONG');

      expect(await row(key)).toBeUndefined();
      // a decoder's few milliseconds of padding are allowed for
      const padded = { ...lipsync, d: durationOf(pcm) + LIPSYNC_TOLERANCE_MS };
      expect((await putLesson(T.translate, wav(pcm), { lipsync: JSON.stringify(padded) })).statusCode).toBe(201);
    });

    it('stores an alphabet sound’s speaker and timeline, and lists them for the studio', async () => {
      const pcm = speech([260]);
      const lipsync = encodeLipsync(lipsyncFromAudio('ba', pcm, RATE));
      const res = await putLetter(LETTERS[0]!, wav(pcm), { speaker: 'hevalo', lipsync: JSON.stringify(lipsync) });
      expect(res.statusCode, res.body).toBe(201);
      expect(res.json()).toMatchObject({ key: LETTERS[0], speaker: 'hevalo', lipsync });
      // a second sound, recorded with no character
      expect((await putLetter(LETTERS[1]!, wav(speech([300], 0.2)))).json()).toMatchObject({ speaker: null, lipsync: null });

      const list = await app.inject({ method: 'GET', url: '/admin/alphabet/audio', headers: { authorization: `Bearer ${editor}` } });
      const recordings = list.json().recordings as Array<Record<string, unknown>>;
      expect(recordings.find((r) => r.key === LETTERS[0])).toMatchObject({ speaker: 'hevalo', hasLipsync: true });
      expect(recordings.find((r) => r.key === LETTERS[1])).toMatchObject({ speaker: null, hasLipsync: false });

      expect((await putLetter(LETTERS[1]!, wav(speech([300], 0.2)), { speaker: 'nobody' })).json().code).toBe('UNKNOWN_SPEAKER');
    });
  });

  describe('PATCH /admin/audio/:kind', () => {
    beforeAll(async () => {
      // recordings made before the characters: no speaker, no timeline
      for (const [text, syllables] of [
        [T.speaking, [180, 220]],
        [T.left1, [250]],
        [T.left2, [260]],
        [T.story1, [150, 150, 150, 200, 200]],
        [T.story2, [150, 150, 150, 200, 200]],
      ] as const) {
        const res = await putLesson(text, wav(take(text, [...syllables]).pcm));
        expect(res.statusCode, res.body).toBe(201);
      }
    });

    it('chooses a speaker for a recording made before the characters, then adds its timeline', async () => {
      const key = lessonAudioKey(T.speaking);
      const chosen = await patch('lesson', key, { speaker: 'hamo' });
      expect(chosen.statusCode, chosen.body).toBe(200);
      expect(chosen.json()).toEqual({ kind: 'lesson', key, speaker: 'hamo', lipsync: null });

      const { lipsync } = takes.get(T.speaking)!;
      const timed = await patch('lesson', key, { lipsync });
      expect(timed.statusCode, timed.body).toBe(200);
      expect(timed.json()).toEqual({ kind: 'lesson', key, speaker: 'hamo', lipsync });
      expect(await row(key)).toMatchObject({ speaker: 'hamo', lipsync });

      // and it is in the audit trail, by its size
      const audit = await pool.query(
        `SELECT action, target_type, target_id, before, after FROM admin_audit_log
          WHERE action = 'audio.voice.set' AND target_id = $1 ORDER BY created_at`,
        [key],
      );
      expect(audit.rows).toHaveLength(2);
      expect(audit.rows[1]).toMatchObject({
        target_type: 'lesson_audio',
        before: { speaker: 'hamo', lipsync: null },
        after: { speaker: 'hamo', lipsync: { durationMs: lipsync.d, cues: lipsync.k.length } },
      });
    });

    it('voices the cards and the story sentences too', async () => {
      expect((await patch('lesson', lessonAudioKey(T.left1), { speaker: 'hevalo', lipsync: takes.get(T.left1)!.lipsync })).statusCode).toBe(
        200,
      );
      expect((await patch('lesson', lessonAudioKey(T.story1), { speaker: 'xezo', lipsync: takes.get(T.story1)!.lipsync })).statusCode).toBe(
        200,
      );
    });

    it('takes a speaker or a timeline away with null, leaving the other', async () => {
      const key = lessonAudioKey(T.other);
      // the take recorded last, with its timeline made now
      const current = speech([210, 260], 0.22);
      const lipsync = encodeLipsync(lipsyncFromAudio(T.other, current, RATE));
      expect((await patch('lesson', key, { speaker: 'xezo', lipsync })).json()).toMatchObject({ speaker: 'xezo', lipsync });
      expect((await patch('lesson', key, { lipsync: null })).json()).toMatchObject({ speaker: 'xezo', lipsync: null });
      expect((await patch('lesson', key, { speaker: null })).json()).toMatchObject({ speaker: null, lipsync: null });
    });

    it('works for the alphabet and the dictionary', async () => {
      const letter = await patch('alphabet', LETTERS[1]!, { speaker: 'xezo' });
      expect(letter.statusCode, letter.body).toBe(200);
      expect(letter.json()).toMatchObject({ kind: 'alphabet', key: LETTERS[1], speaker: 'xezo' });

      // a dictionary pronunciation has no stored length: held to a word's
      const lipsync = encodeLipsync(lipsyncFromAudio('dengbêj', speech([200, 260]), RATE));
      const word = await patch('dictionary', dictAudio.voiced, { speaker: 'hamo', lipsync });
      expect(word.statusCode, word.body).toBe(200);
      expect(word.json()).toEqual({ kind: 'dictionary', key: dictAudio.voiced, speaker: 'hamo', lipsync });
      const stored = await pool.query(`SELECT speaker, lipsync FROM dict_audio WHERE id = $1`, [dictAudio.voiced]);
      expect(stored.rows[0]).toEqual({ speaker: 'hamo', lipsync });
      const endless = { v: 1, d: 31_000, k: [[0, 0], [100, 5]] };
      expect((await patch('dictionary', dictAudio.plain, { lipsync: endless })).json().code).toBe('LIPSYNC_TOO_LONG');
    });

    it('refuses a timeline that is not one', async () => {
      const key = lessonAudioKey(T.speaking);
      const before = await row(key);
      const { lipsync } = takes.get(T.speaking)!;
      const invalid: unknown[] = [
        { ...lipsync, v: 2 },
        { ...lipsync, extra: true },
        { ...lipsync, k: [[0, 0], [0, 5]] },
        { ...lipsync, k: [[0, 10]] },
        { ...lipsync, k: [[lipsync.d, 1]] },
        { ...lipsync, k: [[0, 1], [50, 1]] },
        [[0, 0]],
        'v1',
        // more cues than any timeline may have
        { v: 1, d: 10_000, k: Array.from({ length: 2001 }, (_, i) => [i * 2, i % 2]) },
      ];
      for (const bad of invalid) {
        const res = await patch('lesson', key, { lipsync: bad });
        expect(res.statusCode, JSON.stringify(bad).slice(0, 80)).toBe(400);
        expect(res.json().code).toBe('VALIDATION_ERROR');
      }
      // a timeline for a longer recording than this one
      const tooLong = await patch('lesson', key, { lipsync: { ...lipsync, d: before.duration_ms + LIPSYNC_TOLERANCE_MS + 1 } });
      expect(tooLong.statusCode).toBe(400);
      expect(tooLong.json().code).toBe('LIPSYNC_TOO_LONG');
      expect(await row(key)).toEqual(before);
    });

    it('refuses an unknown speaker, and a change that changes nothing', async () => {
      const key = lessonAudioKey(T.speaking);
      for (const speaker of ['dragon', 'Hamo', '', 5]) {
        const res = await patch('lesson', key, { speaker });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe('VALIDATION_ERROR');
      }
      expect((await patch('lesson', key, {})).statusCode).toBe(400);
      expect((await patch('voicemail', key, { speaker: 'hamo' })).statusCode).toBe(400);
    });

    it('says when there is no such recording', async () => {
      const cases: Array<[string, string]> = [
        ['lesson', lessonAudioKey(`Nayê tomarkirin ${s}`)],
        ['alphabet', 'kmr:sound:nope'],
        // a real sound, with no recording
        ['alphabet', 'kmr:sound:z'],
        ['dictionary', 'not-a-uuid'],
        ['dictionary', '00000000-0000-4000-8000-000000000000'],
      ];
      await pool.query(`DELETE FROM alphabet_audio WHERE key = 'kmr:sound:z'`);
      for (const [kind, key] of cases) {
        const res = await patch(kind, key, { speaker: 'hamo' });
        expect(res.statusCode, `${kind} ${key}`).toBe(404);
        expect(res.json().code).toBe('NOT_FOUND');
      }
    });

    it('is only for those who record', async () => {
      const key = lessonAudioKey(T.speaking);
      expect((await patch('lesson', key, { speaker: 'xezo' }, learner)).statusCode).toBe(403);
      expect((await patch('lesson', key, { speaker: 'xezo' }, null)).statusCode).toBe(401);
      expect((await row(key)).speaker).toBe('hamo');
    });
  });

  describe('what the apps are sent', () => {
    it('a lesson: the listening clip, the model and the cards, each with who says it', async () => {
      const res = await authed('GET', `/lessons/${live}/session`);
      expect(res.statusCode, res.body).toBe(200);
      const exercises = res.json().exercises as Array<Record<string, unknown>>;
      const byId = (id: string) => exercises.find((e) => e.id === id)!;

      const listening = { speaker: 'xezo', lipsync: takes.get(T.listening)!.lipsync };
      expect(byId(ex.li)).toMatchObject({ audioVoice: listening, modelAudioVoice: listening });
      expect(byId(ex.sp)).toMatchObject({
        modelAudioVoice: { speaker: 'hamo', lipsync: takes.get(T.speaking)!.lipsync },
      });
      // the Nan card has a recording and no character: its URL and nothing more
      expect(byId(ex.mp).audioVoices).toEqual({ [T.left1]: { speaker: 'hevalo', lipsync: takes.get(T.left1)!.lipsync } });
      expect(Object.keys(byId(ex.mp).audio as object)).toEqual(expect.arrayContaining([T.left1, T.left2]));
      // the translation's model is its answer: held back, voice and all
      expect(byId(ex.tr)).not.toHaveProperty('modelAudioVoice');
      expect(byId(ex.tr)).not.toHaveProperty('modelAudioUrl');

      // after answering, the model comes with who says it
      const sessionId = res.json().sessionId as string;
      const graded = await authed('POST', `/sessions/${sessionId}/answers`, { exerciseId: ex.sp, answer: { selfRating: 'good' } });
      expect(graded.statusCode, graded.body).toBe(200);
      expect(graded.json()).toMatchObject({
        modelAudioUrl: expect.any(String),
        modelAudioVoice: { speaker: 'hamo', lipsync: takes.get(T.speaking)!.lipsync },
      });
      const retried = await authed('POST', `/sessions/${sessionId}/retry`, { exerciseId: ex.sp, answer: { selfRating: 'good' } });
      expect(retried.statusCode, retried.body).toBe(200);
      expect(retried.json().modelAudioVoice).toMatchObject({ speaker: 'hamo' });
      // a recording with no speaker is sent as it always was
      const translated = await authed('POST', `/sessions/${sessionId}/answers`, { exerciseId: ex.tr, answer: { text: T.translate } });
      expect(translated.json()).toMatchObject({ modelAudioUrl: expect.any(String) });
      expect(translated.json()).not.toHaveProperty('modelAudioVoice');
    });

    it('practice: the same recordings, with the same voices', async () => {
      // answering puts the items into the learner's review queue
      const lesson = await authed('GET', `/lessons/${live}/session`);
      const sessionId = lesson.json().sessionId as string;
      for (const [id, answer] of [
        [ex.li, { text: 'wrong' }],
        [ex.mp, { matches: [] }],
      ] as const) {
        const r = await authed('POST', `/sessions/${sessionId}/answers`, { exerciseId: id, answer });
        expect(r.statusCode, r.body).toBe(200);
      }
      const res = await authed('POST', '/practice/session');
      expect(res.statusCode, res.body).toBe(200);
      const exercises = res.json().exercises as Array<Record<string, unknown>>;
      const listening = exercises.find((e) => e.id === ex.li)!;
      expect(listening.audioVoice).toEqual({ speaker: 'xezo', lipsync: takes.get(T.listening)!.lipsync });
      const pairs = exercises.find((e) => e.id === ex.mp)!;
      expect(pairs.audioVoices).toEqual({ [T.left1]: { speaker: 'hevalo', lipsync: takes.get(T.left1)!.lipsync } });
      const graded = await authed('POST', `/practice/sessions/${res.json().sessionId}/answers`, {
        exerciseId: ex.li,
        answer: { text: T.listening },
      });
      expect(graded.statusCode, graded.body).toBe(200);
      expect(graded.json().modelAudioVoice).toEqual({ speaker: 'xezo', lipsync: takes.get(T.listening)!.lipsync });
    });

    it('the alphabet page: voices only for the sounds with a speaker', async () => {
      const res = await app.inject({ method: 'GET', url: '/alphabet/audio' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { clips: Record<string, string>; voices?: Record<string, unknown> };
      expect(Object.keys(body.clips)).toEqual(expect.arrayContaining(LETTERS));
      expect(body.voices?.[LETTERS[0]!]).toEqual({ speaker: 'hevalo', lipsync: expect.objectContaining({ v: 1 }) });
      // a speaker chosen and no timeline made yet: one from the sound's words, over its length
      const { rows } = await pool.query<{ duration_ms: number }>(`SELECT duration_ms FROM alphabet_audio WHERE key = $1`, [LETTERS[1]]);
      const clip = ALPHABET_CLIPS.find((c) => c.key === LETTERS[1])!;
      expect(body.voices?.[LETTERS[1]!]).toEqual({
        speaker: 'xezo',
        lipsync: encodeLipsync(lipsyncFromText(clip.say, rows[0]!.duration_ms, { script: 'latin' })),
        lipsyncSource: 'text',
      });
    });

    it('a story: its sentences’ voices, by the same key as their recordings', async () => {
      const res = await app.inject({ method: 'GET', url: `/stories/${storyId}` });
      expect(res.statusCode, res.body).toBe(200);
      const story = res.json() as { audio: Record<string, string>; voices?: Record<string, unknown> };
      const [first, second] = storyAudioSentences(`${T.story1} ${T.story2}`).map(lessonAudioKey);
      expect(Object.keys(story.audio).sort()).toEqual([first, second].sort());
      expect(story.voices).toEqual({ [first!]: { speaker: 'xezo', lipsync: takes.get(T.story1)!.lipsync } });
    });

    it('a dictionary entry: each pronunciation with its own speaker and timeline', async () => {
      const res = await authed('GET', `/dictionary/entries/${entryId}`);
      expect(res.statusCode, res.body).toBe(200);
      const audio = res.json().audio as Array<Record<string, unknown>>;
      expect(audio).toHaveLength(2);
      const voiced = audio.find((a) => a.id === dictAudio.voiced)!;
      expect(voiced).toMatchObject({ url: `https://cdn.test/dict/${s}-1.mp3`, dialect: 'kurmanji', speaker: 'hamo' });
      expect(decodeLipsync(voiced.lipsync).cues.length).toBeGreaterThan(0);
      const plain = audio.find((a) => a.id === dictAudio.plain)!;
      expect(plain).toEqual({ id: dictAudio.plain, url: `https://cdn.test/dict/${s}-2.mp3`, dialect: 'kurmanji' });
    });

    it('never sends a timeline without its speaker', async () => {
      // a timeline made, then the character taken away
      const key = lessonAudioKey(T.left1);
      expect((await patch('lesson', key, { speaker: null })).json()).toMatchObject({ speaker: null, lipsync: expect.any(Object) });
      const res = await authed('GET', `/lessons/${live}/session`);
      const pairs = (res.json().exercises as Array<Record<string, unknown>>).find((e) => e.id === ex.mp)!;
      expect(pairs).not.toHaveProperty('audioVoices');
      expect(res.body).not.toContain('"lipsync":{"v":1,"d":' + takes.get(T.left1)!.lipsync.d + ',');
    });

    it('a speaker with no timeline stored: one made from the words over the recording’s length, marked, never stored', async () => {
      const key = lessonAudioKey(T.listening);
      const { lipsync: stored } = takes.get(T.listening)!;
      expect((await patch('lesson', key, { lipsync: null })).json()).toMatchObject({ speaker: 'xezo', lipsync: null });
      const recorded = await pool.query<{ text: string; duration_ms: number }>(`SELECT text, duration_ms FROM lesson_audio WHERE key = $1`, [key]);
      const fromText = encodeLipsync(lipsyncFromText(recorded.rows[0]!.text, recorded.rows[0]!.duration_ms));
      const made = { speaker: 'xezo', lipsync: fromText, lipsyncSource: 'text' };
      try {
        // the listening clip: the learner is not sent its words, so this is the only way its mouth moves with them
        const res = await authed('GET', `/lessons/${live}/session`);
        expect(res.statusCode, res.body).toBe(200);
        const listening = (res.json().exercises as Array<Record<string, unknown>>).find((e) => e.id === ex.li)!;
        expect(listening.audioVoice).toEqual(made);
        expect(listening.modelAudioVoice).toEqual(made);
        expect(decodeLipsync(fromText).durationMs).toBe(recorded.rows[0]!.duration_ms);
        // and with the grading
        const graded = await authed('POST', `/sessions/${res.json().sessionId}/answers`, {
          exerciseId: ex.li,
          answer: { text: T.listening },
        });
        expect(graded.statusCode, graded.body).toBe(200);
        expect(graded.json().modelAudioVoice).toEqual(made);

        // never stored: the studio still sees a recording whose timeline is to be made
        expect((await row(key)).lipsync).toBeNull();
        const studio = await app.inject({ method: 'GET', url: '/admin/lesson-audio', headers: { authorization: `Bearer ${editor}` } });
        expect((studio.json().items as Array<Record<string, unknown>>).find((i) => i.key === key)).toMatchObject({ hasLipsync: false });
      } finally {
        expect((await patch('lesson', key, { lipsync: stored })).statusCode).toBe(200);
      }

      // a stored timeline goes out as it was stored, with nothing to say it is approximate
      const res = await authed('GET', `/lessons/${live}/session`);
      const listening = (res.json().exercises as Array<Record<string, unknown>>).find((e) => e.id === ex.li)!;
      expect(listening.audioVoice).toEqual({ speaker: 'xezo', lipsync: stored });
      expect(listening.audioVoice).not.toHaveProperty('lipsyncSource');
    });

    it('a story sentence with a speaker and no timeline gets one from its words; a dictionary word, with no length, none', async () => {
      const second = lessonAudioKey(T.story2);
      expect((await patch('lesson', second, { speaker: 'hamo' })).statusCode).toBe(200);
      const recorded = await pool.query<{ text: string; duration_ms: number }>(`SELECT text, duration_ms FROM lesson_audio WHERE key = $1`, [second]);
      const story = (await app.inject({ method: 'GET', url: `/stories/${storyId}` })).json() as { voices: Record<string, unknown> };
      expect(story.voices[second]).toEqual({
        speaker: 'hamo',
        lipsync: encodeLipsync(lipsyncFromText(recorded.rows[0]!.text, recorded.rows[0]!.duration_ms)),
        lipsyncSource: 'text',
      });
      // the first sentence's timeline was made from its sound, and is sent as it is
      expect(story.voices[lessonAudioKey(T.story1)]).toEqual({ speaker: 'xezo', lipsync: takes.get(T.story1)!.lipsync });

      expect((await patch('dictionary', dictAudio.plain, { speaker: 'xezo' })).statusCode).toBe(200);
      const entry = await authed('GET', `/dictionary/entries/${entryId}`);
      const plain = (entry.json().audio as Array<Record<string, unknown>>).find((a) => a.id === dictAudio.plain);
      expect(plain).toEqual({ id: dictAudio.plain, url: `https://cdn.test/dict/${s}-2.mp3`, dialect: 'kurmanji', speaker: 'xezo' });
    });
  });
});
