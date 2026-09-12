/**
 * An unconfirmed account cannot do anything, against real Postgres.
 *
 * The web app has always redirected an unverified account to the verify screen,
 * and a redirect is not a rule. The server never looked at `email_verified_at`,
 * so a token from a fresh signup could post, like, message and buy. This is the
 * half that holds when somebody talks to the API directly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('account activation (integration)', () => {
  const config = loadConfig({ ...process.env, DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let unverified = '';
  let verified = '';
  let postId = '';

  async function register(tag: string, ip: string): Promise<{ id: string; token: string }> {
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
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      payload: payload as object,
      remoteAddress: '10.88.4.4',
    });

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });

    unverified = (await register('cold', '10.88.0.1')).token;

    const warm = await register('warm', '10.88.0.2');
    verified = warm.token;
    await pool.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [warm.id]);

    // something to act on
    const post = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at)
       VALUES ($1, 'user', 'gotin', $2, 'Words.', 'kmr', 'published', now()) RETURNING id`,
      [warm.id, `Act ${suffix}`],
    );
    postId = post.rows[0]!.id;
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

  it('refuses everything that writes', async () => {
    // registering and then posting used to be two requests and no confirmation
    const cases: Array<[Parameters<typeof call>[0], string, unknown?]> = [
      ['POST', '/library/posts', { type: 'gotin', title: 'Snuck in', body: 'Not confirmed.' }],
      ['POST', `/posts/library/${postId}/like`],
      ['POST', `/posts/library/${postId}/repost`],
      ['PATCH', '/me/profile/sections', { posts: false }],
    ];
    for (const [method, url, payload] of cases) {
      const res = await call(method, url, unverified, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json().code, `${method} ${url}`).toBe('ACCOUNT_NOT_ACTIVATED');
    }
  });

  it('leaves reading alone, because a guest can read without an account at all', async () => {
    expect((await call('GET', '/feed?limit=1', unverified)).statusCode).toBe(200);
    expect((await call('GET', '/library/posts?limit=1', unverified)).statusCode).toBe(200);
  });

  it('keeps open the things you need to get through the gate, or to leave', async () => {
    // asking for another code, and presence while you sit on the verify screen
    expect((await call('POST', '/auth/resend-verification-code', unverified)).statusCode).toBe(200);
    expect((await call('POST', '/me/heartbeat', unverified)).statusCode).toBe(200);
    // and signing out everywhere — being unverified must not trap an account
    expect((await call('DELETE', '/me/sessions', unverified)).statusCode).toBe(200);
  });

  it('does not stand in a confirmed account’s way', async () => {
    const liked = await call('POST', `/posts/library/${postId}/like`, verified);
    expect(liked.statusCode).toBe(200);
    expect(liked.json().engagement.liked).toBe(true);
  });

  it('lets an account through the moment it confirms', async () => {
    const fresh = await register('later', '10.88.0.3');
    expect((await call('POST', `/posts/library/${postId}/like`, fresh.token)).statusCode).toBe(403);

    await pool.query(`UPDATE users SET email_verified_at = now() WHERE id = $1`, [fresh.id]);

    // no new token needed: the guard reads the row on every request, so
    // confirming takes effect on the very next call
    expect((await call('POST', `/posts/library/${postId}/like`, fresh.token)).statusCode).toBe(200);
  });
});
