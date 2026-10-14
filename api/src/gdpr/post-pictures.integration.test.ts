/**
 * The pictures on written posts in someone's data, against real Postgres: a
 * closed account's go with its posts (and so do the uploads it never posted),
 * other people's stay, and evidence leaves the public bucket but is kept; an
 * export lists the posts with links to their pictures.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { FakeStorage } from '../test/fake-storage.js';
import { memoryStorage, seedPictureUpload } from '../test/media.js';
import { evidenceObjectKey } from '../moderation/pseudonym.js';
import { GdprService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.skipIf(!DATABASE_URL)('pictures on posts in GDPR erase and export (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let n = 0;
  const ip = (): string => `10.155.${Math.floor(++n / 250)}.${(n % 250) + 1}`;
  const userIds: string[] = [];

  async function person(tag: string): Promise<{ id: string; token: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `gp_${tag}_${suffix}@it.kurda.app`,
        username: `gp_${tag}_${suffix}`.slice(0, 30),
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
  const upload = (owner: { id: string }) => seedPictureUpload(pool, `image-post/gp-${suffix}-${++k}.webp`, owner.id);
  const post = (token: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/library/posts', payload, headers: { authorization: `Bearer ${token}` }, remoteAddress: ip() });
  const stored = async (keys: string[]): Promise<string[]> =>
    (await pool.query<{ key: string }>(`SELECT key FROM media_uploads WHERE key = ANY($1) ORDER BY key`, [keys])).rows.map((r) => r.key);

  beforeAll(async () => {
    app = buildApp(config);
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM image_scans WHERE media_key LIKE $1`, [`image-post/gp-${suffix}-%`]);
    await pool.query(`DELETE FROM media_uploads WHERE key LIKE $1`, [`image-post/gp-${suffix}-%`]);
    if (userIds.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [userIds]);
    await pool.end();
    await app.close();
  });

  it('erases a closed account’s post pictures and unposted uploads, and nobody else’s', async () => {
    const child = await person('child');
    const friend = await person('friend');
    const [a, b, pending, evidence] = [await upload(child), await upload(child), await upload(child), await upload(child)];
    const theirs = await upload(friend);
    expect((await post(child.token, { body: 'Du wêne', media: [{ mediaKey: a }, { mediaKey: b }] })).statusCode).toBe(201);
    expect((await post(child.token, { media: [{ mediaKey: evidence }] })).statusCode).toBe(201);
    expect((await post(friend.token, { media: [{ mediaKey: theirs }] })).statusCode).toBe(201);
    // a picture a scan holds as evidence is never deleted with the account
    await pool.query(
      `INSERT INTO image_scans (media_key, surface, action, preserve_evidence, model_version) VALUES ($1, 'feed', 'hard_block', true, 'test')`,
      [evidence],
    );

    const storage = memoryStorage();
    await new GdprService(pool, { storage }).closeNow(child.id, 'under_minimum_age');

    expect(await stored([a, b, pending, evidence, theirs])).toEqual([evidence, theirs].sort());
    const deleted = [a, b, pending].filter((key) => !storage.objects.has(key));
    expect(deleted).toHaveLength(3);
    const rows = await pool.query(
      `SELECT 1 FROM library_post_media m JOIN library_posts p ON p.id = m.post_id WHERE p.author_id = $1`,
      [child.id],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('takes a reported post’s pictures off the public bucket with the rest of a closed account’s, and keeps them as evidence', async () => {
    const child = await person('kept');
    const reader = await person('keptreader');
    const [a, b] = [await upload(child), await upload(child)];
    const shown = (await post(child.token, { body: 'Wêne', media: [{ mediaKey: a }, { mediaKey: b }] })).json();
    await app.inject({
      method: 'POST',
      url: `/library/posts/${shown.id}/report`,
      payload: { reason: 'spam' },
      headers: { authorization: `Bearer ${reader.token}` },
      remoteAddress: ip(),
    });
    // kept for the moderator, though no post shows it any more
    await app.inject({
      method: 'PATCH',
      url: `/library/posts/${shown.id}`,
      payload: { media: [{ mediaKey: a }] },
      headers: { authorization: `Bearer ${child.token}` },
      remoteAddress: ip(),
    });
    expect((await pool.query(`SELECT confirmed_at FROM media_uploads WHERE key = $1`, [b])).rows[0].confirmed_at).not.toBeNull();
    // and a picture post the way the installed apps make one: its upload is
    // both the post's picture and one of theirs, and goes once
    const old = await upload(child);
    const picturePost = await app.inject({
      method: 'POST',
      url: '/images',
      payload: { imageMediaId: old, category: 'image' },
      headers: { authorization: `Bearer ${child.token}` },
      remoteAddress: ip(),
    });
    expect(picturePost.statusCode).toBe(201);

    const storage = new FakeStorage();
    for (const key of [a, b, old]) storage.upload(key);
    await new GdprService(pool, { storage: storage.asStorage }).closeNow(child.id, 'under_minimum_age');
    // the report's snapshot holds both pictures of the reported post — the
    // one still on it and the one taken off — so they are not deleted with
    // the account but moved to private storage, no longer served; the old
    // picture post's upload goes
    expect(await stored([a, b, old])).toEqual([a, b].sort());
    for (const key of [a, b]) {
      expect(storage.publicObjects.has(key)).toBe(false);
      expect(storage.evidence.has(evidenceObjectKey(key))).toBe(true);
    }
    const kept = await pool.query<{ orphan: boolean; preserve_evidence: boolean; quarantine_state: string | null }>(
      `SELECT confirmed_at IS NULL AS orphan, preserve_evidence, quarantine_state FROM media_uploads WHERE key = ANY($1)`,
      [[a, b]],
    );
    expect(kept.rows).toEqual([
      { orphan: true, preserve_evidence: true, quarantine_state: 'done' },
      { orphan: true, preserve_evidence: true, quarantine_state: 'done' },
    ]);
    expect(storage.publicObjects.has(old)).toBe(false);
  });

  it('exports someone’s posts with links to their pictures, drafts and removed ones too', async () => {
    const me = await person('exporter');
    const [a, b] = [await upload(me), await upload(me)];
    const shown = (await post(me.token, { title: 'Wêneyên min', body: 'Rêz', media: [{ mediaKey: a, altText: 'Çiya' }, { mediaKey: b }], sourceCredit: 'Min' })).json();
    const draft = (await post(me.token, { body: 'Pêşnivîs', publish: false })).json();
    const old = await upload(me);
    await app.inject({
      method: 'POST',
      url: '/images',
      payload: { imageMediaId: old, caption: 'kevn', category: 'image' },
      headers: { authorization: `Bearer ${me.token}` },
      remoteAddress: ip(),
    });

    const doc = await new GdprService(pool, { storage: memoryStorage('https://cdn.test') }).buildExport(me.id);
    const posts = doc.posts as { written: Array<Record<string, unknown>>; pictures: Array<Record<string, unknown>> };
    expect(posts.written.map((p) => p.id)).toEqual([shown.id, draft.id]);
    expect(posts.written[0]).toMatchObject({
      type: 'story',
      title: 'Wêneyên min',
      body: 'Rêz',
      status: 'published',
      sourceCredit: 'Min',
      meme: false,
      pictures: [
        { url: `https://cdn.test/${a}`, altText: 'Çiya' },
        { url: `https://cdn.test/${b}`, altText: null },
      ],
    });
    expect(posts.written[1]).toMatchObject({ status: 'draft', pictures: [] });
    expect(posts.pictures).toEqual([expect.objectContaining({ url: `https://cdn.test/${old}`, caption: 'kevn', category: 'image' })]);

    // without storage there are no links to give, but the posts are still there
    const bare = (await new GdprService(pool).buildExport(me.id)).posts as typeof posts;
    expect(bare.written[0]!.pictures).toEqual([
      { url: null, altText: 'Çiya' },
      { url: null, altText: null },
    ]);
  });
});
