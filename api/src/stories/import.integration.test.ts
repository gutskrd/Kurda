/**
 * Stories from files, against real Postgres: the import command's rules (all
 * or nothing, by slug, never over a story people are looking at), and the
 * starter stories the API seeds by itself — once each, as drafts, without
 * ever stopping the API from starting.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { validateStory } from '@kurda/shared';
import { testBank, testStory } from '../test/stories.js';
import { StoryAdminService } from './admin-service.js';
import { STARTER_STORY_FILES, importStories, parseStoryFile, seedStarterStories } from './import.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe('the starter story files', () => {
  it('hold stories every one of which can be saved as a draft, under slugs used once', async () => {
    const slugs = new Set<string>();
    for (const file of STARTER_STORY_FILES) {
      const parsed = parseStoryFile(JSON.parse(await readFile(file, 'utf8')), 'draft');
      expect(parsed.issues).toEqual([]);
      expect(parsed.drafts.length).toBeGreaterThanOrEqual(8);
      for (const draft of parsed.drafts) {
        expect(slugs.has(draft.slug)).toBe(false);
        slugs.add(draft.slug);
        expect(validateStory(draft, 'draft').errors).toEqual([]);
      }
    }
    expect([...slugs].some((sl) => sl.startsWith('kmr-'))).toBe(true);
    expect([...slugs].some((sl) => sl.startsWith('ckb-'))).toBe(true);
  });
});

describe.skipIf(!DATABASE_URL)('story import (integration)', () => {
  let pool: pg.Pool;
  let dir = '';
  const s = Date.now().toString(36);
  const slug = (name: string) => `imp-${name}-${s}`;
  const row = async (sl: string) =>
    (await pool.query(`SELECT id, status, source, title, lock_version, length FROM stories WHERE slug = $1`, [sl])).rows[0];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    dir = await mkdtemp(join(tmpdir(), 'hevalo-stories-'));
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM stories WHERE slug LIKE $1`, [`%-${s}`]);
    await pool.query(`DELETE FROM content_seeds WHERE name LIKE $1`, [`%-${s}`]);
    await rm(dir, { recursive: true, force: true });
    await pool.end();
  });

  describe('importStories', () => {
    it('imports nothing when anything is wrong, and says where', async () => {
      const broken = testStory(slug('broken'));
      broken.questions[0]!.correctIndex = 7;
      const res = await importStories(pool, { stories: [testStory(slug('fine')), broken] });
      expect(res.ok).toBe(false);
      expect(res.issues).toEqual([{ path: `stories[1] (${slug('broken')}).questions[0].correctIndex`, message: 'mark which option is right' }]);
      expect(await row(slug('fine'))).toBeUndefined();

      const shape = await importStories(pool, { stories: [{ slug: 'Bad Slug', dialect: 'kurmanci' }] });
      expect(shape.ok).toBe(false);
      expect(shape.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['stories.0.slug', 'stories.0.level', 'stories.0.title']));

      const twice = await importStories(pool, { stories: [testStory(slug('twice')), testStory(slug('twice'))] });
      expect(twice.issues).toEqual([{ path: `stories[1] (${slug('twice')}).slug`, message: 'another story in this file has the same slug' }]);
    });

    it('reports a dry run exactly, and writes nothing', async () => {
      const res = await importStories(pool, { stories: [testStory(slug('dry'))] }, { dryRun: true });
      expect(res).toMatchObject({ ok: true, dryRun: true, stories: [{ slug: slug('dry'), outcome: 'created', published: false }] });
      expect(await row(slug('dry'))).toBeUndefined();
    });

    it('creates drafts, leaves unchanged ones alone, and updates a draft whose content changed', async () => {
      const file = { stories: [testStory(slug('a')), testStory(slug('b'), { questions: testBank(3) })] };
      const first = await importStories(pool, file, { source: 'starter' });
      expect(first.ok).toBe(true);
      // a draft may be unfinished: three questions is a warning, not a refusal
      expect(first.warnings.some((w) => w.path === `stories[1] (${slug('b')}).questions`)).toBe(true);
      expect(first.stories.map((st) => st.outcome)).toEqual(['created', 'created']);
      expect(await row(slug('a'))).toMatchObject({ status: 'draft', source: 'starter', length: 'short', lock_version: 0 });

      const again = await importStories(pool, file);
      expect(again.stories.map((st) => st.outcome)).toEqual(['unchanged', 'unchanged']);
      expect((await row(slug('a'))).lock_version).toBe(0);

      const changed = { stories: [testStory(slug('a'), { title: 'Sernavê nû' }), file.stories[1]!] };
      const third = await importStories(pool, changed);
      expect(third.stories.map((st) => st.outcome)).toEqual(['updated', 'unchanged']);
      // an editor with the old version open has to reload before saving over it
      expect(await row(slug('a'))).toMatchObject({ title: 'Sernavê nû', lock_version: 1, source: 'starter' });
    });

    it('never overwrites a story in review, published or archived', async () => {
      const admin = new StoryAdminService(pool);
      await importStories(pool, { stories: [testStory(slug('review')), testStory(slug('live')), testStory(slug('old'))] });
      await admin.transition((await row(slug('review'))).id, 'submit', { adminId: null as never });
      await pool.query(`UPDATE stories SET status = 'published', published_at = now() WHERE slug = $1`, [slug('live')]);
      await pool.query(`UPDATE stories SET status = 'archived' WHERE slug = $1`, [slug('old')]);

      const res = await importStories(pool, {
        stories: [slug('review'), slug('live'), slug('old')].map((sl) => testStory(sl, { title: 'Ji pelê' })),
      });
      expect(res.stories).toEqual([
        { slug: slug('review'), outcome: 'kept', note: 'in review: not overwritten', published: false },
        { slug: slug('live'), outcome: 'kept', note: 'published: not overwritten', published: false },
        { slug: slug('old'), outcome: 'kept', note: 'archived: not overwritten', published: false },
      ]);
      for (const sl of [slug('review'), slug('live'), slug('old')]) expect((await row(sl)).title).toBe(`Çîrok ${sl}`);
    });

    it('publishes with --publish, only what passes the whole check', async () => {
      const unfinished = await importStories(pool, { stories: [testStory(slug('pub'), { questions: testBank(3) })] }, { publish: true });
      expect(unfinished.ok).toBe(false);
      expect(unfinished.issues[0]!.path).toBe(`stories[0] (${slug('pub')}).questions`);
      expect(await row(slug('pub'))).toBeUndefined();

      const res = await importStories(pool, { stories: [testStory(slug('pub')), testStory(slug('a'), { title: 'Sernavê nû' })] }, { publish: true });
      expect(res.stories).toEqual([
        { slug: slug('pub'), outcome: 'created', published: true },
        { slug: slug('a'), outcome: 'unchanged', published: true },
      ]);
      expect(await row(slug('pub'))).toMatchObject({ status: 'published' });
      expect(await row(slug('a'))).toMatchObject({ status: 'published' });
    });
  });

  describe('seedStarterStories', () => {
    const logs: Array<{ level: string; msg: string; obj: Record<string, unknown> }> = [];
    const log = {
      info: (obj: Record<string, unknown>, msg: string) => void logs.push({ level: 'info', msg, obj }),
      warn: (obj: Record<string, unknown>, msg: string) => void logs.push({ level: 'warn', msg, obj }),
    } as never;
    const file = async (name: string, content: unknown): Promise<URL> => {
      const path = join(dir, name);
      await writeFile(path, typeof content === 'string' ? content : JSON.stringify(content));
      return pathToFileURL(path);
    };

    it('seeds each starter once, as a draft from Claude, and never again once it is gone', async () => {
      const files = [
        await file('one.json', { stories: [testStory(slug('seed-a')), testStory(slug('seed-b'))] }),
        await file('two.json', { stories: [testStory(slug('seed-c'), { dialect: 'sorani' })] }),
      ];
      const first = await seedStarterStories(pool, log, files);
      expect(first.seeded).toEqual([slug('seed-a'), slug('seed-b'), slug('seed-c')]);
      expect(await row(slug('seed-a'))).toMatchObject({ status: 'draft', source: 'starter' });
      expect(await row(slug('seed-c'))).toMatchObject({ status: 'draft', source: 'starter', length: 'short' });
      const questions = await pool.query(`SELECT count(*)::int n FROM story_questions WHERE story_id = $1`, [(await row(slug('seed-a'))).id]);
      expect(questions.rows[0].n).toBe(6);
      const markers = await pool.query(`SELECT name FROM content_seeds WHERE name LIKE $1 ORDER BY name`, [`%seed-%-${s}`]);
      expect(markers.rows.map((r) => r.name)).toEqual(
        [slug('seed-a'), slug('seed-b'), slug('seed-c')].map((sl) => `stories:starter:${sl}`),
      );

      // the next start: nothing to do
      expect((await seedStarterStories(pool, log, files)).seeded).toEqual([]);

      // an editor deletes one and archives another: they stay that way
      await pool.query(`DELETE FROM stories WHERE slug = $1`, [slug('seed-a')]);
      await pool.query(`UPDATE stories SET status = 'archived' WHERE slug = $1`, [slug('seed-b')]);
      expect((await seedStarterStories(pool, log, files)).seeded).toEqual([]);
      expect(await row(slug('seed-a'))).toBeUndefined();
      expect((await row(slug('seed-b'))).status).toBe('archived');

      // a starter added to a file later still arrives
      files.push(await file('three.json', { stories: [testStory(slug('seed-d'))] }));
      expect((await seedStarterStories(pool, log, files)).seeded).toEqual([slug('seed-d')]);
    });

    it('leaves a slug an editor already used alone, and marks it done', async () => {
      await importStories(pool, { stories: [testStory(slug('seed-mine'), { title: 'Ya min' })] });
      const res = await seedStarterStories(pool, log, [await file('mine.json', { stories: [testStory(slug('seed-mine'))] })]);
      expect(res.seeded).toEqual([]);
      expect(await row(slug('seed-mine'))).toMatchObject({ title: 'Ya min', source: 'admin' });
      const marker = await pool.query(`SELECT 1 FROM content_seeds WHERE name = $1`, [`stories:starter:${slug('seed-mine')}`]);
      expect(marker.rowCount).toBe(1);
    });

    it('skips a broken story until it is fixed, and never throws', async () => {
      const broken = testStory(slug('seed-broken'));
      broken.questions[0]!.options = ['tenê yek'];
      const files = [await file('broken.json', { stories: [broken, testStory(slug('seed-ok'))] })];
      logs.length = 0;
      expect((await seedStarterStories(pool, log, files)).seeded).toEqual([slug('seed-ok')]);
      expect(await row(slug('seed-broken'))).toBeUndefined();
      expect(logs.find((l) => l.level === 'warn')).toMatchObject({
        msg: 'starter story has errors; not seeded until they are fixed',
        obj: { slug: slug('seed-broken') },
      });

      // fixed in the next release: it arrives
      const fixed = [await file('broken.json', { stories: [testStory(slug('seed-broken')), testStory(slug('seed-ok'))] })];
      expect((await seedStarterStories(pool, log, fixed)).seeded).toEqual([slug('seed-broken')]);

      // unreadable files and a database that refuses are logged, not thrown
      logs.length = 0;
      const garbage = [await file('garbage.json', '{ not json'), await file('wrong.json', { stories: 'no' }), pathToFileURL(join(dir, 'missing.json'))];
      await expect(seedStarterStories(pool, log, garbage)).resolves.toEqual({ seeded: [] });
      expect(logs.filter((l) => l.level === 'warn')).toHaveLength(3);

      const closed = new pg.Pool({ connectionString: DATABASE_URL });
      await closed.end();
      logs.length = 0;
      await expect(seedStarterStories(closed, log, [await file('late.json', { stories: [testStory(slug('seed-late'))] })])).resolves.toEqual({
        seeded: [],
      });
      expect(logs.some((l) => l.level === 'warn')).toBe(true);
    });

    it('lets two instances starting together seed each story once', async () => {
      const files = [await file('race.json', { stories: [testStory(slug('seed-r1')), testStory(slug('seed-r2'))] })];
      const other = new pg.Pool({ connectionString: DATABASE_URL });
      try {
        const [a, b] = await Promise.all([seedStarterStories(pool, log, files), seedStarterStories(other, log, files)]);
        expect([...a.seeded, ...b.seeded].sort()).toEqual([slug('seed-r1'), slug('seed-r2')]);
      } finally {
        await other.end();
      }
      const n = await pool.query(`SELECT count(*)::int n FROM story_questions q JOIN stories s ON s.id = q.story_id WHERE s.slug = $1`, [
        slug('seed-r1'),
      ]);
      expect(n.rows[0].n).toBe(6);
    });
  });
});
