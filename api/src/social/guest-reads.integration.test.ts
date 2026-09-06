/** What someone without an account can read, against real Postgres. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('reading without an account (integration)', () => {
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
        email: `guest_${tag}_${suffix}@it.kurda.app`,
        username: `guest_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
      },
      remoteAddress: ip,
    });
    ids[tag] = res.json().user.id;
    tokens[tag] = res.json().tokens.accessToken;
  }

  /** No authorization header at all — a stranger off the internet. */
  const guest = (url: string) => app.inject({ method: 'GET', url, remoteAddress: '10.95.1.1' });
  const asMember = (method: 'GET' | 'PUT' | 'POST', url: string, token: string, payload?: unknown) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object, remoteAddress: '10.95.1.1' });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    await register('open', '10.95.0.1');
    await register('shy', '10.95.0.2');
    await register('memb', '10.95.0.3');
    await register('nosy', '10.95.0.4');

    // 'everyone' now means the public web, and you have to ask for it: accounts
    // are created 'members', which is signed-in readers only
    await asMember('PUT', '/me/privacy', tokens.open!, { visibility: 'everyone' });

    await pool.query(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
       VALUES ($1, 'user', 'story', $2, 'Peyvên xweş.', 'kmr', 'published', now())`,
      [ids.open!, `Story ${suffix}`],
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

  it('reads the community wall', async () => {
    const res = await guest('/feed?limit=50');
    expect(res.statusCode).toBe(200);
    expect(res.json().items.some((i: { title: string }) => i.title === `Story ${suffix}`)).toBe(true);
  });

  it('reads a profile, because the bylines on that wall lead somewhere', async () => {
    const res = await guest(`/users/${ids.open}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().username).toBe(`guest_open_${suffix}`.slice(0, 30));
    // a stranger is nobody's friend, and the profile says so rather than
    // claiming a relationship
    expect(res.json().friendStatus).toBe('none');
  });

  it('is told nothing by a profile that is not public', async () => {
    expect((await asMember('PUT', '/me/privacy', tokens.shy!, { visibility: 'friends' })).statusCode).toBe(200);

    const res = await guest(`/users/${ids.shy}`);
    // the same treatment any other non-friend gets: identity, and nothing else
    expect(res.statusCode).toBe(200);
    expect(res.json().private).toBe(true);
    expect(res.json().bio ?? null).toBeNull();
  });

  it('is told nothing by a members-only profile, though members are', async () => {
    // the default, so 'memb' has chosen nothing — this is what you get for free
    const asGuest = await guest(`/users/${ids.memb}`);
    expect(asGuest.statusCode).toBe(200);
    expect(asGuest.json().username).toBe(`guest_memb_${suffix}`.slice(0, 30));
    expect(asGuest.json().private).toBe(true);

    // a signed-in stranger, no friendship between them, sees the whole thing
    const asStranger = await asMember('GET', `/users/${ids.memb}`, tokens.nosy!);
    expect(asStranger.statusCode).toBe(200);
    expect(asStranger.json().private).toBe(false);
    expect(asStranger.json().friendStatus).toBe('none');
  });

  it('accepts every rung of the ladder and nothing else', async () => {
    for (const visibility of ['everyone', 'members', 'friends', 'nobody']) {
      const res = await asMember('PUT', '/me/privacy', tokens.nosy!, { visibility });
      expect(res.statusCode, visibility).toBe(200);
    }
    expect((await asMember('PUT', '/me/privacy', tokens.nosy!, { visibility: 'public' })).statusCode).toBe(400);
  });

  it('gets no activity from a profile that is not public', async () => {
    const res = await guest(`/users/${ids.shy}/activity?kind=posts`);
    expect(res.statusCode).toBe(200);
    expect(res.json().entries).toEqual([]);
  });

  it('reads what a public profile has posted', async () => {
    const res = await guest(`/users/${ids.open}/activity?kind=posts`);
    expect(res.statusCode).toBe(200);
    expect(res.json().entries.map((e: { title: string }) => e.title)).toContain(`Story ${suffix}`);
  });

  it('reads the global leaderboard, with no place of its own on it', async () => {
    const res = await guest('/leaderboards/rating');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().top)).toBe(true);
    // "me" is a question about a person, and there is no person here
    expect(res.json().me).toBeNull();
  });

  it('gets an empty board for the scopes that are about a person', async () => {
    for (const scope of ['friends', 'country']) {
      const res = await guest(`/leaderboards/rating?scope=${scope}`);
      // an empty board rather than a wrong one, and never someone else's
      expect(res.statusCode, scope).toBe(200);
      expect(res.json().top, scope).toEqual([]);
      expect(res.json().me, scope).toBeNull();
    }
  });

  it('still cannot do anything', async () => {
    /*
     * The bodies are well-formed on purpose. Fastify validates a request body
     * before it runs `requireAuth` (a preHandler), so a malformed one comes back
     * 400 and would prove nothing about whether the endpoint is guarded.
     */
    const forbidden: Array<[string, string, unknown]> = [
      ['POST', '/library/posts', { type: 'gotin', body: 'hello' }],
      ['POST', '/images', { imageMediaId: 'media/x.webp' }],
      ['GET', '/me/saved', undefined],
      ['GET', '/me/social', undefined],
      ['GET', '/friends', undefined],
      ['POST', '/friends/requests', { userId: ids.open }],
      ['GET', '/me/notifications', undefined],
      ['PUT', '/me/privacy', { visibility: 'nobody' }],
    ];
    for (const [method, url, payload] of forbidden) {
      const res = await app.inject({
        method: method as 'GET' | 'POST' | 'PUT',
        url,
        payload: payload as object,
        remoteAddress: '10.95.1.1',
      });
      // reading is open; everything that changes something, or is about a
      // particular person, is not
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('cannot like or save a post it can see', async () => {
    const post = (await guest('/feed?limit=50')).json().items[0] as { targetType: string; id: string };
    for (const kind of ['like', 'bookmark']) {
      const res = await app.inject({
        method: 'POST',
        url: `/posts/${post.targetType}/${post.id}/${kind}`,
        remoteAddress: '10.95.1.1',
      });
      expect(res.statusCode, kind).toBe(401);
    }
  });
});
