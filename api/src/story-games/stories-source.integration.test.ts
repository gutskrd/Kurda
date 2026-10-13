/**
 * The stand-in for API-stories' StoriesService, against real Postgres. It has
 * to behave as that service does — the same two methods, the same answers,
 * the same lock — so the games' suites test what will run after the merge.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { deleteStories, insertStory } from '../test/story-fixtures.js';
import { LocalStoryCatalog } from './stories-source.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('the stories as story games read them (integration)', () => {
  let pool: pg.Pool;
  let catalog: LocalStoryCatalog;
  const suffix = Date.now().toString(36);
  const storyIds: string[] = [];
  const userIds: string[] = [];
  let n = 0;

  const story = async (opts: Partial<Parameters<typeof insertStory>[1]> = {}) => {
    const s = await insertStory(pool, { slug: `sgs-${++n}-${suffix}`, ...opts });
    storyIds.push(s.id);
    return s;
  };

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    catalog = new LocalStoryCatalog(pool);
  });

  afterAll(async () => {
    await deleteStories(pool, storyIds);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
    await pool.end();
  });

  it('gives a published story with its whole bank in authoring order, and nothing else', async () => {
    const s = await story({ questions: 7 });
    const got = await catalog.getPublishedForGame(s.id);
    expect(got).toMatchObject({ id: s.id, slug: s.slug, title: s.title, summary: 'Rojek li bazarê.', length: 'short' });
    expect(got!.questions.map((q) => q.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(got!.questions[0]).toMatchObject({ kind: 'gist', correctIndex: 0, options: ['rast 0', 'şaş 0 a', 'şaş 0 b'] });

    const draft = await story({ status: 'draft' });
    expect(await catalog.getPublishedForGame(draft.id)).toBeNull();
    expect(await catalog.getPublishedForGame('not-a-uuid')).toBeNull();
  });

  it('picks a random published story of the kind asked, the ones a person has finished last', async () => {
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (email, username, birth_year, birth_month) VALUES ($1, $2, 1990, 6) RETURNING id`,
      [`sgs_${suffix}@it.kurda.app`, `sgs_${suffix}`.slice(0, 30)],
    );
    const me = user.rows[0]!.id;
    userIds.push(me);
    const seen = await story({ length: 'medium', level: 3 });
    await story({ length: 'medium', level: 3 });
    await story({ length: 'medium', level: 3, status: 'draft' });
    await pool.query(`INSERT INTO story_completions (user_id, story_id) VALUES ($1, $2)`, [me, seen.id]);
    // (another suite's story of this kind may come up too — never the finished one while others exist)
    for (let i = 0; i < 6; i++) {
      const picked = await catalog.pickRandomPublished({ dialect: 'kurmanci', length: 'medium', level: 3, preferNotCompletedBy: me });
      expect(picked).not.toBeNull();
      expect(picked!.id).not.toBe(seen.id);
      expect(picked).toMatchObject({ dialect: 'kurmanci', length: 'medium', level: 3 });
      expect(picked!.questions.length).toBeGreaterThan(0);
    }
    // without anyone to prefer for, or with something that is not a user id, any of them
    expect(await catalog.pickRandomPublished({ dialect: 'kurmanci', length: 'medium', level: 3 })).not.toBeNull();
    expect(
      await catalog.pickRandomPublished({ dialect: 'kurmanci', length: 'medium', level: 3, preferNotCompletedBy: 'x' }),
    ).not.toBeNull();
    // none of that kind
    expect(await catalog.pickRandomPublished({ dialect: 'sorani', length: 'long', level: 3 })).toBeNull();
  });

  it('inside a transaction, keeps the story from being unpublished until it ends', async () => {
    const s = await story();
    const game = await pool.connect();
    const admin = await pool.connect();
    try {
      await game.query('BEGIN');
      expect(await catalog.getPublishedForGame(s.id, game)).not.toBeNull();
      await admin.query('BEGIN');
      await admin.query(`SET LOCAL lock_timeout = '200ms'`);
      await expect(admin.query(`UPDATE stories SET status = 'draft' WHERE id = $1`, [s.id])).rejects.toMatchObject({
        code: '55P03',
      });
      await admin.query('ROLLBACK');
      await game.query('COMMIT');
      // read on the pool, nothing is held after the query
      expect(await catalog.getPublishedForGame(s.id)).not.toBeNull();
      await pool.query(`UPDATE stories SET status = 'draft' WHERE id = $1`, [s.id]);
      expect(await catalog.getPublishedForGame(s.id)).toBeNull();
    } finally {
      await game.query('ROLLBACK').catch(() => undefined);
      await admin.query('ROLLBACK').catch(() => undefined);
      game.release();
      admin.release();
    }
  });
});
