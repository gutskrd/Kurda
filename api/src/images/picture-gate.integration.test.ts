/**
 * A picture post goes through the same gate as a written one — velocity cap,
 * spam check, screening of its caption — over HTTP with real Postgres + Redis
 * (KUR-295, #293). It used to go up with no check at all, so the one route
 * with no velocity cap was also the one whose words nobody screened.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { seedPictureUpload } from '../test/media.js';

const DATABASE_URL = process.env.DATABASE_URL;
const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!DATABASE_URL || !REDIS_URL)('the gate on picture posts (integration)', () => {
  const config = loadConfig({ DATABASE_URL, REDIS_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Math.random().toString(36).slice(2, 8);
  let n = 0;
  const ip = (): string => `10.156.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const userIds: string[] = [];
  const SPAM = 'buy cheap followers now';
  const SCAM = 'free money, click here';

  /** A new account (two posts an hour), or an established one (fifty). */
  async function person(tag: string, level: 'new' | 'established' = 'new'): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `ig_${tag}_${suffix}@it.kurda.app`,
        username: `ig_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip(),
    });
    await activate(app, pool, res);
    const id = res.json().user.id;
    userIds.push(id);
    if (level === 'established') await pool.query(`UPDATE users SET created_at = now() - interval '8 days' WHERE id = $1`, [id]);
    return { id, token: res.json().tokens.accessToken };
  }

  /** Staff: a new account (two posts an hour, if anything were counted) with the admin role. */
  async function staff(tag: string): Promise<{ id: string; token: string }> {
    const me = await person(tag);
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [me.id]);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `ig_${tag}_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
      remoteAddress: ip(),
    });
    return { id: me.id, token: login.json().tokens.accessToken }; // a fresh token carries the role
  }

  let k = 0;
  const upload = (owner: { id: string }) => seedPictureUpload(pool, `image-post/ig-${suffix}-${++k}.webp`, owner.id);
  const call = (method: 'POST' | 'PATCH', url: string, token: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` }, remoteAddress: ip() });
  const flags = async (ref: string) =>
    (await pool.query<{ surface: string }>(`SELECT surface FROM moderation_flags WHERE content_ref = $1`, [ref])).rows;

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    if (userIds.length) {
      await pool.query(`DELETE FROM moderation_flags WHERE author_id = ANY($1)`, [userIds]);
      await pool.query(`DELETE FROM admin_actions WHERE target_user_id = ANY($1)`, [userIds]);
      await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    }
    await pool.query(`DELETE FROM media_uploads WHERE key LIKE $1`, [`image-post/ig-${suffix}-%`]);
    await pool.end();
    await app.close();
  });

  it('caps a picture post like any other post', async () => {
    const me = await person('pictures');
    const post = async () => call('POST', '/images', me.token, { imageMediaId: await upload(me), caption: `wêne ${++k}` });
    expect((await post()).statusCode).toBe(201);
    expect((await post()).statusCode).toBe(201);
    const third = await post();
    expect(third.statusCode).toBe(429);
    expect(third.json().code).toBe('TRUST_VELOCITY');
    // one cap for every kind of post
    expect((await call('POST', '/library/posts', me.token, { type: 'gotin', body: 'Nivîs' })).statusCode).toBe(429);
  });

  it('does not count a picture post refused for its picture', async () => {
    const me = await person('refused');
    const other = await person('refused2');
    for (let i = 0; i < 3; i++) {
      expect((await call('POST', '/images', me.token, { imageMediaId: await upload(other) })).statusCode).toBe(422);
    }
    expect((await call('POST', '/images', me.token, { imageMediaId: await upload(me) })).statusCode).toBe(201);
  });

  it('checks a caption for spam', async () => {
    const me = await person('captions', 'established');
    const post = async () => call('POST', '/images', me.token, { imageMediaId: await upload(me), caption: SPAM });
    for (let i = 0; i < 4; i++) expect((await post()).statusCode).toBe(201);
    const fifth = await post();
    expect(fifth.statusCode).toBe(403);
    expect(fifth.json().code).toBe('AUTO_MODERATED');
  });

  it('screens a caption when it goes up, and when it is changed', async () => {
    const me = await person('screened', 'established');
    const picture = (await call('POST', '/images', me.token, { imageMediaId: await upload(me), caption: 'Çiya' })).json();
    expect(await flags(picture.id)).toEqual([]);
    expect((await call('PATCH', `/images/${picture.id}`, me.token, { caption: SCAM })).statusCode).toBe(200);
    expect(await flags(picture.id)).toEqual([{ surface: 'caption' }]);

    const captioned = (await call('POST', '/images', me.token, { imageMediaId: await upload(me), caption: `${SCAM}!` })).json();
    expect(await flags(captioned.id)).toEqual([{ surface: 'caption' }]);
  });

  it('caps a caption edit like any other edit, but not taking a caption off', async () => {
    const me = await person('capedit');
    const picture = (await call('POST', '/images', me.token, { imageMediaId: await upload(me), caption: 'Yek' })).json();
    await call('POST', '/library/posts', me.token, { type: 'gotin', body: 'Du' }); // the hour's cap is used up now
    const edit = await call('PATCH', `/images/${picture.id}`, me.token, { caption: 'Sê' });
    expect(edit.statusCode).toBe(429);
    expect(edit.json().code).toBe('TRUST_VELOCITY');
    expect((await call('PATCH', `/images/${picture.id}`, me.token, { caption: null })).statusCode).toBe(200);
  });

  it('does not count staff editing somebody’s caption as the staff member posting', async () => {
    const author = await person('captioned', 'established');
    const admin = await staff('capstaff');
    const pictures: Array<{ id: string }> = [];
    for (let i = 0; i < 6; i++) {
      pictures.push((await call('POST', '/images', author.token, { imageMediaId: await upload(author), caption: `Wêne ${i}` })).json());
    }
    for (const picture of pictures) {
      expect((await call('PATCH', `/images/${picture.id}`, admin.token, { caption: SCAM })).statusCode).toBe(200);
    }
    const flagged = await pool.query(
      `SELECT 1 FROM moderation_flags WHERE content_ref = ANY($1) OR author_id = $2`,
      [pictures.map((p) => p.id), admin.id],
    );
    expect(flagged.rowCount).toBe(0);
    // the staff member's own posting is untouched
    expect((await call('POST', '/images', admin.token, { imageMediaId: await upload(admin) })).statusCode).toBe(201);
  });
});
