/**
 * A road chapter going online by itself against real Postgres: not while a line is unrecorded, then every lesson at
 * once when the last take is in; never twice; never a chapter with nothing to record; never over a lesson an editor is
 * reworking; and the chapter's story waited for and published with it. Each run builds its own course, so the road is
 * never touched.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import pg from 'pg';
import { conversationLineKey, lessonAudioKey } from '@kurda/shared';
import { ContentRepository } from './repository.js';
import { publishRecordedChapters, RoadChapterWatch, roadChapters } from './road-chapters.js';

const DATABASE_URL = process.env.DATABASE_URL;

const quiet = { info: () => undefined, warn: () => undefined } as unknown as Pick<FastifyBaseLogger, 'info' | 'warn'>;

describe.skipIf(!DATABASE_URL)('road chapters going online (integration)', () => {
  const s = Date.now().toString(36);
  const course = `road-ch-${s}`;
  const conversation = `roadch${s}`.replace(/[^a-z0-9]/g, '').slice(0, 32);
  let pool: pg.Pool;
  let repo: ContentRepository;
  const keys: string[] = [];
  // the story told at the end of chapter 1 of this test's course: road-01-…, as the road names them
  const storySlug = `road-01-test-${s}`;

  async function record(text: string, key = lessonAudioKey(text)): Promise<void> {
    keys.push(key);
    await pool.query(
      `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms) VALUES ($1, $2, $3, $4, 'audio/wav', 900)
       ON CONFLICT (key) DO NOTHING`,
      [key, text, `test/${key}`, `https://cdn.example/${encodeURIComponent(key)}.wav`],
    );
  }

  async function statuses(): Promise<Array<[number, number, number, string]>> {
    const { rows } = await pool.query<{ unit: number; position: number; version: number; status: string }>(
      `SELECT u.position unit, l.position, l.version, l.status
         FROM lessons l JOIN skills sk ON sk.id = l.skill_id JOIN units u ON u.id = sk.unit_id JOIN courses c ON c.id = u.course_id
        WHERE c.slug = $1 ORDER BY u.position, l.position, l.version`,
      [course],
    );
    return rows.map((r) => [r.unit, r.position, r.version, r.status]);
  }

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);
    const courseId = await repo.createCourse({ slug: course, titleKu: 'Rê', titleEn: `Chapters ${s}` });

    // chapter 1: two lessons, a heard sentence, a spoken one, a pair of words and a conversation of two lines
    const one = await repo.createSkill(await repo.createUnit(courseId, 1, 'Silav', 'Hello'), 1, 'Silav', 'Hello');
    const a = await repo.createLesson(one, 1, 'Silav', 'Hello');
    await repo.addExercise(a, 1, 'listening', { voice: 'hamo', prompt: 'Type what you hear.', accepted: ['Silav!'] });
    await repo.addExercise(a, 2, 'match_pairs', { voice: 'hamo', pairs: [{ left: 'çay', right: 'tea' }, { left: 'sêv', right: 'apple' }] });
    const b = await repo.createLesson(one, 2, 'Fermo', 'Here you are');
    await repo.addExercise(b, 1, 'speaking', { voice: 'hamo', prompt: 'Say it.', reference: 'Bi xêr bimînî!' });
    await repo.addExercise(b, 2, 'conversation', {
      id: conversation,
      speakers: [{ character: 'hamo' }, { character: 'hevalo' }],
      lines: [
        { speaker: 0, text: 'Fermo, sêvek!', en: 'Here, an apple!' },
        { speaker: 1, text: 'Spas!', en: 'Thanks!' },
      ],
      prompt: 'What does Hamo give?',
      options: ['an apple', 'tea'],
      correctIndex: 0,
    });
    // chapter 2: a lesson with nothing to record
    const two = await repo.createSkill(await repo.createUnit(courseId, 2, 'Malbat', 'Family'), 1, 'Malbat', 'Family');
    const c = await repo.createLesson(two, 1, 'Dê', 'Mother');
    await repo.addExercise(c, 1, 'multiple_choice', { prompt: 'Which is right?', options: ['Ez baş im.', 'Ez baş î.'], correctIndex: 0 });
    // chapter 1's story: two sentences, each a recording the chapter waits for
    await pool.query(
      `INSERT INTO stories (slug, dialect, level, title, body, word_count, length, sentence_keys, status, source)
       VALUES ($1, 'kurmanci', 1, 'Sêv', $2, 70, 'short', $3, 'draft', 'starter')`,
      [storySlug, 'Hevalo birçî ye. Sêv xweş e.', [lessonAudioKey('Hevalo birçî ye.'), lessonAudioKey('Sêv xweş e.')]],
    );
  });

  afterAll(async () => {
    // a published version can only be retired, which lets the course go
    await pool.query(
      `UPDATE lessons SET status = 'archived' WHERE status = 'published' AND skill_id IN
         (SELECT sk.id FROM skills sk JOIN units u ON u.id = sk.unit_id JOIN courses c ON c.id = u.course_id WHERE c.slug = $1)`,
      [course],
    );
    await pool.query(`DELETE FROM courses WHERE slug = $1`, [course]);
    await pool.query(`DELETE FROM stories WHERE slug = $1`, [storySlug]);
    await pool.query(`DELETE FROM lesson_audio WHERE key = ANY($1::text[])`, [keys]);
    await pool.end();
  });

  it('waits while one line is still unrecorded, counting every recording its lessons play', async () => {
    await record('Silav!');
    await record('çay');
    await record('sêv');
    await record('Bi xêr bimînî!');
    await record('Fermo, sêvek!', conversationLineKey(conversation, 0, 'Fermo, sêvek!'));
    await record('Hevalo birçî ye.');
    await record('Sêv xweş e.');
    expect(await publishRecordedChapters(pool, quiet, course, true)).toEqual([]);
    expect(await roadChapters(pool, course, true)).toEqual([
      { position: 1, titleKu: 'Silav', titleEn: 'Hello', lessons: 2, published: 0, story: { slug: storySlug, title: 'Sêv', online: false }, lines: 8, recorded: 7, online: false },
      { position: 2, titleKu: 'Malbat', titleEn: 'Family', lessons: 1, published: 0, story: null, lines: 0, recorded: 0, online: false },
    ]);
    expect((await statuses()).map((r) => r[3])).toEqual(['draft', 'draft', 'draft']);
  });

  it('puts the whole chapter online once its last line is in, and only once; a chapter with nothing to record stays as it is', async () => {
    await record('Spas!', conversationLineKey(conversation, 1, 'Spas!'));
    const watch = new RoadChapterWatch(pool, quiet, course, true);
    // a burst of takes makes one run after the one going, not one each
    await Promise.all([watch.nudge(), watch.nudge(), watch.nudge()]);
    expect(await statuses()).toEqual([
      [1, 1, 1, 'published'],
      [1, 2, 1, 'published'],
      [2, 1, 1, 'draft'],
    ]);
    expect((await roadChapters(pool, course, true))[0]).toMatchObject({ published: 2, lines: 8, recorded: 8, online: true, story: { online: true } });
    // the story went online with its chapter, approved, as learners are shown only approved stories
    const story = await pool.query(`SELECT status, review_status, published_at IS NOT NULL published FROM stories WHERE slug = $1`, [storySlug]);
    expect(story.rows).toEqual([{ status: 'published', review_status: 'approved', published: true }]);
    expect(await publishRecordedChapters(pool, quiet, course, true)).toEqual([]);
  });

  it('leaves a lesson an editor reworks after it went out to them', async () => {
    const [first] = (await pool.query<{ id: string }>(
      `SELECT l.id FROM lessons l JOIN skills sk ON sk.id = l.skill_id JOIN units u ON u.id = sk.unit_id JOIN courses c ON c.id = u.course_id
        WHERE c.slug = $1 AND u.position = 1 AND l.position = 1`,
      [course],
    )).rows;
    await repo.newLessonVersion(first!.id);
    expect(await publishRecordedChapters(pool, quiet, course, true)).toEqual([]);
    expect((await statuses()).filter((r) => r[0] === 1)).toEqual([
      [1, 1, 1, 'published'],
      [1, 1, 2, 'draft'],
      [1, 2, 1, 'published'],
    ]);
  });
});
