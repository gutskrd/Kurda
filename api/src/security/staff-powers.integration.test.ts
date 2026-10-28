/**
 * A staff power outside the console asks what the console asks (integration).
 *
 * Posts, pictures and their comments are edited and taken down through the
 * routes every member uses, which let a staff role act on anybody's. Those
 * routes ask for no role, so the console's gate (admin/admin-gate.ts) never
 * saw them, and a staff password alone, with no code from the second step,
 * could rewrite or remove any member's post. A staff account now acts on
 * somebody else's only from a session that has entered its code; until then
 * it is what any member is, the author of its own and of nothing else.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { pass2fa } from '../test/admin-2fa.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('staff powers over the content of others (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const s = Date.now().toString(36);
  const ids: string[] = [];
  let staff = { id: '', token: '' };
  let member = { id: '', token: '' };

  async function register(name: string, address: string): Promise<{ id: string; token: string }> {
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
      remoteAddress: address,
    });
    await activate(app, pool, res);
    const id = res.json().user.id as string;
    ids.push(id);
    return { id, token: res.json().tokens.accessToken as string };
  }

  const call = (token: string, method: 'PATCH' | 'POST' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}), remoteAddress: '10.186.0.9' });

  /** One of each: a post, a comment on it, a picture and a comment on that, all the member's. */
  async function memberContent(): Promise<{ post: string; comment: string; picture: string; caption: string }> {
    const one = async (sql: string, params: unknown[]) => (await pool.query<{ id: string }>(sql, params)).rows[0]!.id;
    const post = await one(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, status, published_at)
       VALUES ($1, 'user', 'story', 'Çîroka min', 'Rojek ji rojan', 'published', now()) RETURNING id`,
      [member.id],
    );
    const comment = await one(`INSERT INTO library_comments (post_id, author_id, author_role, body) VALUES ($1, $2, 'user', 'Pir xweş e') RETURNING id`, [
      post,
      member.id,
    ]);
    const picture = await one(
      `INSERT INTO image_posts (author_id, author_role, image_media_id, caption) VALUES ($1, 'user', 'images/staff-test.png', 'Wêneyê min') RETURNING id`,
      [member.id],
    );
    const caption = await one(`INSERT INTO image_comments (post_id, author_id, author_role, body) VALUES ($1, $2, 'user', 'Bedew e') RETURNING id`, [
      picture,
      member.id,
    ]);
    return { post, comment, picture, caption };
  }

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    member = await register('spmember', '10.186.0.1');
    staff = await register('spstaff', '10.186.0.2');
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [staff.id]);
  });

  afterAll(async () => {
    if (ids.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [ids]);
    await pool.end();
    await app.close();
  });

  it('refuses a staff password alone on the posts, pictures and comments of a member', async () => {
    const c = await memberContent();
    const refused = [
      await call(staff.token, 'PATCH', `/library/posts/${c.post}`, { language: 'ckb' }),
      await call(staff.token, 'POST', `/library/posts/${c.post}/unpublish`),
      await call(staff.token, 'DELETE', `/library/posts/${c.post}`),
      await call(staff.token, 'PATCH', `/library/comments/${c.comment}`, { body: 'Nivîsa nû' }),
      await call(staff.token, 'DELETE', `/library/comments/${c.comment}`),
      await call(staff.token, 'PATCH', `/images/${c.picture}`, { caption: 'Nivîsa nû' }),
      await call(staff.token, 'DELETE', `/images/${c.picture}`),
      await call(staff.token, 'PATCH', `/images/comments/${c.caption}`, { body: 'Nivîsa nû' }),
      await call(staff.token, 'DELETE', `/images/comments/${c.caption}`),
    ];
    expect(refused.map((r) => r.statusCode)).toEqual(Array(refused.length).fill(403));

    // and nothing was written
    const post = await pool.query(`SELECT status, language FROM library_posts WHERE id = $1`, [c.post]);
    expect(post.rows[0]).toMatchObject({ status: 'published' });
    expect(post.rows[0].language).not.toBe('ckb');
    const row = async (sql: string, id: string) => (await pool.query(sql, [id])).rows[0];
    expect(await row(`SELECT status, body FROM library_comments WHERE id = $1`, c.comment)).toEqual({ status: 'visible', body: 'Pir xweş e' });
    expect(await row(`SELECT status, caption FROM image_posts WHERE id = $1`, c.picture)).toEqual({ status: 'published', caption: 'Wêneyê min' });
    expect(await row(`SELECT status, body FROM image_comments WHERE id = $1`, c.caption)).toEqual({ status: 'visible', body: 'Bedew e' });
  });

  it('still lets a staff account edit and take down its own without the code', async () => {
    const own = await pool.query<{ id: string }>(
      `INSERT INTO library_posts (author_id, author_role, type, title, body, status, published_at)
       VALUES ($1, 'admin', 'story', 'Ya min', 'Rojek ji rojan', 'published', now()) RETURNING id`,
      [staff.id],
    );
    const id = own.rows[0]!.id;
    expect((await call(staff.token, 'PATCH', `/library/posts/${id}`, { language: 'ckb' })).statusCode).toBe(200);
    expect((await call(staff.token, 'DELETE', `/library/posts/${id}`)).statusCode).toBe(200);
  });

  it('lets the same staff account act once its session has entered the console code', async () => {
    await pass2fa(app, staff.token, '10.186.0.3');
    const c = await memberContent();
    expect((await call(staff.token, 'PATCH', `/library/posts/${c.post}`, { language: 'ckb' })).statusCode).toBe(200);
    expect((await call(staff.token, 'DELETE', `/library/comments/${c.comment}`)).statusCode).toBe(200);
    expect((await call(staff.token, 'PATCH', `/images/${c.picture}`, { caption: 'Nivîsa nû' })).statusCode).toBe(200);
    expect((await call(staff.token, 'DELETE', `/images/comments/${c.caption}`)).statusCode).toBe(200);
    expect((await call(staff.token, 'DELETE', `/library/posts/${c.post}`)).statusCode).toBe(200);
    expect((await call(staff.token, 'DELETE', `/images/${c.picture}`)).statusCode).toBe(200);
  });

  it('never lets a member act on the content of another', async () => {
    const c = await memberContent();
    const other = await register('spother', '10.186.0.4');
    expect((await call(other.token, 'DELETE', `/library/posts/${c.post}`)).statusCode).toBe(403);
    expect((await call(other.token, 'DELETE', `/images/${c.picture}`)).statusCode).toBe(403);
  });
});
