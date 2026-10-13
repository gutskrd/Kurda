/**
 * `POST /images/upload` as the composer uses it, against real Postgres with a
 * bucket in memory: the signature only on what somebody made, an owner for
 * every upload, and an upload confirmed only by the post that uses it — so a
 * picture is posted once, by the person who uploaded it, and one nobody posts
 * is reclaimed by the orphan sweep.
 *
 * The cost-safety of the store (limits, failed writes, MinIO) is covered in
 * image-upload.integration.test.ts, which needs a real bucket.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import sharp from 'sharp';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { storeImageMedia } from '../media/imageMedia.js';
import { processImage } from '../media/imageProcess.js';
import { imagePostLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { claimPostPictures } from '../media/postMedia.js';
import { MediaService } from '../media/service.js';
import { ImageModerationService } from '../moderation/image-moderation-service.js';
import { activate } from '../test/activate.js';
import { memoryStorage } from '../test/media.js';

const DATABASE_URL = process.env.DATABASE_URL;

/** A picture with something in it, so two colours make two different files. */
const photo = (r: number, g = 90, b = 160) =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: { r, g, b } } })
    .composite([{ input: Buffer.from('<svg width="300" height="200"><circle cx="150" cy="100" r="80" fill="#fff"/></svg>'), left: 100, top: 100 }])
    .png()
    .toBuffer();

interface Row {
  uploader_id: string | null;
  kind: string | null;
  width: number | null;
  height: number | null;
  confirmed_at: Date | null;
  scan_status: string;
  content_length: number;
}

describe.skipIf(!DATABASE_URL)('picture uploads for posts (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  const storage = memoryStorage();
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.152.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const userIds: string[] = [];
  const keys: string[] = [];

  async function person(tag: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `pu_${tag}_${suffix}@it.kurda.app`,
        username: `pu_${tag}_${suffix}`.slice(0, 30),
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

  const upload = async (token: string, bytes: Buffer, query = '') => {
    const res = await app.inject({
      method: 'POST',
      url: `/images/upload${query}`,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'image/png' },
      payload: bytes,
      remoteAddress: ip(),
    });
    if (res.statusCode === 201) keys.push(res.json().imageMediaId);
    return res;
  };
  /** A picture post the way the installed apps make one. */
  const postPicture = (token: string, imageMediaId: string) =>
    app.inject({
      method: 'POST',
      url: '/images',
      headers: { authorization: `Bearer ${token}` },
      payload: { imageMediaId, category: 'image' },
      remoteAddress: ip(),
    });
  const row = async (key: string): Promise<Row | undefined> =>
    (
      await pool.query<Row>(
        `SELECT uploader_id, kind, width, height, confirmed_at, scan_status, content_length FROM media_uploads WHERE key = $1`,
        [key],
      )
    ).rows[0];

  beforeAll(async () => {
    app = buildApp(config);
    app.decorate('storage', storage);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    if (keys.length) await pool.query(`DELETE FROM media_uploads WHERE key = ANY($1)`, [keys]);
    await pool.end();
    await app.close();
  });

  it('records who uploaded it and its size, and leaves it for a post to confirm', async () => {
    const me = await person('owner');
    const res = await upload(me.token, await photo(30));
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ width: 900, height: 600, signed: true });
    expect(body.imageMediaId).toMatch(/^image-post\/[a-f0-9]{64}\.webp$/);
    expect(body.url).toBe(`https://cdn.test/${body.imageMediaId}`);

    expect(await row(body.imageMediaId)).toMatchObject({
      uploader_id: me.id,
      kind: 'image-post',
      width: 900,
      height: 600,
      confirmed_at: null,
      scan_status: 'cleared',
    });
    expect(storage.objects.has(body.imageMediaId)).toBe(true);
  });

  it('signs a picture only when the uploader made it', async () => {
    const me = await person('signer');
    const bytes = await photo(60);
    const signed = await upload(me.token, bytes);
    const plain = await upload(me.token, bytes, '?ownWork=false');
    expect(signed.json().signed).toBe(true);
    expect(plain.json().signed).toBe(false);
    expect(plain.json().imageMediaId).not.toBe(signed.json().imageMediaId);

    // what was stored without the mark is exactly the processed picture
    const limits = imagePostLimits(config);
    const processed = await processImage(bytes, {
      maxDimension: limits.maxDimension,
      maxStoredBytes: limits.maxStoredBytes,
      allowedTypes: limits.allowedTypes,
    });
    expect(processed.ok).toBe(true);
    if (processed.ok) {
      expect(storage.objects.get(plain.json().imageMediaId)!.equals(processed.webp)).toBe(true);
      expect(storage.objects.get(signed.json().imageMediaId)!.equals(processed.webp)).toBe(false);
    }
    // "0" means off too; anything else leaves it on, as the installed apps expect
    expect((await upload(me.token, await photo(61), '?ownWork=0')).json().signed).toBe(false);
    expect((await upload(me.token, await photo(62), '?ownWork=true')).json().signed).toBe(true);
  });

  it('gives two people uploading the same picture an upload each', async () => {
    const a = await person('twin_a');
    const b = await person('twin_b');
    const meme = await photo(90);
    const first = (await upload(a.token, meme, '?ownWork=false')).json().imageMediaId;
    const second = (await upload(b.token, meme, '?ownWork=false')).json().imageMediaId;
    expect(second).not.toBe(first);
    expect((await row(first))!.uploader_id).toBe(a.id);
    expect((await row(second))!.uploader_id).toBe(b.id);
    // and each can post their own
    expect((await postPicture(a.token, first)).statusCode).toBe(201);
    expect((await postPicture(b.token, second)).statusCode).toBe(201);
  });

  it('reuses the same person’s same picture, with a fresh day before the sweep', async () => {
    const me = await person('again');
    const bytes = await photo(120);
    const key = (await upload(me.token, bytes)).json().imageMediaId;
    await pool.query(`UPDATE media_uploads SET created_at = now() - interval '20 hours' WHERE key = $1`, [key]);
    const writes = storage.objects.size;

    const again = await upload(me.token, bytes);
    expect(again.json().imageMediaId).toBe(key);
    expect(storage.objects.size).toBe(writes);
    const created = (await pool.query<{ age: number }>(`SELECT extract(epoch FROM now() - created_at) AS age FROM media_uploads WHERE key = $1`, [key])).rows[0]!.age;
    expect(Number(created)).toBeLessThan(60);
  });

  it('lets an installed app post its upload the old way, once, and nobody else', async () => {
    const me = await person('oldapp');
    const other = await person('oldother');
    const key = (await upload(me.token, await photo(150))).json().imageMediaId;
    const post = (token: string) => postPicture(token, key);

    // somebody else cannot post it (the same answer an unknown key always got)
    const theirs = await post(other.token);
    expect(theirs.statusCode).toBe(422);
    expect(theirs.json().code).toBe('INVALID_POST');

    expect((await post(me.token)).statusCode).toBe(201);
    expect((await row(key))!.confirmed_at).not.toBeNull();

    // the same picture again is not a new post
    const twice = await post(me.token);
    expect(twice.statusCode).toBe(422);
    expect(twice.json().code).toBe('MEDIA_IN_USE');
  });

  it('lets a picture be posted again once its post is gone, the old way and the new', async () => {
    const me = await person('repost');
    const call = (method: 'POST' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
      app.inject({ method, url, payload, headers: { authorization: `Bearer ${me.token}` }, remoteAddress: ip() });

    // an installed app changes a caption by deleting the post and posting again
    const bytes = await photo(160);
    const first = (await upload(me.token, bytes)).json().imageMediaId;
    const old = await postPicture(me.token, first);
    expect(old.statusCode).toBe(201);
    expect((await call('DELETE', `/images/${old.json().id}`)).statusCode).toBe(200);
    const again = await upload(me.token, bytes);
    expect(again.statusCode).toBe(201);
    expect(again.json().imageMediaId).not.toBe(first);
    expect((await postPicture(me.token, again.json().imageMediaId)).statusCode).toBe(201);
    // the removed post keeps its own file, as removed posts do
    expect((await row(first))!.confirmed_at).not.toBeNull();
    expect(storage.objects.has(first)).toBe(true);

    // a written post the same way
    const words = await photo(161);
    const mine = (await upload(me.token, words)).json().imageMediaId;
    const written = await call('POST', '/library/posts', { body: 'Wêneyek', media: [{ mediaKey: mine }] });
    expect(written.statusCode).toBe(201);
    expect((await call('DELETE', `/library/posts/${written.json().id}`)).statusCode).toBe(200);
    const fresh = (await upload(me.token, words)).json().imageMediaId;
    expect(fresh).not.toBe(mine);
    expect((await call('POST', '/library/posts', { body: 'Dîsa', media: [{ mediaKey: fresh }] })).statusCode).toBe(201);

    // and while a post still has it, uploading it again is a new upload too:
    // one upload is still one post's
    const later = (await upload(me.token, words)).json().imageMediaId;
    expect(later).not.toBe(fresh);
    expect((await row(later))).toMatchObject({ uploader_id: me.id, confirmed_at: null, scan_status: 'cleared' });
    const twice = await call('POST', '/library/posts', { body: 'Sê car', media: [{ mediaKey: fresh }] });
    expect(twice.statusCode).toBe(422);
    expect(twice.json().code).toBe('MEDIA_IN_USE');
  });

  it('counts an upload waiting for its post against the storage ceiling', async () => {
    const me = await person('ceiling');
    const usage = new MediaUsageService(pool, null);
    const before = (await usage.totalStoredBytes())!;
    const key = (await upload(me.token, await photo(180))).json().imageMediaId;
    const bytes = (await row(key))!.content_length;
    expect(await usage.totalStoredBytes()).toBe(before + bytes);
  });

  it('leaves an upload nobody posted to the orphan sweep, and keeps the posted one', async () => {
    const me = await person('sweep');
    const abandoned = (await upload(me.token, await photo(210))).json().imageMediaId;
    const posted = (await upload(me.token, await photo(211))).json().imageMediaId;
    expect((await postPicture(me.token, posted)).statusCode).toBe(201);

    // a day and an hour later
    await new MediaService(pool, storage).cleanupOrphans(new Date(Date.now() + 25 * 3_600_000));
    expect(await row(abandoned)).toBeUndefined();
    expect(storage.objects.has(abandoned)).toBe(false);
    expect(await row(posted)).toBeDefined();
    expect(storage.objects.has(posted)).toBe(true);
  });

  it('never deletes an upload that a post claims while the sweep runs', async () => {
    const me = await person('race');
    const key = (await upload(me.token, await photo(240))).json().imageMediaId;

    // a post claims it, and has not committed yet
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      expect((await claimPostPictures(client, me.id, [key])).ok).toBe(true);
      // a day and an hour later, the sweep lists it — the claim is not
      // visible to it yet — and comes to delete it
      const sweep = new MediaService(pool, storage).cleanupOrphans(new Date(Date.now() + 25 * 3_600_000));
      for (let i = 0; ; i++) {
        const waiting = await pool.query(
          `SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE 'DELETE FROM media_uploads%'`,
        );
        if (waiting.rowCount) break;
        if (i > 400) throw new Error('the sweep never came to the claimed upload');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      await client.query('COMMIT');
      await sweep;
    } finally {
      client.release();
    }

    // the post has its picture: the row and the file
    expect((await row(key))!.confirmed_at).not.toBeNull();
    expect(storage.objects.has(key)).toBe(true);
  });

  it('scans a picture again that was held only because the scanner was down', async () => {
    const me = await person('outage');
    let scanner: 'down' | 'clean' | 'holds' = 'down';
    const deps = {
      pool,
      storage,
      usage: new MediaUsageService(pool, null),
      moderation: new ImageModerationService(pool, {
        scanner: {
          scan: async () => {
            if (scanner === 'down') throw new Error('scanner unavailable');
            return { nsfwScore: scanner === 'holds' ? 0.85 : 0, violenceScore: 0, csamMatch: false, modelVersion: 'test-v1' };
          },
        },
      }),
      limits: imagePostLimits(config),
      log: { warn: () => undefined, error: () => undefined },
    };
    const store = (bytes: Buffer) => storeImageMedia(deps, 'image-post', bytes, { ownerId: me.id });

    try {
      // held while the scanner is down, as an unscanned picture always is…
      const bytes = await photo(250);
      expect(await store(bytes)).toMatchObject({ ok: false, code: 'IMAGE_REJECTED' });
      // …and scanned again when it is back, rather than refused for good
      scanner = 'clean';
      const again = await store(bytes);
      expect(again).toMatchObject({ ok: true, reused: false });
      if (again.ok) expect((await row(again.mediaId))!.scan_status).toBe('cleared');

      // a hold the scanner decided stands, with no second scan
      scanner = 'holds';
      const held = await photo(251);
      expect(await store(held)).toMatchObject({ ok: false, code: 'IMAGE_REJECTED' });
      scanner = 'clean';
      expect(await store(held)).toMatchObject({ ok: false, code: 'IMAGE_REJECTED' });
      const verdicts = await pool.query(
        `SELECT 1 FROM image_scans s JOIN media_uploads m ON m.key = s.media_key
          WHERE m.uploader_id = $1 AND s.action = 'gate' AND s.model_version = 'test-v1'`,
        [me.id],
      );
      expect(verdicts.rowCount).toBe(1);
    } finally {
      const mine = await pool.query<{ key: string }>(`SELECT key FROM media_uploads WHERE uploader_id = $1`, [me.id]);
      keys.push(...mine.rows.map((r) => r.key));
      await pool.query(`DELETE FROM image_scans WHERE media_key = ANY($1)`, [mine.rows.map((r) => r.key)]);
    }
  });
});
