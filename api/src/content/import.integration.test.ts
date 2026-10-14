/** Content import against real Postgres (CI job). KUR-041. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lessonAudioKey } from '@kurda/shared';
import { loadConfig } from '../config/env.js';
import { ContentRepository } from './repository.js';
import { importCourse } from './import.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('importCourse (integration)', () => {
  loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let pool: pg.Pool;
  let repo: ContentRepository;
  const slug = `imp-${Date.now().toString(36)}`;

  const content = {
    course: { slug, dialect: 'kurmanji', titleKu: 'K', titleEn: 'Import Test' },
    units: [
      {
        position: 1,
        titleKu: 'Y',
        titleEn: 'Unit',
        skills: [
          {
            position: 1,
            titleKu: 'B',
            titleEn: 'Basics',
            grammarMd: '# Silav',
            lessons: [
              {
                position: 1,
                titleKu: 'L',
                titleEn: 'Lesson',
                exercises: [
                  { position: 1, type: 'translate', payload: { prompt: 'apple', accepted: ['sêv'] } },
                  { position: 2, type: 'multiple_choice', payload: { prompt: 'p', options: ['a', 'b'], correctIndex: 0 } },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    repo = new ContentRepository(pool);
  });

  afterAll(async () => {
    const courseId = await repo.findCourseBySlug(slug);
    if (courseId) {
      await pool.query(
        `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
           SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
        [courseId],
      );
      await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
    }
    await pool.end();
  });

  it('dry-run validates and writes nothing', async () => {
    const res = await importCourse(repo, content, { dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.issues).toHaveLength(0);
    expect(res.summary).toMatchObject({ units: 1, skills: 1, lessons: 1, exercises: 2 });
    expect(await repo.findCourseBySlug(slug)).toBeNull(); // nothing written
  });

  it('surfaces validation errors instead of importing', async () => {
    const bad = structuredClone(content);
    bad.units[0]!.skills[0]!.lessons[0]!.exercises[0]!.payload = { prompt: 'x' } as never; // missing accepted
    const res = await importCourse(repo, bad, {});
    expect(res.issues.length).toBeGreaterThan(0);
    expect(await repo.findCourseBySlug(slug)).toBeNull();
  });

  it('imports and publishes the course', async () => {
    const res = await importCourse(repo, content, { publish: true });
    expect(res.issues).toHaveLength(0);
    expect(res.summary.courseCreated).toBe(true);

    const courseId = (await repo.findCourseBySlug(slug))!;
    const unitId = (await repo.findUnit(courseId, 1))!;
    const skillId = (await repo.findSkill(unitId, 1))!;
    const published = await repo.publishedLesson(skillId, 1);
    expect(published?.version).toBe(1);
    expect(await repo.grammarForSkill(skillId)).toBe('# Silav');
  });

  const slotVersions = async () => {
    const courseId = (await repo.findCourseBySlug(slug))!;
    const unitId = (await repo.findUnit(courseId, 1))!;
    const skillId = (await repo.findSkill(unitId, 1))!;
    const versions = await pool.query<{ id: string; version: number; status: string }>(
      `SELECT id, version, status FROM lessons WHERE skill_id = $1 AND position = 1 ORDER BY version`,
      [skillId],
    );
    return { skillId, rows: versions.rows };
  };
  const exerciseIds = async (lessonId: string) =>
    (await pool.query<{ id: string }>(`SELECT id FROM exercises WHERE lesson_id = $1 ORDER BY position`, [lessonId])).rows.map(
      (r) => r.id,
    );

  /**
   * Review history is keyed on exercise ids, and a new version has new ones.
   * Re-running an unchanged import — what loading content on every deploy
   * does — must leave every lesson, and so every learner's schedule, alone.
   */
  it('re-importing unchanged content creates zero new versions', async () => {
    const before = await slotVersions();
    const ids = await exerciseIds(before.rows[0]!.id);

    for (const publish of [false, true]) {
      const res = await importCourse(repo, content, { publish });
      expect(res.summary).toMatchObject({ courseCreated: false, versionsCreated: 0, unchanged: 1 });
    }
    const dry = await importCourse(repo, content, { dryRun: true });
    expect(dry.summary).toMatchObject({ versionsCreated: 0, unchanged: 1 });

    const after = await slotVersions();
    expect(after.rows.map((r) => r.version)).toEqual([1]);
    expect(await exerciseIds(after.rows[0]!.id)).toEqual(ids); // same ids → history survives
  });

  it('a one-word change creates exactly one new draft version, leaving the published one intact', async () => {
    const changed = structuredClone(content);
    changed.units[0]!.skills[0]!.lessons[0]!.exercises[0]!.payload = { prompt: 'apple', accepted: ['sêvek'] };

    const dry = await importCourse(repo, changed, { dryRun: true });
    expect(dry.summary).toMatchObject({ versionsCreated: 1, unchanged: 0 });

    const res = await importCourse(repo, changed, {}); // no publish → draft v2
    expect(res.summary).toMatchObject({ courseCreated: false, versionsCreated: 1, unchanged: 0 });

    const { skillId, rows } = await slotVersions();
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
    expect(rows.find((r) => r.version === 1)!.status).toBe('published'); // untouched
    expect(rows.find((r) => r.version === 2)!.status).toBe('draft');
    // learner still sees the published v1
    expect((await repo.publishedLesson(skillId, 1))?.version).toBe(1);

    // the same change again stacks no second draft; publishing it makes it live
    expect((await importCourse(repo, changed, {})).summary.versionsCreated).toBe(0);
    expect((await importCourse(repo, changed, { publish: true })).summary.versionsCreated).toBe(0);
    expect((await repo.publishedLesson(skillId, 1))?.version).toBe(2);
    expect((await slotVersions()).rows).toHaveLength(2);

    // and going back to the old content is a change from what learners see now
    expect((await importCourse(repo, content, {})).summary.versionsCreated).toBe(1);
  });

  it('reports the answer-position lint as a warning, not an error', async () => {
    expect((await importCourse(repo, content, { dryRun: true })).warnings).toEqual([]); // one item: too few to tell
    const allFirst = structuredClone(content);
    allFirst.units[0]!.skills[0]!.lessons[0]!.exercises = [1, 2, 3].map((position) => ({
      position,
      type: 'multiple_choice',
      payload: { prompt: `p${position}`, options: ['a', 'b'], correctIndex: 0 },
    })) as never;
    const res = await importCourse(repo, allFirst, { dryRun: true });
    expect(res.issues).toEqual([]);
    expect(res.warnings).toHaveLength(1);
    expect(res.summary.versionsCreated).toBe(1);
  });

  describe('publishing a listening item', () => {
    const silentSlug = `${slug}-li`;
    const heard = `Ez li malê me ${slug}`;
    const withListening = (payload: Record<string, unknown>) => {
      const doc = structuredClone(content);
      doc.course.slug = silentSlug;
      doc.units[0]!.skills[0]!.lessons[0]!.exercises.push({ position: 3, type: 'listening', payload } as never);
      return doc;
    };

    afterAll(async () => {
      await pool.query(`DELETE FROM lesson_audio WHERE key = $1`, [lessonAudioKey(heard)]);
      const courseId = await repo.findCourseBySlug(silentSlug);
      if (courseId) {
        await pool.query(
          `UPDATE lessons SET status = 'archived' WHERE skill_id IN (
             SELECT s.id FROM skills s JOIN units u ON u.id = s.unit_id WHERE u.course_id = $1)`,
          [courseId],
        );
        await pool.query(`DELETE FROM courses WHERE id = $1`, [courseId]);
      }
    });

    it('refuses to publish one with nothing to play, and writes nothing', async () => {
      const doc = withListening({ prompt: 'Type what you hear', accepted: [`${heard}.`] });
      for (const options of [{ publish: true }, { publish: true, dryRun: true }]) {
        const res = await importCourse(repo, doc, options);
        expect(res.issues).toHaveLength(1);
        expect(res.issues[0]!.path).toBe('units[0].skills[0].lessons[0].exercises[2].payload.audioUrl');
        expect(res.issues[0]!.message).toContain(`${heard}.`);
      }
      expect(await repo.findCourseBySlug(silentSlug)).toBeNull();
    });

    it('imports it as a draft, where it can wait for its recording', async () => {
      const res = await importCourse(repo, withListening({ accepted: [heard] }), {});
      expect(res.issues).toHaveLength(0);
      expect(await repo.findCourseBySlug(silentSlug)).not.toBeNull();
    });

    it('publishes it once the transcription is recorded, or with a clip of its own', async () => {
      expect((await importCourse(repo, withListening({ audioUrl: 'https://cdn.test/own.mp3', accepted: [heard] }), { publish: true })).issues).toEqual(
        [],
      );
      await pool.query(
        `INSERT INTO lesson_audio (key, text, media_key, url, content_type, duration_ms)
         VALUES ($1, $2, 'test', 'https://cdn.test/lesson-audio/y.wav', 'audio/wav', 1500)`,
        [lessonAudioKey(heard), heard],
      );
      const res = await importCourse(repo, withListening({ accepted: [heard] }), { publish: true });
      expect(res.issues).toEqual([]);
      const courseId = (await repo.findCourseBySlug(silentSlug))!;
      const skillId = (await repo.findSkill((await repo.findUnit(courseId, 1))!, 1))!;
      expect((await repo.publishedLesson(skillId, 1))?.version).toBe(3);
    });
  });
});
