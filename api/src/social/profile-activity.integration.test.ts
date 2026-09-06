/** Profile activity against real Postgres: what shows, and who may see it. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { resolveSections } from './profile-activity.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe('resolveSections', () => {
  it('shows every section when nothing has been chosen', () => {
    // an existing account should not need a backfill to look normal
    expect(resolveSections({})).toEqual({ posts: true, games: true, likes: true, saved: true });
    expect(resolveSections(null)).toEqual({ posts: true, games: true, likes: true, saved: true });
  });

  it('honours an explicit false and nothing else', () => {
    expect(resolveSections({ likes: false })).toMatchObject({ likes: false, posts: true });
  });

  it('ignores junk in the bag rather than trusting it', () => {
    expect(resolveSections({ likes: 'no', nonsense: true })).toMatchObject({ likes: true, posts: true });
  });
});

describe.skipIf(!DATABASE_URL)('profile activity (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  async function register(tag: string, ip: string): Promise<void> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `act_${tag}_${suffix}@it.kurda.app`,
        username: `act_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    ids[tag] = res.json().user.id;
    tokens[tag] = res.json().tokens.accessToken;
  }

  const call = (method: 'GET' | 'PATCH' | 'PUT', url: string, token: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
      remoteAddress: '10.66.3.3',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await register('owner', '10.66.0.1');
    await register('viewer', '10.66.0.2');

    // one published story and one poem
    for (const [type, title] of [['story', `Story ${suffix}`], ['poem', `Poem ${suffix}`]] as const) {
      await pool.query(
        `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
         VALUES ($1, 'user', $2, $3, 'Some words to read.', 'kmr', 'published', now())`,
        [ids.owner!, type, title],
      );
    }
    // a finished solo game of each kind the feed reads
    await pool.query(
      `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length, status, finished_at)
       VALUES ($1, 'practice', 'easy', 1, 'welat', 5, 'won', now())`,
      [ids.owner!],
    );
    await pool.query(
      `INSERT INTO rhyme_games (user_id, mode, dialect, prompt, window_ms, score, status, ended_at)
       VALUES ($1, 'training', 'kurmanci', 'gul', 60000, 42, 'ended', now())`,
      [ids.owner!],
    );
  });

  afterAll(async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL kurda.ledger_admin = 'on'`);
      await client.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    await pool.end();
    await app.close();
  });

  it('lists everything the owner has posted in one section', async () => {
    // stories and poems were separate tabs; they are one Posts list now, the
    // same way the community wall stopped being three pages
    const res = await call('GET', `/users/${ids.owner}/activity?kind=posts`, tokens.viewer!);
    expect(res.statusCode).toBe(200);

    const titles = res.json().entries.map((e: { title: string }) => e.title);
    expect(titles).toContain(`Story ${suffix}`);
    expect(titles).toContain(`Poem ${suffix}`);
    // and every entry says which section it belongs to
    expect(res.json().entries.every((e: { kind: string }) => e.kind === 'posts')).toBe(true);
  });

  it('interleaves finished games from every mode, newest first', async () => {
    const res = await call('GET', `/users/${ids.owner}/activity?kind=games`, tokens.viewer!);
    const titles = res.json().entries.map((e: { title: string }) => e.title);
    expect(titles).toContain('Wordle');
    expect(titles).toContain('Rhyming Words');
    const times = res.json().entries.map((e: { at: string }) => new Date(e.at).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('leaves an unfinished game out — it is not a result yet', async () => {
    await pool.query(
      `INSERT INTO wordle_games (user_id, mode, difficulty, day_index, target, target_length, status)
       VALUES ($1, 'practice', 'hard', 2, 'berxwedan', 9, 'playing')`,
      [ids.owner!],
    );
    const res = await call('GET', `/users/${ids.owner}/activity?kind=games&limit=50`, tokens.viewer!);
    const details = res.json().entries.map((e: { detail: string | null }) => e.detail ?? '');
    expect(details.some((d: string) => d.includes('hard'))).toBe(false);
  });

  it('the profile says which sections it shows', async () => {
    const res = await call('GET', `/users/${ids.owner}`, tokens.viewer!);
    expect(res.json().sections).toEqual({ posts: true, games: true, likes: true, saved: true });
  });

  it('a hidden section returns nothing, and says nothing about being hidden', async () => {
    expect((await call('PATCH', '/me/profile/sections', tokens.owner!, { posts: false })).statusCode).toBe(200);

    const res = await call('GET', `/users/${ids.owner}/activity?kind=posts`, tokens.viewer!);
    // an empty list, not an error: a viewer should not be able to tell a hidden
    // section from one that simply has nothing in it
    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toEqual([]);

    // …but the person who wrote them still sees their own
    const own = await call('GET', `/users/${ids.owner}/activity?kind=posts`, tokens.owner!);
    expect(own.json().entries.length).toBeGreaterThan(0);

    // and the profile stops advertising the tab
    expect((await call('GET', `/users/${ids.owner}`, tokens.viewer!)).json().sections.posts).toBe(false);
    // turning it back on restores it
    await call('PATCH', '/me/profile/sections', tokens.owner!, { posts: true });
    expect((await call('GET', `/users/${ids.owner}/activity?kind=posts`, tokens.viewer!)).json().entries.length)
      .toBeGreaterThan(0);
  });

  it('one toggle does not reset the others', async () => {
    await call('PATCH', '/me/profile/sections', tokens.owner!, { saved: false });
    const res = await call('PATCH', '/me/profile/sections', tokens.owner!, { games: false });
    expect(res.json().sections).toMatchObject({ saved: false, games: false, posts: true });
    await call('PATCH', '/me/profile/sections', tokens.owner!, { saved: true, games: true });
  });

  it('a private profile has no public activity either', async () => {
    await call('PUT', '/me/privacy', tokens.owner!, { visibility: 'nobody' });
    const res = await call('GET', `/users/${ids.owner}/activity?kind=posts`, tokens.viewer!);
    expect(res.json().entries).toEqual([]);
    // …but the owner still sees their own
    const own = await call('GET', `/users/${ids.owner}/activity?kind=posts`, tokens.owner!);
    expect(own.json().entries.length).toBeGreaterThan(0);
    await call('PUT', '/me/privacy', tokens.owner!, { visibility: 'everyone' });
  });

  it('rejects a section it does not have', async () => {
    const res = await call('GET', `/users/${ids.owner}/activity?kind=secrets`, tokens.viewer!);
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('BAD_SECTION');
  });
});
