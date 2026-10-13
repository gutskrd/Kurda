/**
 * Every way a written post's words or pictures reach the wall goes through the
 * same gate — velocity cap, spam check, screening — over HTTP with real
 * Postgres + Redis (KUR-295, #293). Only the create route used to be gated: an
 * edit and a published draft went up unscreened, and alt text was not read.
 * (Picture posts: images/picture-gate.integration.test.ts.)
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

describe.skipIf(!DATABASE_URL || !REDIS_URL)('the gate on written posts (integration)', () => {
  const config = loadConfig({ DATABASE_URL, REDIS_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Math.random().toString(36).slice(2, 8);
  let n = 0;
  const ip = (): string => `10.153.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const userIds: string[] = [];
  const SPAM = 'buy cheap followers now';
  const SCAM = 'free money, click here';

  /**
   * A new account (two posts an hour), or an established one (fifty), so a
   * test about the spam check is not stopped by the velocity cap first.
   */
  async function person(tag: string, level: 'new' | 'established' = 'new'): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `pg_${tag}_${suffix}@it.kurda.app`,
        username: `pg_${tag}_${suffix}`.slice(0, 30),
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

  let k = 0;
  const upload = (owner: { id: string }) => seedPictureUpload(pool, `image-post/pg-${suffix}-${++k}.webp`, owner.id);
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
    await pool.query(`DELETE FROM media_uploads WHERE key LIKE $1`, [`image-post/pg-${suffix}-%`]);
    await pool.end();
    await app.close();
  });

  it('counts a draft when it is published, not when it is saved', async () => {
    const me = await person('drafts');
    const draft = (await call('POST', '/library/posts', me.token, { body: 'Pêşnivîs', publish: false })).json();
    expect((await call('POST', '/library/posts', me.token, { body: 'Yekem' })).statusCode).toBe(201);
    // the draft going up is the second post of the hour
    expect((await call('POST', `/library/posts/${draft.id}/publish`, me.token)).statusCode).toBe(200);

    const third = await call('POST', '/library/posts', me.token, { body: 'Sêyem' });
    expect(third.statusCode).toBe(429);
    expect(third.json().code).toBe('TRUST_VELOCITY');
    // saving one more draft reaches nobody, so it is not stopped
    const another = (await call('POST', '/library/posts', me.token, { body: 'Pêşnivîsa din', publish: false })).json();
    expect(another.status).toBe('draft');
    // but publishing it is
    const publish = await call('POST', `/library/posts/${another.id}/publish`, me.token);
    expect(publish.statusCode).toBe(429);
    expect(publish.json().code).toBe('TRUST_VELOCITY');
  });

  it('gates an edit that puts new words or pictures up, and nothing else', async () => {
    const me = await person('edits');
    const [a, b, c] = [await upload(me), await upload(me), await upload(me)];
    const post = (await call('POST', '/library/posts', me.token, { body: 'Berê', media: [{ mediaKey: a }, { mediaKey: b }] })).json();
    const draft = (await call('POST', '/library/posts', me.token, { body: 'Pêşnivîs', publish: false })).json();
    await call('POST', '/library/posts', me.token, { body: 'Ya duyem' }); // the hour's cap is used up now

    const words = await call('PATCH', `/library/posts/${post.id}`, me.token, { body: 'Paşê' });
    expect(words.statusCode).toBe(429);
    expect(words.json().code).toBe('TRUST_VELOCITY');
    const picture = await call('PATCH', `/library/posts/${post.id}`, me.token, { media: [{ mediaKey: a }, { mediaKey: c }] });
    expect(picture.statusCode).toBe(429);

    // the same words again, a reorder, a picture taken off: nothing new goes up
    expect((await call('PATCH', `/library/posts/${post.id}`, me.token, { body: ' Berê ' })).statusCode).toBe(200);
    expect((await call('PATCH', `/library/posts/${post.id}`, me.token, { media: [{ mediaKey: b }, { mediaKey: a }] })).statusCode).toBe(200);
    expect((await call('PATCH', `/library/posts/${post.id}`, me.token, { media: [{ mediaKey: b }] })).statusCode).toBe(200);
    // and a draft's words are checked when it goes up, not while it is written
    expect((await call('PATCH', `/library/posts/${draft.id}`, me.token, { body: 'Hîn ne amade' })).statusCode).toBe(200);
  });

  it('does not count a refused post, nor remember its words as repeats', async () => {
    const me = await person('refused', 'established');
    for (let i = 0; i < 6; i++) {
      // refused for its shape before the gate sees it
      expect((await call('POST', '/library/posts', me.token, { type: 'story', body: SPAM })).statusCode).toBe(422);
    }
    expect((await call('POST', '/library/posts', me.token, { title: 'Nav', body: SPAM })).statusCode).toBe(201);
  });

  it('reads alt text as words in the spam check', async () => {
    const me = await person('alts', 'established');
    const post = async () => call('POST', '/library/posts', me.token, { media: [{ mediaKey: await upload(me), altText: SPAM }] });
    for (let i = 0; i < 4; i++) expect((await post()).statusCode).toBe(201);
    const fifth = await post();
    expect(fifth.statusCode).toBe(403);
    expect(fifth.json().code).toBe('AUTO_MODERATED');
  });

  it('checks the words an edit adds for spam', async () => {
    const me = await person('editspam', 'established');
    const post = (await call('POST', '/library/posts', me.token, { body: 'Tiştekî bêzerar' })).json();
    for (let i = 0; i < 4; i++) expect((await call('POST', '/library/posts', me.token, { body: SPAM })).statusCode).toBe(201);
    const edit = await call('PATCH', `/library/posts/${post.id}`, me.token, { body: SPAM });
    expect(edit.statusCode).toBe(403);
    expect(edit.json().code).toBe('AUTO_MODERATED');
    // and nothing of it landed
    expect((await pool.query(`SELECT body FROM library_posts WHERE id = $1`, [post.id])).rows[0].body).toBe('Tiştekî bêzerar');
  });

  it('screens what went up: alt text, an edit, a published draft', async () => {
    const me = await person('screened', 'established');

    const withAlt = (await call('POST', '/library/posts', me.token, { media: [{ mediaKey: await upload(me), altText: SCAM }] })).json();
    expect(await flags(withAlt.id)).toEqual([{ surface: 'library' }]);

    const edited = (await call('POST', '/library/posts', me.token, { body: 'Silav' })).json();
    expect(await flags(edited.id)).toEqual([]);
    expect((await call('PATCH', `/library/posts/${edited.id}`, me.token, { body: SCAM })).statusCode).toBe(200);
    expect(await flags(edited.id)).toEqual([{ surface: 'library' }]);

    const draft = (await call('POST', '/library/posts', me.token, { body: SCAM, publish: false })).json();
    expect(await flags(draft.id)).toEqual([]); // nobody can read a draft
    await call('POST', `/library/posts/${draft.id}/publish`, me.token);
    expect(await flags(draft.id)).toEqual([{ surface: 'library' }]);
  });
});
