/**
 * Written posts with pictures, over HTTP against real Postgres: the composer's
 * rules (words or a picture, a title for a story or a poem, at most four, the
 * lengths counted trimmed), whose pictures a post may use and how often, edits
 * that add, remove and describe pictures, and the drafts the installed apps
 * saved on the server.
 *
 * Uploads are seeded as `POST /images/upload` leaves them (test/media.ts); the
 * upload route itself is covered in images/picture-upload.integration.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { POST_BODY_MAX } from '@kurda/shared';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { MediaService } from '../media/service.js';
import { memoryStorage, seedPictureUpload } from '../test/media.js';

const DATABASE_URL = process.env.DATABASE_URL;

interface Media {
  mediaKey: string;
  url: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
}

describe.skipIf(!DATABASE_URL)('written posts with pictures (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.151.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const userIds: string[] = [];

  /** Somebody new — each test posts as its own people, under the per-user rate limit. */
  async function person(tag: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `lp_${tag}_${suffix}@it.kurda.app`,
        username: `lp_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip(),
    });
    await activate(app, pool, res);
    userIds.push(res.json().user.id);
    return { id: res.json().user.id, token: res.json().tokens.accessToken };
  }

  let k = 0;
  /** A fresh upload of `owner`'s, as the upload step leaves it. */
  const upload = (owner: { id: string }, opts: Parameters<typeof seedPictureUpload>[3] = {}) =>
    seedPictureUpload(pool, `image-post/lp-${suffix}-${++k}.webp`, owner.id, opts);

  const call = (method: 'POST' | 'GET' | 'PATCH', url: string, token?: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: ip() });

  const confirmed = async (key: string): Promise<boolean> =>
    (await pool.query<{ c: boolean }>(`SELECT confirmed_at IS NOT NULL AS c FROM media_uploads WHERE key = $1`, [key])).rows[0]!.c;

  // a bucket in memory, so the answers carry picture URLs
  const storage = memoryStorage();

  beforeAll(async () => {
    app = buildApp(config);
    app.decorate('storage', storage);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.query(`DELETE FROM image_scans WHERE media_key LIKE $1`, [`image-post/lp-${suffix}-%`]);
    await pool.query(`DELETE FROM media_uploads WHERE key LIKE $1`, [`image-post/lp-${suffix}-%`]);
    await pool.end();
    await app.close();
  });

  it('posts pictures with no words at all, as a gotin, in the order given', async () => {
    const me = await person('only');
    const [a, b] = [await upload(me, { width: 1280, height: 960 }), await upload(me)];
    const res = await call('POST', '/library/posts', me.token, {
      media: [{ mediaKey: a, altText: '  A street in Amed at dusk  ' }, { mediaKey: b }],
    });
    expect(res.statusCode).toBe(201);
    const post = res.json();
    expect(post).toMatchObject({ type: 'gotin', title: null, body: '', meme: false, sourceCredit: null, status: 'published' });
    expect(post.media).toEqual([
      { mediaKey: a, altText: 'A street in Amed at dusk', width: 1280, height: 960, url: `https://cdn.test/${a}` },
      { mediaKey: b, altText: null, width: 1280, height: 720, url: `https://cdn.test/${b}` },
    ]);
    // the post is what confirms an upload: both are claimed now
    expect(await confirmed(a)).toBe(true);
    expect(await confirmed(b)).toBe(true);

    // and reading it back gives the same pictures, with the old fields intact
    const read = (await call('GET', `/library/posts/${post.id}`)).json();
    expect(read.media.map((m: Media) => m.mediaKey)).toEqual([a, b]);
    for (const field of ['id', 'authorId', 'type', 'title', 'body', 'audioMediaId', 'audioUrl', 'status', 'viewCount', 'commentCount', 'author']) {
      expect(read).toHaveProperty(field);
    }
  });

  it('takes words and pictures together, a meme mark and a credit', async () => {
    const me = await person('both');
    const pic = await upload(me);
    const res = await call('POST', '/library/posts', me.token, {
      body: 'Dema ku tu dibêjî "ez ê sibê dest pê bikim"',
      media: [{ mediaKey: pic }],
      meme: true,
      sourceCredit: '  Wêne: Rojda  ',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ type: 'gotin', meme: true, sourceCredit: 'Wêne: Rojda' });
  });

  it('works out the kind from the title when none is chosen', async () => {
    const me = await person('kinds');
    const make = async (payload: Record<string, unknown>) => call('POST', '/library/posts', me.token, payload);
    expect((await make({ body: 'Gotinek' })).json().type).toBe('gotin');
    expect((await make({ title: 'Bavê min', body: 'Çîrokek' })).json().type).toBe('story');
    expect((await make({ type: 'poem', title: 'Helbest', body: 'rêz' })).json().type).toBe('poem');
  });

  it('refuses a story or a poem without a name with its own code', async () => {
    const me = await person('untitled');
    for (const payload of [{ type: 'story', body: 'x' }, { type: 'poem', title: '   ', body: 'x' }]) {
      const res = await call('POST', '/library/posts', me.token, payload);
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('TITLE_REQUIRED');
    }
  });

  it('needs words or a picture', async () => {
    const me = await person('empty');
    for (const payload of [{}, { body: '  \n ' }, { type: 'gotin', media: [] }]) {
      const res = await call('POST', '/library/posts', me.token, payload);
      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('EMPTY_POST');
    }
  });

  it('takes at most four pictures, and claims none of five', async () => {
    const me = await person('five');
    const keys = [];
    for (let i = 0; i < 5; i++) keys.push(await upload(me));
    const five = await call('POST', '/library/posts', me.token, { media: keys.map((mediaKey) => ({ mediaKey })) });
    expect(five.statusCode).toBe(422);
    expect(five.json()).toMatchObject({ code: 'TOO_MANY_PICTURES', max: 4 });
    expect(await confirmed(keys[0]!)).toBe(false);

    const four = await call('POST', '/library/posts', me.token, { media: keys.slice(0, 4).map((mediaKey) => ({ mediaKey })) });
    expect(four.statusCode).toBe(201);
    expect(four.json().media).toHaveLength(4);
  });

  it('makes only a post with pictures a meme', async () => {
    const me = await person('meme');
    const res = await call('POST', '/library/posts', me.token, { body: 'ha ha', meme: true });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('MEME_NEEDS_PICTURE');
  });

  it('measures each field trimmed, the way the composer counts', async () => {
    const me = await person('long');
    const tooLong = async (payload: Record<string, unknown>, field: string) => {
      const res = await call('POST', '/library/posts', me.token, payload);
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: 'TOO_LONG', field });
    };
    await tooLong({ title: 'x'.repeat(201), body: 'b' }, 'title');
    await tooLong({ body: 'b', sourceCredit: 'x'.repeat(201) }, 'sourceCredit');
    await tooLong({ media: [{ mediaKey: await upload(me), altText: 'x'.repeat(1001) }] }, 'altText');
    await tooLong({ body: 'x'.repeat(POST_BODY_MAX + 1) }, 'body');

    // a full-length text with a blank line after it is not over: the padding is not counted
    const full = await call('POST', '/library/posts', me.token, { body: `${'x'.repeat(POST_BODY_MAX)}\n\n  ` });
    expect(full.statusCode).toBe(201);
    expect(full.json().body).toHaveLength(POST_BODY_MAX);
  });

  it('only takes the author’s own cleared picture uploads', async () => {
    const me = await person('owner');
    const other = await person('stranger');
    const refused = async (mediaKey: string) => {
      const res = await call('POST', '/library/posts', me.token, { body: 'mine?', media: [{ mediaKey }] });
      expect(res.statusCode).toBe(422);
      expect(res.json()).toMatchObject({ code: 'INVALID_MEDIA', mediaKey });
    };

    // somebody else's upload
    await refused(await upload(other));
    // unknown
    await refused(`image-post/lp-${suffix}-nothing.webp`);
    // withheld or rejected by the scan, or not scanned yet
    await refused(await upload(me, { scanStatus: 'gated' }));
    await refused(await upload(me, { scanStatus: 'blocked' }));
    await refused(await upload(me, { scanStatus: 'pending' }));

    // a profile photo (its key is in its public address), a voice note, and an
    // upload from before uploads had owners
    const profile = `profile-photo/lp-${suffix}.webp`;
    const voice = `voice-note/lp-${suffix}.webm`;
    const legacy = `image-post/lp-${suffix}-legacy.webp`;
    await pool.query(
      `INSERT INTO media_uploads (key, content_type, content_length, confirmed_at, scan_status, uploader_id, kind)
       VALUES ($1, 'image/webp', 10, now(), 'cleared', $4, NULL),
              ($2, 'audio/webm', 10, now(), 'cleared', $4, 'voice-note'),
              ($3, 'image/webp', 10, NULL, 'cleared', NULL, NULL)`,
      [profile, voice, legacy, me.id],
    );
    await refused(profile);
    await refused(voice);
    await refused(legacy);
    await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1)`, [[profile, voice, legacy]]);
  });

  it('puts one picture on one post', async () => {
    const me = await person('once');
    const pic = await upload(me);
    expect((await call('POST', '/library/posts', me.token, { media: [{ mediaKey: pic }] })).statusCode).toBe(201);

    const again = await call('POST', '/library/posts', me.token, { body: 'again', media: [{ mediaKey: pic }] });
    expect(again.statusCode).toBe(422);
    expect(again.json()).toMatchObject({ code: 'MEDIA_IN_USE', mediaKey: pic });

    // nor twice in one post
    const twin = await upload(me);
    const twice = await call('POST', '/library/posts', me.token, { media: [{ mediaKey: twin }, { mediaKey: twin }] });
    expect(twice.statusCode).toBe(422);
    expect(twice.json().code).toBe('MEDIA_IN_USE');

    // and a picture posted the old way is taken too
    const old = await upload(me);
    expect((await call('POST', '/images', me.token, { imageMediaId: old, category: 'image' })).statusCode).toBe(201);
    expect((await call('POST', '/library/posts', me.token, { media: [{ mediaKey: old }] })).json().code).toBe('MEDIA_IN_USE');
  });

  it('claims nothing when a post is refused for one of its pictures', async () => {
    const me = await person('atomic');
    const other = await person('atomic2');
    const good = await upload(me);
    const res = await call('POST', '/library/posts', me.token, { media: [{ mediaKey: good }, { mediaKey: await upload(other) }] });
    expect(res.statusCode).toBe(422);
    expect(await confirmed(good)).toBe(false);
    // still free to use
    expect((await call('POST', '/library/posts', me.token, { media: [{ mediaKey: good }] })).statusCode).toBe(201);
  });

  it('edits pictures: adds, describes, reorders and lets go', async () => {
    const me = await person('editor');
    const [a, b, c] = [await upload(me), await upload(me), await upload(me)];
    const post = (await call('POST', '/library/posts', me.token, { body: 'Sê wêne', media: [{ mediaKey: a }, { mediaKey: b }] })).json();

    const res = await call('PATCH', `/library/posts/${post.id}`, me.token, {
      media: [
        { mediaKey: c, altText: 'Nû' },
        { mediaKey: a, altText: 'Ya yekem' },
      ],
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().media.map((m: Media) => [m.mediaKey, m.altText])).toEqual([
      [c, 'Nû'],
      [a, 'Ya yekem'],
    ]);
    // the answer is the post as readers get it, URLs and all
    expect(res.json().media[0].url).toBe(`https://cdn.test/${c}`);
    expect(res.json()).toHaveProperty('audioUrl');

    // the new one is claimed, the kept one still is, and the dropped one is let
    // go to the orphan sweep — with a fresh day before it
    expect(await confirmed(c)).toBe(true);
    expect(await confirmed(a)).toBe(true);
    const dropped = await pool.query<{ confirmed_at: Date | null; created_at: Date }>(
      `SELECT confirmed_at, created_at FROM media_uploads WHERE key = $1`,
      [b],
    );
    expect(dropped.rows[0]!.confirmed_at).toBeNull();
    expect(Date.now() - dropped.rows[0]!.created_at.getTime()).toBeLessThan(60_000);

    // until the sweep comes, it is its owner's to post again
    expect((await call('POST', '/library/posts', me.token, { media: [{ mediaKey: b }] })).statusCode).toBe(201);
  });

  it('keeps a picture a moderator still has to see when an edit takes it off', async () => {
    const me = await person('reported');
    const reader = await person('reporter');
    const [a, b, c, d] = [await upload(me), await upload(me), await upload(me), await upload(me)];
    for (const key of [a, b, c, d]) storage.objects.set(key, Buffer.from('webp'));
    const reported = (await call('POST', '/library/posts', me.token, { body: 'Wêne', media: [{ mediaKey: a }, { mediaKey: b }] })).json();
    const flagged = (await call('POST', '/library/posts', me.token, { body: 'Du', media: [{ mediaKey: c }, { mediaKey: d }] })).json();
    expect((await call('POST', `/library/posts/${reported.id}/report`, reader.token, { reason: 'spam' })).statusCode).toBe(200);
    // the scan let `d` up but asked a person to look at it (#294)
    await pool.query(`INSERT INTO image_scans (media_key, surface, action, model_version) VALUES ($1, 'feed', 'flag', 'test')`, [d]);

    // the author takes the reported picture off, keeping the words; and the
    // flagged one off the other post
    expect((await call('PATCH', `/library/posts/${reported.id}`, me.token, { media: [{ mediaKey: a }] })).statusCode).toBe(200);
    expect((await call('PATCH', `/library/posts/${flagged.id}`, me.token, { media: [{ mediaKey: c }] })).statusCode).toBe(200);

    // a day and an hour later, both are still there for the moderator
    await new MediaService(pool, storage).cleanupOrphans(new Date(Date.now() + 25 * 3_600_000));
    for (const key of [b, d]) {
      expect(await confirmed(key)).toBe(true);
      expect(storage.objects.has(key)).toBe(true);
    }

    // once the report is dealt with, what an edit takes off goes as usual
    await pool.query(`UPDATE library_reports SET status = 'resolved' WHERE target_id = $1`, [reported.id]);
    expect((await call('PATCH', `/library/posts/${reported.id}`, me.token, { media: [] })).statusCode).toBe(200);
    expect(await confirmed(a)).toBe(false);
  });

  it('changes words, title, credit and alt text without touching the pictures', async () => {
    const me = await person('words');
    const pic = await upload(me);
    const post = (await call('POST', '/library/posts', me.token, { title: 'Nav', body: 'Rêz', media: [{ mediaKey: pic, altText: 'berê' }] })).json();
    expect(post.type).toBe('story');

    const res = await call('PATCH', `/library/posts/${post.id}`, me.token, { title: 'Navê nû', body: '', sourceCredit: 'Ji pirtûkekê' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: 'Navê nû', body: '', sourceCredit: 'Ji pirtûkekê' });
    expect(res.json().media).toEqual([expect.objectContaining({ mediaKey: pic, altText: 'berê' })]);

    // a credit can be taken off again
    expect((await call('PATCH', `/library/posts/${post.id}`, me.token, { sourceCredit: null })).json().sourceCredit).toBeNull();
  });

  it('answers an invalid edit with 422 and why, not 403', async () => {
    const me = await person('badedit');
    const story = (await call('POST', '/library/posts', me.token, { type: 'story', title: 'Nav', body: 'Rêz' })).json();

    const untitled = await call('PATCH', `/library/posts/${story.id}`, me.token, { title: '' });
    expect(untitled.statusCode).toBe(422);
    expect(untitled.json().code).toBe('TITLE_REQUIRED');

    const emptied = await call('PATCH', `/library/posts/${story.id}`, me.token, { body: '   ' });
    expect(emptied.statusCode).toBe(422);
    expect(emptied.json().code).toBe('EMPTY_POST');

    // nothing of a refused edit lands
    expect((await call('GET', `/library/posts/${story.id}`)).json()).toMatchObject({ title: 'Nav', body: 'Rêz' });

    // a gotin may lose its title, and a story may become one
    const gotin = await call('PATCH', `/library/posts/${story.id}`, me.token, { type: 'gotin', title: null });
    expect(gotin.statusCode).toBe(200);
    expect(gotin.json()).toMatchObject({ type: 'gotin', title: null });
  });

  it('lets an edit add only the author’s own unused pictures, even for an admin', async () => {
    const author = await person('edauthor');
    const other = await person('edother');
    const admin = await person('edadmin');
    await pool.query(`UPDATE users SET roles = '{admin}' WHERE id = $1`, [admin.id]);
    const adminToken = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: `lp_edadmin_${suffix}@it.kurda.app`, password: 'a-strong-password1' },
        remoteAddress: ip(),
      })
    ).json().tokens.accessToken;

    const post = (await call('POST', '/library/posts', author.token, { body: 'Nivîs' })).json();
    const theirs = await upload(other);
    const res = await call('PATCH', `/library/posts/${post.id}`, author.token, { media: [{ mediaKey: theirs }] });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_MEDIA');

    // an admin cannot put their own upload under somebody else's name
    const adminPic = await upload(admin);
    const byAdmin = await call('PATCH', `/library/posts/${post.id}`, adminToken, { media: [{ mediaKey: adminPic }] });
    expect(byAdmin.statusCode).toBe(422);
    expect(byAdmin.json().code).toBe('INVALID_MEDIA');
    // but may edit what is there, as before
    expect((await call('PATCH', `/library/posts/${post.id}`, adminToken, { language: 'ckb' })).statusCode).toBe(200);

    // somebody who is neither is still told it is not theirs
    expect((await call('PATCH', `/library/posts/${post.id}`, other.token, { body: 'hijack' })).statusCode).toBe(403);
  });

  it('drops the meme mark with the last picture', async () => {
    const me = await person('unmeme');
    const pic = await upload(me);
    const post = (await call('POST', '/library/posts', me.token, { body: 'Bi wêne', media: [{ mediaKey: pic }], meme: true })).json();
    const res = await call('PATCH', `/library/posts/${post.id}`, me.token, { media: [] });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ meme: false, media: [] });
  });

  it('lists sayings when asked for them', async () => {
    const me = await person('lister');
    const saying = (await call('POST', '/library/posts', me.token, { body: `Gotina ${suffix}` })).json();
    await call('POST', '/library/posts', me.token, { title: `Çîrok ${suffix}`, body: 'x' });

    const res = await call('GET', `/library/posts?type=gotin&authorId=${me.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().posts.map((p: { id: string }) => p.id)).toEqual([saying.id]);
  });

  it('finds the drafts an installed app saved, so they can be finished', async () => {
    const me = await person('drafter');
    const other = await person('drafter2');
    const draft = (await call('POST', '/library/posts', me.token, { type: 'story', title: 'Nîv-qediyayî', body: 'Destpêk', publish: false })).json();
    expect(draft.status).toBe('draft');

    const mine = await call('GET', '/me/library/drafts', me.token);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().posts.map((p: { id: string }) => p.id)).toEqual([draft.id]);
    expect(mine.json().posts[0]).toMatchObject({ body: 'Destpêk', media: [], author: { id: me.id } });

    // only your own, and only when signed in
    expect((await call('GET', '/me/library/drafts', other.token)).json().posts).toEqual([]);
    expect((await call('GET', '/me/library/drafts')).statusCode).toBe(401);

    // finished and published, it is a draft no longer
    expect((await call('PATCH', `/library/posts/${draft.id}`, me.token, { body: 'Destpêk û dawî' })).statusCode).toBe(200);
    expect((await call('POST', `/library/posts/${draft.id}/publish`, me.token)).statusCode).toBe(200);
    expect((await call('GET', '/me/library/drafts', me.token)).json().posts).toEqual([]);
  });

  it('refuses a picture as a narration', async () => {
    const me = await person('narrator');
    const picture = await upload(me);
    await pool.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = $1`, [picture]);
    const res = await call('POST', '/library/posts', me.token, { body: 'Bi deng', audioMediaId: picture });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('INVALID_AUDIO');
  });
});
