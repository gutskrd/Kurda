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
import { Cache } from '../cache/cache.js';
import { createRedis } from '../cache/redis.js';
import { loadConfig } from '../config/env.js';
import { testBank, testStory } from '../test/stories.js';
import { StoryAdminService } from './admin-service.js';
import { STARTER_STORY_FILES, importStories, parseStoryFile, seedStarterStories } from './import.js';
import { runStoryImportCommand } from './import-cli.js';
import { StoriesService, bustStoryLists } from './service.js';

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
  let editorId = '';
  const s = Date.now().toString(36);
  const slug = (name: string) => `imp-${name}-${s}`;
  const row = async (sl: string) =>
    (await pool.query(`SELECT id, status, source, title, lock_version, length FROM stories WHERE slug = $1`, [sl])).rows[0];

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    dir = await mkdtemp(join(tmpdir(), 'hevalo-stories-'));
    const editor = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, roles) VALUES ($1, $2, '{content_editor}') RETURNING id`,
      [`imp_editor_${s}@it.kurda.app`, `imp_editor_${s}`],
    );
    editorId = editor.rows[0]!.id;
    // someone with an account who edits nothing
    await pool.query(`INSERT INTO users (email, username) VALUES ($1, $2)`, [`imp_learner_${s}@it.kurda.app`, `imp_learner_${s}`]);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM stories WHERE slug LIKE $1`, [`%-${s}`]);
    await pool.query(`DELETE FROM content_seeds WHERE name LIKE $1`, [`%-${s}`]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE id = $1 OR username = $2`, [editorId, `imp_learner_${s}`]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
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
      await admin.transition((await row(slug('review'))).id, 'submit', { adminId: null as never, lockVersion: 0 });
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

    it('never overwrites a draft someone changed in the admin panel, unless told to', async () => {
      const admin = new StoryAdminService(pool);
      await importStories(pool, { stories: [testStory(slug('corrected'))] }, { source: 'starter' });
      // a native speaker corrects the starter in the panel
      const imported = await row(slug('corrected'));
      await admin.update(imported.id, testStory(slug('corrected'), { title: 'Rastkirî' }) as never, imported.lock_version, { adminId: editorId });

      const file = { stories: [testStory(slug('corrected'), { title: 'Ji pelê' })] };
      const res = await importStories(pool, file);
      expect(res.stories).toEqual([
        { slug: slug('corrected'), outcome: 'kept', note: 'changed in the admin panel: not overwritten (--force replaces it)', published: false },
      ]);
      expect(await row(slug('corrected'))).toMatchObject({ title: 'Rastkirî', lock_version: 1 });
      // the file saying what the panel says changes nothing either way
      const same = await importStories(pool, { stories: [testStory(slug('corrected'), { title: 'Rastkirî' })] });
      expect(same.stories[0]!.outcome).toBe('unchanged');

      // --force: the file wins, and the importer is again the last to have written it
      const forced = await importStories(pool, file, { force: true });
      expect(forced.stories[0]!.outcome).toBe('updated');
      expect(await row(slug('corrected'))).toMatchObject({ title: 'Ji pelê', lock_version: 2 });
      const writer = await pool.query(`SELECT updated_by FROM stories WHERE slug = $1`, [slug('corrected')]);
      expect(writer.rows[0].updated_by).toBeNull();
      const next = await importStories(pool, { stories: [testStory(slug('corrected'), { title: 'Ji pelê, dîsa' })] });
      expect(next.stories[0]!.outcome).toBe('updated');
    });

    it('publishes with --publish, only what passes the whole check, as the editor it names, audited', async () => {
      await expect(importStories(pool, { stories: [testStory(slug('pub'))] }, { publish: true })).rejects.toThrow(/publishedBy/);

      const unfinished = await importStories(
        pool,
        { stories: [testStory(slug('pub'), { questions: testBank(3) })] },
        { publish: true, publishedBy: editorId },
      );
      expect(unfinished.ok).toBe(false);
      expect(unfinished.issues[0]!.path).toBe(`stories[0] (${slug('pub')}).questions`);
      expect(await row(slug('pub'))).toBeUndefined();

      const file = { stories: [testStory(slug('pub')), testStory(slug('a'), { title: 'Sernavê nû' })] };
      const dry = await importStories(pool, file, { publish: true, publishedBy: editorId, dryRun: true });
      expect(dry.stories.map((st) => st.published)).toEqual([true, true]);
      expect(await row(slug('pub'))).toBeUndefined();
      expect(await row(slug('a'))).toMatchObject({ status: 'draft' });

      const res = await importStories(pool, file, { publish: true, publishedBy: editorId });
      expect(res.stories).toEqual([
        { slug: slug('pub'), outcome: 'created', published: true },
        { slug: slug('a'), outcome: 'unchanged', published: true },
      ]);
      for (const sl of [slug('pub'), slug('a')]) {
        const published = await pool.query(`SELECT id, status, published_by, published_at FROM stories WHERE slug = $1`, [sl]);
        expect(published.rows[0]).toMatchObject({ status: 'published', published_by: editorId, published_at: expect.any(Date) });
        // audited as a publish in the panel is, with the story the editor put live
        const audit = await pool.query(`SELECT admin_id, action, reason, before, after FROM admin_audit_log WHERE target_id = $1`, [
          published.rows[0].id,
        ]);
        expect(audit.rows).toEqual([
          {
            admin_id: editorId,
            action: 'story.publish',
            reason: 'published by the stories:import command',
            before: expect.objectContaining({ status: 'draft' }),
            after: expect.objectContaining({ status: 'published', body: testStory('x').body, questions: expect.any(Array) }),
          },
        ]);
        expect(audit.rows[0].after.questions).toHaveLength(6);
      }
    });

    it.skipIf(!process.env.REDIS_URL)('takes a story it publishes into the hub at once', async () => {
      const redis = createRedis(loadConfig({ ...process.env, NODE_ENV: 'test' }));
      try {
        if (redis.status !== 'ready') await new Promise((ready) => redis.once('ready', ready));
        const cache = new Cache(redis);
        const hub = new StoriesService(pool, cache);
        const listed = async () => (await hub.list({ dialect: 'kurmanci', length: 'short', level: 3 })).map((st) => st.slug);
        await bustStoryLists(cache);
        expect(await listed()).not.toContain(slug('hub'));

        // published without the cache: the hub keeps the list it has (as the API would, for five minutes)
        await importStories(pool, { stories: [testStory(slug('hub-quiet'), { level: 3 })] }, { publish: true, publishedBy: editorId });
        expect(await listed()).not.toContain(slug('hub-quiet'));
        await importStories(pool, { stories: [testStory(slug('hub'), { level: 3 })] }, { publish: true, publishedBy: editorId, cache });
        expect(await listed()).toEqual(expect.arrayContaining([slug('hub'), slug('hub-quiet')]));
      } finally {
        redis.disconnect();
      }
    });
  });

  describe('the stories:import command', () => {
    // the command's environment as a shell gives it, without whatever npm set for the test run itself
    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('npm_'))),
      NODE_ENV: 'test',
    };
    const run = async (argv: string[], over: Record<string, string> = {}) => {
      const lines: string[] = [];
      const out = { log: (l: string) => void lines.push(l), warn: (l: string) => void lines.push(l), error: (l: string) => void lines.push(l) };
      const code = await runStoryImportCommand(argv, { ...env, ...over }, out);
      return { code, lines };
    };
    const storyFile = async (name: string, stories: unknown[]): Promise<string> => {
      const path = join(dir, name);
      await writeFile(path, JSON.stringify({ stories }));
      return path;
    };

    it('publishes as the editor --by names, and only as one who may', async () => {
      const path = await storyFile('cmd.json', [testStory(slug('cmd'))]);
      for (const by of ['nobody@it.kurda.app', `imp_learner_${s}@it.kurda.app`]) {
        const refused = await run([path, '--publish', '--by', by]);
        expect(refused.code).toBe(1);
        expect(refused.lines[0]).toBe(`✗ no editor who may publish stories has the address ${by}; nothing imported`);
      }
      expect(await row(slug('cmd'))).toBeUndefined();

      const editorEmail = `IMP_EDITOR_${s}@it.kurda.app`;
      const done = await run([path, '--publish', '--by', editorEmail]);
      expect(done.code, done.lines.join('\n')).toBe(0);
      expect(done.lines).toContain(`  ${slug('cmd')}: created, published by ${editorEmail}`);
      const published = await pool.query(`SELECT status, published_by FROM stories WHERE slug = $1`, [slug('cmd')]);
      expect(published.rows[0]).toEqual({ status: 'published', published_by: editorId });
    });

    it('refuses a command line it does not understand, writing nothing', async () => {
      const path = await storyFile('odd.json', [testStory(slug('odd'))]);
      const res = await run([path, '--dryrun']);
      expect(res).toEqual({ code: 2, lines: ['unknown option --dryrun', expect.stringMatching(/^usage: npm run stories:import/)] });
      expect((await run([join(dir, 'missing.json')])).code).toBe(1);
      expect(await row(slug('odd'))).toBeUndefined();
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
