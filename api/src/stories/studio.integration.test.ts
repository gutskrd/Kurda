/**
 * Story sentences in the audio studio, against real Postgres: listed like a
 * lesson's (a course per variety, the story as its unit and lesson), after
 * the lessons, archived stories left out — and a recording made there
 * reaching the story's "fully narrated" badge in the cached public list.
 *
 * Runs on DATABASE_URL alone; the storage PUT is stubbed, as in the lesson
 * audio suite, since what is under test is the listing and the cache.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { lessonAudioKey } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from '../content/repository.js';
import { pass2fa } from '../test/admin-2fa.js';
import { activate } from '../test/activate.js';
import { testStory } from '../test/stories.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** A second of quiet mono 16-bit PCM. */
function wav(seed: number): Buffer {
  const rate = 22050;
  const bytes = rate * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + bytes, 4);
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
  b.writeUInt32LE(bytes, 40);
  for (let i = 0; i < rate; i++) b.writeInt16LE(Math.round(Math.sin((i * seed) / 10) * 3000), 44 + i * 2);
  return b;
}

interface Usage {
  courseId: string;
  courseTitle: string;
  unitId: string;
  unitTitle: string;
  skillId: string;
  skillTitle: string;
  lessonId: string;
  lessonTitle: string;
  lessonPosition: number;
  lessonStatus: string;
  lessonVersion: number;
  live: boolean;
  exerciseTypes: string[];
  listeningNeedsIt: boolean;
}
interface Item {
  key: string;
  text: string;
  recorded: boolean;
  usedIn: Usage[];
  unused: boolean;
}

describe.skipIf(!DATABASE_URL)('story sentences in the audio studio (integration)', () => {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    S3_ENDPOINT: 'http://127.0.0.1:9',
    S3_BUCKET: 'story-audio-test',
    S3_ACCESS_KEY_ID: 'test',
    S3_SECRET_ACCESS_KEY: 'test',
  });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  const userIds: string[] = [];
  let editor = '';
  let courseId = '';
  const ids: Record<string, string> = {};
  const slug = (name: string) => `aud-${name}-${s}`;
  // sentences only this run's stories say; the first is also in a lesson
  const T = {
    shared: `Em diçin gund ${s}.`,
    one: `Ez nan dixwim ${s}.`,
    two: `Ew av vedixwe ${s}!`,
    archived: `Kes vê naxwîne ${s}.`,
    long: `${`Rojîn ${s} `.repeat(40).trim()}.`,
  };
  const keys = Object.values(T).map(lessonAudioKey);

  const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: `Bearer ${editor}`, ...headers }, remoteAddress: '10.94.0.3' });
  const studio = async (): Promise<Item[]> => {
    const res = await call('GET', '/admin/lesson-audio');
    expect(res.statusCode, res.body).toBe(200);
    return res.json().items;
  };
  const item = (items: Item[], text: string) => items.find((i) => i.key === lessonAudioKey(text));

  async function story(name: string, body: string, status: 'draft' | 'published' | 'archived', dialect: 'kurmanci' | 'sorani' = 'kurmanci') {
    const base = testStory(slug(name), { dialect });
    const res = await call('POST', '/admin/stories', { ...base, title: `Title ${name} ${s}`, body: `${base.body}\n\n${body}` });
    expect(res.statusCode, res.body).toBe(201);
    ids[name] = res.json().id;
    let lockVersion = res.json().lockVersion as number;
    if (status !== 'draft') {
      const published = await call('POST', `/admin/stories/${ids[name]}/publish`, { lockVersion });
      expect(published.statusCode).toBe(200);
      lockVersion = published.json().lockVersion;
    }
    if (status === 'archived') expect((await call('POST', `/admin/stories/${ids[name]}/archive`, { lockVersion })).statusCode).toBe(200);
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    app.storage!.put = async () => undefined;
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [keys]);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `audEditor_${s}@it.kurda.app`,
        username: `audEditor_${s}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      // its own address each run: signups are capped per address over a day
      remoteAddress: `10.94.${Math.floor(Math.random() * 250)}.1`,
    });
    await activate(app, pool, res);
    userIds.push(res.json().user.id);
    await pool.query(`UPDATE users SET roles = '{content_editor}' WHERE id = $1`, [userIds[0]]);
    editor = res.json().tokens.accessToken;
    await pass2fa(app, editor, '10.94.0.2');

    // a lesson that says the shared sentence
    const repo = new ContentRepository(pool);
    courseId = await repo.createCourse({ slug: `aud-${s}`, titleKu: 'Deng', titleEn: `Audio ${s}` });
    const unitId = await repo.createUnit(courseId, 1, 'Yek', 'Unit one');
    const skillId = await repo.createSkill(unitId, 1, 'Gund', 'Village');
    const lesson = await repo.createLesson(skillId, 1, 'Gund 1', 'Village 1');
    await repo.addExercise(lesson, 1, 'translate', { prompt: 'We go to the village', accepted: [T.shared] });

    await story('draft', `${T.shared} ${T.one} ${T.one}`, 'draft');
    await story('live', `${T.two}`, 'published');
    await story('archived', T.archived, 'archived');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1)`, [keys]);
    await pool.query(`DELETE FROM stories WHERE slug LIKE $1`, [`%-${s}`]);
    await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('lists every sentence of a story that is not archived, filed like a lesson', async () => {
    // a sentence too long to record can only be there from before the check; the admin refuses one now
    await pool.query(`UPDATE stories SET body = body || E'\n\n' || $2 WHERE id = $1`, [ids.draft, T.long]);
    const items = await studio();
    expect(item(items, T.one)!.usedIn).toEqual([
      {
        courseId: 'stories:kurmanci',
        courseTitle: 'Stories — Kurmancî',
        unitId: ids.draft,
        unitTitle: `Title draft ${s}`,
        skillId: ids.draft,
        skillTitle: `Title draft ${s}`,
        lessonId: ids.draft,
        lessonTitle: `Title draft ${s}`,
        lessonPosition: 0,
        lessonStatus: 'draft',
        lessonVersion: 1,
        live: false,
        exerciseTypes: [],
        listeningNeedsIt: false,
      },
    ]);
    expect(item(items, T.one)).toMatchObject({ text: T.one, recorded: false, unused: false });
    // a published story is what learners read today
    expect(item(items, T.two)!.usedIn[0]).toMatchObject({ lessonStatus: 'published', live: true, unitId: ids.live });
    // an archived story asks for nothing, and a sentence no recording could hold is the editor's to split
    expect(item(items, T.archived)).toBeUndefined();
    expect(item(items, T.long)).toBeUndefined();
  });

  it('files a sentence a lesson also says under the lesson, with the story as one more use', async () => {
    const items = await studio();
    const shared = item(items, T.shared)!;
    expect(shared.usedIn.map((u) => u.courseId)).toEqual([courseId, 'stories:kurmanci']);
    // story-only sentences come after every lesson's, and before the recordings nothing uses
    const at = (text: string) => items.findIndex((i) => i.key === lessonAudioKey(text));
    const lastLesson = items.reduce((last, it, i) => (it.usedIn[0] && !it.usedIn[0].courseId.startsWith('stories:') ? i : last), -1);
    expect(at(T.one)).toBeGreaterThan(lastLesson);
    expect(at(T.one)).toBeLessThan(items.findIndex((i) => i.unused) === -1 ? Infinity : items.findIndex((i) => i.unused));
  });

  it('shows a story as fully narrated in the public list as soon as its last sentence is recorded', async () => {
    const listed = async () =>
      ((await app.inject({ method: 'GET', url: '/stories?dialect=kurmanci' })).json().stories as Array<{ id: string; fullyNarrated: boolean }>).find(
        (st) => st.id === ids.live,
      )!;
    expect((await listed()).fullyNarrated).toBe(false);

    const sentences = [...new Set([...testStory('x').body.split(/(?<=[.!?])\s+/).map((t) => t.trim()), T.two])];
    for (const [i, text] of sentences.entries()) {
      const res = await call('PUT', `/admin/lesson-audio?text=${encodeURIComponent(text)}`, wav(i + 1), { 'content-type': 'audio/wav' });
      expect(res.statusCode, res.body).toBe(201);
      keys.push(lessonAudioKey(text));
    }
    // the studio's save emptied the cached list
    expect((await listed()).fullyNarrated).toBe(true);

    // and so does a removal
    const gone = await app.inject({
      method: 'DELETE',
      url: `/admin/lesson-audio?key=${encodeURIComponent(lessonAudioKey(T.two))}`,
      headers: { authorization: `Bearer ${editor}` },
    });
    expect(gone.statusCode).toBe(200);
    expect((await listed()).fullyNarrated).toBe(false);
  });
});
