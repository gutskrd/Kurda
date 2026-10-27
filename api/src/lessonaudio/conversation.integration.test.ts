/**
 * Conversations against real Postgres: each part recorded on its own, by
 * whoever plays it; the page they record on, with who made each take; and the
 * lines' recordings arriving with the conversation a learner is given.
 *
 * Runs on DATABASE_URL alone, with the storage PUT stubbed unless S3_ENDPOINT
 * is set, as the lesson audio test does.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { conversationLineKey, lessonAudioKey } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';

const DATABASE_URL = process.env.DATABASE_URL;
const realS3 = Boolean(process.env.S3_ENDPOINT);

/** A mono PCM WAV of a quiet tone, varied by `seed` so each is a new file. */
function wav(seconds: number, seed = 1): Buffer {
  const rate = 22050;
  const frames = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + frames * 2, 4);
  b.write('WAVE', 8);
  b.write('fmt ', 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(Math.sin((i * seed) / 10) * 3000), 44 + i * 2);
  return b;
}

describe.skipIf(!DATABASE_URL)('conversations (integration)', () => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    ...(realS3
      ? {}
      : { S3_ENDPOINT: 'http://127.0.0.1:9', S3_BUCKET: 'conversation-test', S3_ACCESS_KEY_ID: 'test', S3_SECRET_ACCESS_KEY: 'test' }),
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  let repo: ContentRepository;
  const s = Date.now().toString(36);
  const id = `cv${s}`.slice(0, 32);
  const userIds: string[] = [];
  let xezoVoice = '';
  let hamoVoice = '';
  let learner = '';
  let courseId = '';
  let lesson = '';
  let exerciseId = '';
  let listeningId = '';

  // "Silav!" is said by both: two recordings, one each
  const conversation = {
    id,
    title: `Nasîn ${s}`,
    speakers: [
      { name: 'Xezo', character: 'xezo' },
      { name: 'Hamo', character: 'hamo' },
    ],
    lines: [
      { speaker: 0, text: `Silav ${s}!`, en: 'Hello!' },
      { speaker: 1, text: `Silav ${s}!`, en: 'Hello!' },
      { speaker: 0, text: `Tu çawa yî ${s}?` },
      { speaker: 1, text: `Ez baş im ${s}.` },
    ],
    prompt: 'Hamo çawa ye?',
    options: ['Baş e', 'Nexweş e'],
    correctIndex: 0,
  };
  const keyOf = (line: number): string => conversationLineKey(id, conversation.lines[line]!.speaker, conversation.lines[line]!.text);
  const ourKeys = (): string[] => [
    ...conversation.lines.map((_, i) => keyOf(i)),
    lessonAudioKey(conversation.lines[0]!.text),
    lessonAudioKey(conversation.lines[3]!.text),
  ];

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
    const userId = res.json().user.id as string;
    userIds.push(userId);
    await pool.query(`UPDATE users SET roles = $2 WHERE id = $1`, [userId, roles]);
    const token = res.json().tokens.accessToken as string;
    if (roles !== '{}') await pass2fa(app, token);
    return token;
  }

  const record = (text: string, token: string, query = '', seed = 1) =>
    app.inject({
      method: 'PUT',
      url: `/admin/lesson-audio?text=${encodeURIComponent(text)}${query}`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'audio/wav' },
      payload: wav(1, seed),
      remoteAddress: '10.96.0.9',
    });
  const page = (token: string, query = '') =>
    app.inject({ method: 'GET', url: `/admin/lesson-audio/conversations/${id}${query}`, headers: { authorization: `Bearer ${token}` } });
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

    courseId = await repo.createCourse({ slug: `cv-${s}`, titleKu: 'Axaftin', titleEn: `Conversation course ${s}` });
    const unitId = await repo.createUnit(courseId, 1, 'Yek', 'Unit one');
    const skillId = await repo.createSkill(unitId, 1, 'Nasîn', 'Meeting');
    lesson = await repo.createLesson(skillId, 1, 'Nasîn 1', 'Meeting 1');
    exerciseId = await repo.addExercise(lesson, 1, 'conversation', conversation);
    // a listening item that plays the words of Hamo's last line
    listeningId = await repo.addExercise(lesson, 2, 'listening', { audioUrl: 'https://cdn.test/own.mp3', accepted: [conversation.lines[3]!.text] });
    await repo.publishLesson(lesson);

    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [ourKeys()]);
    xezoVoice = await register('cvXezo', '10.96.0.1', '{content_editor}');
    hamoVoice = await register('cvHamo', '10.96.0.2', '{content_editor}');
    learner = await register('cvLearner', '10.96.0.3', '{}');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [ourKeys()]);
    const client = await pool.connect();
    try {
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

  it('asks for every line in the studio, filed under who says it', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/lesson-audio', headers: { authorization: `Bearer ${xezoVoice}` } });
    expect(res.statusCode, res.body).toBe(200);
    const items = (res.json().items as Array<{ key: string; text: string; recorded: boolean; line?: unknown; usedIn: Array<{ lessonId: string }> }>).filter(
      (i) => i.line && i.usedIn.some((u) => u.lessonId === lesson),
    );
    // the same words by both parts are two recordings to make
    expect(items.map((i) => i.key).sort()).toEqual(conversation.lines.map((_, i) => keyOf(i)).sort());
    expect(items.find((i) => i.key === keyOf(1))).toMatchObject({
      text: conversation.lines[1]!.text,
      recorded: false,
      line: { conversation: id, part: 1, name: 'Hamo', character: 'hamo' },
    });
  });

  it('records each part on its own: one person’s take never stands in for the other’s', async () => {
    // saved under the deer's voice by mistake: a learner still sees Xezo say it, her part's character
    const mine = await record(conversation.lines[0]!.text, xezoVoice, `&line=${id}:0&speaker=hevalo`);
    expect(mine.statusCode, mine.body).toBe(201);
    expect(mine.json().key).toBe(keyOf(0));
    // a plain recording of the same words is a recording of its own, not the line's
    const plain = await record(conversation.lines[0]!.text, xezoVoice, '', 2);
    expect(plain.json().key).toBe(lessonAudioKey(conversation.lines[0]!.text));
    const theirs = await record(conversation.lines[1]!.text, hamoVoice, `&line=${id}:1`, 3);
    expect(theirs.statusCode, theirs.body).toBe(201);
    expect(theirs.json().url).not.toBe(mine.json().url);
    expect((await record('Silav', xezoVoice, '&line=Not-An-Id:0')).statusCode).toBe(400);
  });

  it('shows the people recording it every line, with who made each take', async () => {
    const res = await page(hamoVoice);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.lesson).toMatchObject({ id: lesson, status: 'published', exercisePosition: 1 });
    expect(body.conversation.speakers).toEqual(conversation.speakers);
    expect(body.lines.map((l: { part: number; recording: unknown }) => [l.part, l.recording !== null])).toEqual([
      [0, true],
      [1, true],
      [0, false],
      [1, false],
    ]);
    expect(body.lines[0].recording).toMatchObject({ speaker: 'hevalo', recordedBy: { username: `cvXezo_${s}` } });
    expect(body.lines[1].recording.recordedBy.username).toBe(`cvHamo_${s}`);
  });

  it('opens the newest version of the lesson from a link made before it', async () => {
    const next = await repo.newLessonVersion(lesson);
    try {
      const res = await page(xezoVoice, `?lesson=${lesson}`);
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().lesson).toMatchObject({ id: next, status: 'draft', version: 2 });
      // the new version kept the conversation's id, and with it the takes already made
      expect(res.json().lines[0].recording).not.toBeNull();
    } finally {
      await pool.query(`DELETE FROM lessons WHERE id = $1`, [next]);
    }
  });

  it('is only for people who record, and says nothing of a conversation no lesson has', async () => {
    expect((await page(learner)).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/admin/lesson-audio/conversations/${id}` })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/admin/lesson-audio/conversations/nosuch99', headers: { authorization: `Bearer ${xezoVoice}` } })).statusCode).toBe(404);
  });

  it('gives a learner the conversation with each line’s recording, and grades the question', async () => {
    const res = await authed('GET', `/lessons/${lesson}/session`);
    expect(res.statusCode, res.body).toBe(200);
    const ex = (res.json().exercises as Array<Record<string, unknown>>).find((e) => e.id === exerciseId)!;
    expect(ex).toMatchObject({ type: 'conversation', title: conversation.title, prompt: 'Hamo çawa ye?', lines: conversation.lines });
    expect(ex).not.toHaveProperty('correctIndex');
    const audio = ex.lineAudio as Array<string | null>;
    expect(audio).toHaveLength(4);
    expect(audio[0]).toEqual(expect.any(String));
    expect(audio[1]).toEqual(expect.any(String));
    expect(audio[0]).not.toBe(audio[1]);
    expect(audio.slice(2)).toEqual([null, null]);
    // each recorded line said by its own part's character, whatever voice the take was saved under, or none
    expect((ex.lineVoices as Array<{ speaker: string } | null>).map((v) => v?.speaker ?? null)).toEqual(['xezo', 'hamo', null, null]);

    const options = ex.options as string[];
    const graded = await authed('POST', `/sessions/${res.json().sessionId}/answers`, { exerciseId, answer: { choice: options.indexOf('Nexweş e') } });
    expect(graded.statusCode, graded.body).toBe(200);
    expect(graded.json()).toMatchObject({ verdict: 'wrong', accepted: false, correction: 'Baş e' });
  });
  it('never sends a line the same file a listening item plays, which its words beside it would name', async () => {
    // one file, uploaded as the listening item's transcription and as Hamo's line of the same words
    const text = conversation.lines[3]!.text;
    expect((await record(text, hamoVoice, '', 7)).statusCode).toBe(201);
    expect((await record(text, hamoVoice, `&line=${id}:1`, 7)).statusCode).toBe(201);
    // stored content-addressed, the two are one URL
    const stored = await pool.query<{ url: string }>(`SELECT url FROM lesson_audio WHERE key = ANY($1)`, [[lessonAudioKey(text), keyOf(3)]]);
    expect(new Set(stored.rows.map((r) => r.url)).size).toBe(1);

    const res = await authed('GET', `/lessons/${lesson}/session`);
    const exercises = res.json().exercises as Array<Record<string, unknown>>;
    const listening = exercises.find((e) => e.id === listeningId)!;
    expect(listening.audioUrl).toBe(stored.rows[0]!.url);
    const line = exercises.find((e) => e.id === exerciseId)!;
    expect((line.lineAudio as Array<string | null>)[3]).toBeNull();
    expect(JSON.stringify(line)).not.toContain(stored.rows[0]!.url);
  });
});
