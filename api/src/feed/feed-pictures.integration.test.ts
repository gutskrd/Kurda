/**
 * The wall with pictures on written posts, against real Postgres: which half a
 * post is in now that a written post can have pictures, the Photos and Memes
 * filters over new and old picture posts together, and the card fields — the
 * new `images` list beside the `imageUrl` the installed apps read.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { buildApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { activate } from '../test/activate.js';
import { memoryStorage } from '../test/media.js';
import { FeedService } from './service.js';

const DATABASE_URL = process.env.DATABASE_URL;
const CDN = 'https://cdn.test';

interface Item {
  key: string;
  id: string;
  targetType: string;
  kind: string;
  title: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  images: Array<{ url: string; alt: string | null; width: number | null; height: number | null }>;
  meme: boolean;
  href: string;
}

describe.skipIf(!DATABASE_URL)('the wall with pictures on written posts (integration)', () => {
  const config = loadConfig({ DATABASE_URL, NODE_ENV: 'test', LOG_LEVEL: 'fatal' });
  let app: FastifyInstance;
  let pool: pg.Pool;
  const suffix = Date.now().toString(36);
  let authorId = '';
  let readerToken = '';
  const made: Record<string, string> = {};
  let minute = 0;

  const register = async (tag: string, ip: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `fp_${tag}_${suffix}@it.kurda.app`,
        username: `fp_${tag}_${suffix}`.slice(0, 30),
        password: 'a-strong-password1',
        acceptTerms: true,
        birthYear: 1990,
        birthMonth: 6,
      },
      remoteAddress: ip,
    });
    await activate(app, pool, res);
    return { id: res.json().user.id as string, token: res.json().tokens.accessToken as string };
  };

  /** A written post, older the earlier it is made, with pictures as the composer leaves them. */
  async function written(
    type: 'gotin' | 'story',
    body: string,
    pictures: Array<{ alt: string | null }>,
    opts: { title?: string; meme?: boolean } = {},
  ): Promise<string> {
    const id = (
      await pool.query<{ id: string }>(
        `INSERT INTO library_posts (author_id, author_role, type, title, body, language, status, published_at, is_meme)
         VALUES ($1, 'user', $2, $3, $4, 'kmr', 'published', now() - ($5 || ' minutes')::interval, $6) RETURNING id`,
        [authorId, type, opts.title ?? null, body, String(60 - ++minute), opts.meme ?? false],
      )
    ).rows[0]!.id;
    for (const [position, p] of pictures.entries()) {
      await pool.query(
        `INSERT INTO library_post_media (post_id, position, media_key, alt_text, width, height) VALUES ($1, $2, $3, $4, 1280, 720)`,
        [id, position, `image-post/fp-${suffix}-${id}-${position}.webp`, p.alt],
      );
    }
    return id;
  }

  async function oldPicture(category: 'image' | 'meme'): Promise<string> {
    return (
      await pool.query<{ id: string }>(
        `INSERT INTO image_posts (author_id, author_role, image_media_id, caption, category, created_at)
         VALUES ($1, 'user', $2, $3, $4, now() - ($5 || ' minutes')::interval) RETURNING id`,
        [authorId, `image-post/fp-${suffix}-old-${category}.webp`, `old ${category}`, category, String(60 - ++minute)],
      )
    ).rows[0]!.id;
  }

  const get = (url: string, token?: string) =>
    app.inject({ method: 'GET', url, headers: token ? { authorization: `Bearer ${token}` } : {}, remoteAddress: '10.154.0.9' });
  /** This suite's own posts, by the names they were made under, in wall order. */
  const names = (items: Item[]): string[] =>
    items.flatMap((i) => Object.entries(made).filter(([, id]) => id === i.id).map(([name]) => name));
  const wall = async (query: string): Promise<Item[]> => (await get(`/feed?limit=50&${query}`)).json().items;
  const card = async (name: string): Promise<Item> => (await wall('')).find((i) => i.id === made[name])!;

  beforeAll(async () => {
    app = buildApp(config);
    app.decorate('storage', memoryStorage(CDN));
    await app.ready();
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    authorId = (await register('author', '10.154.0.1')).id;
    readerToken = (await register('reader', '10.154.0.2')).token;

    made.words = await written('gotin', 'Tenê gotin.', []);
    made.photoWithWords = await written('gotin', 'Êvara li Amedê.', [{ alt: 'Sûr at dusk' }, { alt: null }]);
    made.photoOnly = await written('gotin', '', [{ alt: 'A mountain' }]);
    made.meme = await written('gotin', 'Dema ku…', [{ alt: null }], { meme: true });
    made.story = await written('story', 'Çîrokek bi wêne.', [{ alt: 'Cover' }], { title: `Story ${suffix}` });
    made.oldPhoto = await oldPicture('image');
    made.oldMeme = await oldPicture('meme');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE email LIKE '%_${suffix}@it.kurda.app'`);
    await pool.end();
    await app.close();
  });

  it('puts every post on the wall once, newest first', async () => {
    expect(names(await wall(''))).toEqual(['oldMeme', 'oldPhoto', 'story', 'meme', 'photoOnly', 'photoWithWords', 'words']);
  });

  it('puts posts with words in the written half, and leaves memes and bare pictures out', async () => {
    expect(names(await wall('section=gotin'))).toEqual(['story', 'photoWithWords', 'words']);
    expect(names(await wall('kind=gotin'))).toEqual(['photoWithWords', 'words']);
    expect(names(await wall('kind=cirok'))).toEqual(['story']);
  });

  it('puts every post with pictures in the pictured half, old and new', async () => {
    expect(names(await wall('section=dimen'))).toEqual(['oldMeme', 'oldPhoto', 'story', 'meme', 'photoOnly', 'photoWithWords']);
  });

  it('finds photos and memes across both kinds of post', async () => {
    expect(names(await wall('kind=wene'))).toEqual(['oldPhoto', 'story', 'photoOnly', 'photoWithWords']);
    expect(names(await wall('kind=mim'))).toEqual(['oldMeme', 'meme']);
    expect(names(await wall('section=dimen&kind=mim'))).toEqual(['oldMeme', 'meme']);
  });

  it('carries the pictures in order, with their alt text and size', async () => {
    const item = await card('photoWithWords');
    const key = (position: number) => `image-post/fp-${suffix}-${made.photoWithWords}-${position}.webp`;
    expect(item.images).toEqual([
      { url: `${CDN}/${key(0)}`, alt: 'Sûr at dusk', width: 1280, height: 720 },
      { url: `${CDN}/${key(1)}`, alt: null, width: 1280, height: 720 },
    ]);
    expect(item.imageAlt).toBe('Sûr at dusk');
    expect(item.meme).toBe(false);
    expect((await card('meme')).meme).toBe(true);
    expect((await card('words')).images).toEqual([]);
  });

  it('still reads right to an app installed before posts had pictures', async () => {
    const item = await card('photoWithWords');
    // a written post stays a written post: same target, same page, same kind
    expect(item).toMatchObject({
      key: `library:${made.photoWithWords}`,
      targetType: 'library',
      kind: 'gotin',
      href: `/app/library/${made.photoWithWords}`,
      excerpt: 'Êvara li Amedê.',
      title: null,
    });
    // and the first picture is where those apps look for one
    expect(item.imageUrl).toBe(item.images[0]!.url);

    const words = await card('words');
    expect(words.imageUrl).toBeNull();
    expect(words.imageAlt).toBeNull();
  });

  it('gives an old picture post the same fields, with no alt text to give', async () => {
    const item = await card('oldPhoto');
    expect(item).toMatchObject({ targetType: 'image', kind: 'image', href: `/app/dimen/${made.oldPhoto}`, meme: false, imageAlt: null });
    expect(item.images).toEqual([{ url: item.imageUrl, alt: null, width: null, height: null }]);
    expect((await card('oldMeme')).meme).toBe(true);
  });

  it('shows the pictures on saved posts and a profile’s posts too', async () => {
    await app.inject({
      method: 'POST',
      url: `/posts/library/${made.photoOnly}/bookmark`,
      headers: { authorization: `Bearer ${readerToken}` },
      remoteAddress: '10.154.0.9',
    });
    const saved = (await get('/me/saved', readerToken)).json().items as Item[];
    expect(saved.find((i) => i.id === made.photoOnly)!.images).toHaveLength(1);

    const theirs = await new FeedService(pool).byAuthor(authorId, { publicUrl: (k) => `${CDN}/${k}` });
    expect(theirs.find((i) => i.id === made.story)!.images.map((p) => p.alt)).toEqual(['Cover']);
  });
});
