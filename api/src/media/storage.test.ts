import { describe, expect, it } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';
import { loadConfig } from '../config/env.js';
import {
  IMMUTABLE_CACHE_CONTROL,
  MAX_UPLOAD_BYTES,
  MediaStorage,
  PRIVATE_CACHE_CONTROL,
  cloudflarePurge,
  createStorage,
  mediaKey,
  preparePrivateStorage,
} from './storage.js';

const HASH = 'a'.repeat(64);

const offlineEnv = {
  NODE_ENV: 'test',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'kurda-test',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
};
const offlineConfig = loadConfig(offlineEnv);

describe('publicUrl', () => {
  it('derives a public URL as CDN_BASE_URL + "/" + key, with no double slash', () => {
    const key = `profile-photo/${HASH}.webp`;
    // explicit CDN base
    const storage = createStorage(
      loadConfig({
        NODE_ENV: 'test',
        S3_BUCKET: 'hevalo-media',
        S3_ACCESS_KEY_ID: 'x',
        S3_SECRET_ACCESS_KEY: 'y',
        CDN_BASE_URL: 'https://media.hevalo.app',
      }),
    )!;
    expect(storage.publicUrl(key)).toBe(`https://media.hevalo.app/profile-photo/${HASH}.webp`);
    expect(storage.publicUrl(key)).not.toContain('//profile-photo');
  });

  it('tolerates a CDN_BASE_URL with a trailing slash (no doubled slash in the URL)', () => {
    const storage = createStorage(
      loadConfig({
        NODE_ENV: 'test', // trailing-slash rejection only applies in production
        S3_BUCKET: 'hevalo-media',
        S3_ACCESS_KEY_ID: 'x',
        S3_SECRET_ACCESS_KEY: 'y',
        CDN_BASE_URL: 'https://media.hevalo.app/',
      }),
    )!;
    expect(storage.publicUrl('profile-photo/x.webp')).toBe('https://media.hevalo.app/profile-photo/x.webp');
  });

  it('falls back to the S3 endpoint/bucket when no CDN_BASE_URL is set', () => {
    expect(createStorage(offlineConfig)!.publicUrl('profile-photo/x.webp')).toBe(
      'http://localhost:9000/kurda-test/profile-photo/x.webp',
    );
  });
});

describe('mediaKey', () => {
  it('builds content-hashed keys with the right extension', () => {
    expect(mediaKey('lesson-audio', HASH, 'audio/mpeg')).toBe(`lesson-audio/${HASH}.mp3`);
    expect(mediaKey('avatar', HASH, 'image/webp')).toBe(`avatar/${HASH}.webp`);
  });

  it('rejects unsupported content types', () => {
    expect(() => mediaKey('avatar', HASH, 'application/x-msdownload')).toThrow(/unsupported/);
    expect(() => mediaKey('avatar', HASH, 'text/html')).toThrow(/unsupported/);
  });

  it('rejects malformed hashes and kinds', () => {
    expect(() => mediaKey('avatar', 'nothex', 'image/png')).toThrow(/sha256/);
    expect(() => mediaKey('../escape', HASH, 'image/png')).toThrow(/kind/);
    expect(() => mediaKey('UPPER', HASH, 'image/png')).toThrow(/kind/);
  });
});

describe('createStorage', () => {
  it('returns null when the S3 group is not configured', () => {
    expect(createStorage(loadConfig({ NODE_ENV: 'test' }))).toBeNull();
  });

  it('presigns PUT urls offline with immutable cache headers', async () => {
    const storage = createStorage(offlineConfig);
    expect(storage).not.toBeNull();
    const ticket = await storage!.createUploadUrl({
      kind: 'lesson-audio',
      contentType: 'audio/mpeg',
      contentLength: 1024,
      sha256Hex: HASH,
    });
    expect(ticket.key).toBe(`lesson-audio/${HASH}.mp3`);
    expect(ticket.uploadUrl).toContain('X-Amz-Signature=');
    expect(ticket.uploadUrl).toContain(ticket.key);
    expect(ticket.requiredHeaders['cache-control']).toBe(IMMUTABLE_CACHE_CONTROL);
    expect(ticket.publicUrl).toBe(`http://localhost:9000/kurda-test/${ticket.key}`);
    expect(ticket.expiresInSeconds).toBe(300);
  });

  it('rejects oversized and empty uploads', async () => {
    const storage = createStorage(offlineConfig)!;
    await expect(
      storage.createUploadUrl({
        kind: 'avatar',
        contentType: 'image/png',
        contentLength: MAX_UPLOAD_BYTES + 1,
        sha256Hex: HASH,
      }),
    ).rejects.toThrow(/contentLength/);
    await expect(
      storage.createUploadUrl({
        kind: 'avatar',
        contentType: 'image/png',
        contentLength: 0,
        sha256Hex: HASH,
      }),
    ).rejects.toThrow(/contentLength/);
  });
});

describe('evidence storage', () => {
  /** An S3 client that records what it was asked to do. */
  function recording() {
    const sent: Array<{ name: string; input: Record<string, unknown> }> = [];
    const send = async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) =>
      void sent.push({ name: cmd.constructor.name, input: cmd.input });
    return { sent, s3: { send } as unknown as S3Client };
  }

  it('copies into the private evidence bucket, uncached, and deletes from there', async () => {
    const { sent, s3 } = recording();
    const storage = new MediaStorage(s3, 'hevalo-media', 'https://media.hevalo.app', { evidenceBucket: 'hevalo-evidence' });
    await storage.copyToEvidence('image-post/x.webp', 'quarantine/abc/image-post/x.webp', 'image/webp');
    await storage.deleteEvidence('quarantine/abc/image-post/x.webp');
    expect(sent[0]).toEqual({
      name: 'CopyObjectCommand',
      input: {
        Bucket: 'hevalo-evidence',
        Key: 'quarantine/abc/image-post/x.webp',
        CopySource: 'hevalo-media/image-post/x.webp',
        MetadataDirective: 'REPLACE',
        CacheControl: PRIVATE_CACHE_CONTROL,
        ContentType: 'image/webp',
      },
    });
    expect(sent[1]).toEqual({ name: 'DeleteObjectCommand', input: { Bucket: 'hevalo-evidence', Key: 'quarantine/abc/image-post/x.webp' } });
  });

  it('without an evidence bucket, keeps evidence privately in the main one', async () => {
    const { sent, s3 } = recording();
    const storage = new MediaStorage(s3, 'hevalo-media', 'https://media.hevalo.app');
    await storage.copyToEvidence('image-post/x.webp', 'quarantine/abc/image-post/x.webp');
    expect(sent[0]!.input).toMatchObject({ Bucket: 'hevalo-media', CacheControl: PRIVATE_CACHE_CONTROL });
    expect(sent[0]!.input).not.toHaveProperty('ContentType');
  });

  it('asks the CDN to forget the public URLs, and says when it cannot', async () => {
    const { s3 } = recording();
    const asked: string[][] = [];
    const storage = new MediaStorage(s3, 'b', 'https://media.hevalo.app', {
      purge: async (urls) => {
        asked.push(urls);
        return true;
      },
    });
    expect(await storage.purgePublic(['image-post/x.webp'])).toBe(true);
    expect(asked).toEqual([['https://media.hevalo.app/image-post/x.webp']]);
    expect(await new MediaStorage(s3, 'b', 'https://m').purgePublic(['k'])).toBeNull();
    const failing = new MediaStorage(s3, 'b', 'https://m', {
      purge: async () => {
        throw new Error('down');
      },
    });
    expect(await failing.purgePublic(['k'])).toBe(false);
  });

  it('purges through Cloudflare by URL with the zone token', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    expect(await cloudflarePurge('zone1', 'tok', fetchFn)(['https://media.hevalo.app/a.webp'])).toBe(true);
    expect(calls[0]!.url).toBe('https://api.cloudflare.com/client/v4/zones/zone1/purge_cache');
    expect(calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer tok' });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ files: ['https://media.hevalo.app/a.webp'] });
  });

  it('is configured from the environment', () => {
    const storage = createStorage(
      loadConfig({ ...offlineEnv, S3_EVIDENCE_BUCKET: 'kurda-evidence', CDN_PURGE_ZONE_ID: 'z', CDN_PURGE_API_TOKEN: 't' }),
    )!;
    expect((storage as unknown as { options: { evidenceBucket?: string; purge?: unknown } }).options).toMatchObject({
      evidenceBucket: 'kurda-evidence',
      purge: expect.any(Function),
    });
  });
});

describe('the private bucket', () => {
  type Input = Record<string, string | undefined> & { Bucket: string; Key?: string; CopySource?: string; Prefix?: string; ContinuationToken?: string };

  /**
   * Two buckets in memory behind a real client — so links are really signed —
   * whose requests are answered here. Listing pages two keys at a time.
   */
  function buckets(initial: Record<string, string[]>) {
    const store = new Map<string, Map<string, { cacheControl?: string }>>();
    const bucket = (name: string) => {
      if (!store.has(name)) store.set(name, new Map());
      return store.get(name)!;
    };
    for (const [name, keys] of Object.entries(initial)) for (const key of keys) bucket(name).set(key, {});
    let refusing: string | null = null;
    const s3 = new S3Client({ region: 'auto', endpoint: 'http://localhost:9000', forcePathStyle: true, credentials: { accessKeyId: 'x', secretAccessKey: 'y' } });
    (s3 as unknown as { send: unknown }).send = async (cmd: { constructor: { name: string }; input: Input }) => {
      const i = cmd.input;
      switch (cmd.constructor.name) {
        case 'HeadObjectCommand':
          if (!bucket(i.Bucket).has(i.Key!)) throw Object.assign(new Error('not found'), { name: 'NotFound' });
          return {};
        case 'PutObjectCommand':
          if (refusing === i.Bucket) throw Object.assign(new Error('denied'), { name: 'AccessDenied' });
          bucket(i.Bucket).set(i.Key!, { cacheControl: i.CacheControl });
          return {};
        case 'CopyObjectCommand': {
          const [from, ...rest] = i.CopySource!.split('/');
          if (!bucket(from!).has(rest.join('/'))) throw new Error('NoSuchKey');
          bucket(i.Bucket).set(i.Key!, { cacheControl: i.CacheControl });
          return {};
        }
        case 'DeleteObjectCommand':
          bucket(i.Bucket).delete(i.Key!);
          return {};
        case 'ListObjectsV2Command': {
          // as S3 does: the token marks the last key listed, so deleting what
          // was listed does not shift the next page
          const after = i.ContinuationToken ?? '';
          const keys = [...bucket(i.Bucket).keys()].filter((k) => k.startsWith(i.Prefix!) && k > after).sort();
          const page = keys.slice(0, 2);
          return { Contents: page.map((Key) => ({ Key })), IsTruncated: keys.length > 2, NextContinuationToken: page.at(-1) };
        }
      }
      throw new Error(`unexpected ${cmd.constructor.name}`);
    };
    return { s3, keys: (name: string) => [...bucket(name).keys()].sort(), meta: (name: string, key: string) => bucket(name).get(key), refuse: (name: string) => (refusing = name) };
  }

  const EXPORT = `user-export/${HASH}.json`;
  const EVIDENCE = 'quarantine/abc/image-post/x.webp';

  it('keeps a data export there, and signs its link there', async () => {
    const b = buckets({});
    const storage = new MediaStorage(b.s3, 'pub', 'https://media.hevalo.app', { evidenceBucket: 'priv' });
    await storage.putPrivate(EXPORT, Buffer.from('{}'), 'application/json');
    expect(b.keys('priv')).toEqual([EXPORT]);
    expect(b.keys('pub')).toEqual([]);
    expect(b.meta('priv', EXPORT)!.cacheControl).toBe(PRIVATE_CACHE_CONTROL);
    expect(await storage.createPrivateDownloadUrl(EXPORT)).toContain(`/priv/${EXPORT}?`);
  });

  it('still finds an export or evidence kept in the public bucket before there was a private one', async () => {
    const b = buckets({ pub: [EXPORT, EVIDENCE] });
    const storage = new MediaStorage(b.s3, 'pub', 'https://media.hevalo.app', { evidenceBucket: 'priv' });
    expect(await storage.createPrivateDownloadUrl(EXPORT)).toContain(`/pub/${EXPORT}?`);
    expect(await storage.evidenceExists(EVIDENCE)).toBe(true);
    expect(await storage.createEvidenceDownloadUrl(EVIDENCE)).toContain(`/pub/${EVIDENCE}?`);
  });

  it('deletes a private file from wherever it is kept', async () => {
    const b = buckets({ pub: [EXPORT, EVIDENCE], priv: [EXPORT, EVIDENCE] });
    const storage = new MediaStorage(b.s3, 'pub', 'https://media.hevalo.app', { evidenceBucket: 'priv' });
    await storage.delete(EXPORT);
    await storage.deleteEvidence(EVIDENCE);
    expect(b.keys('pub')).toEqual([]);
    expect(b.keys('priv')).toEqual([]);
  });

  it('moves the private files out of the public bucket, every page of them, and has the CDN forget them', async () => {
    const quarantined = ['quarantine/a/x.webp', 'quarantine/b/y.webp', 'quarantine/c/z.webp'];
    const b = buckets({ pub: [...quarantined, EXPORT, 'image-post/kept.webp'] });
    const forgotten: string[] = [];
    const storage = new MediaStorage(b.s3, 'pub', 'https://media.hevalo.app', {
      evidenceBucket: 'priv',
      purge: async (urls) => {
        forgotten.push(...urls);
        return true;
      },
    });
    expect(await storage.movePrivateFiles()).toEqual({ moved: 4, failed: 0 });
    // what everyone may see stays where it is
    expect(b.keys('pub')).toEqual(['image-post/kept.webp']);
    expect(b.keys('priv')).toEqual([...quarantined, EXPORT].sort());
    for (const key of b.keys('priv')) expect(b.meta('priv', key)!.cacheControl).toBe(PRIVATE_CACHE_CONTROL);
    expect(forgotten.sort()).toEqual([...quarantined, EXPORT].map((k) => `https://media.hevalo.app/${k}`).sort());
  });

  it('keeps private files as before when the private bucket refuses a write, and says so', async () => {
    const b = buckets({});
    // a bucket of its own: a refusal holds for the whole process
    b.refuse('locked');
    const storage = new MediaStorage(b.s3, 'pub', 'https://media.hevalo.app', { evidenceBucket: 'locked' });
    const said: Array<{ level: string; obj: object }> = [];
    await preparePrivateStorage(storage, {
      info: (obj) => said.push({ level: 'info', obj }),
      error: (obj) => said.push({ level: 'error', obj }),
    });
    expect(said).toEqual([{ level: 'error', obj: { error: 'AccessDenied' } }]);
    expect(storage.hasPrivateBucket).toBe(false);
    await storage.putPrivate(EXPORT, Buffer.from('{}'), 'application/json');
    expect(b.keys('pub')).toEqual([EXPORT]);
    expect(b.meta('pub', EXPORT)!.cacheControl).toBe(PRIVATE_CACHE_CONTROL);
    // the background jobs' own storage, in the same process, keeps to that too
    const jobs = new MediaStorage(b.s3, 'pub', 'https://media.hevalo.app', { evidenceBucket: 'locked' });
    expect(jobs.hasPrivateBucket).toBe(false);
  });

  it('once the private bucket takes a write, moves what is waiting and says how much', async () => {
    const b = buckets({ pub: [EVIDENCE] });
    const storage = new MediaStorage(b.s3, 'pub', 'https://media.hevalo.app', { evidenceBucket: 'priv' });
    const said: Array<{ level: string; obj: object }> = [];
    await preparePrivateStorage(storage, {
      info: (obj) => said.push({ level: 'info', obj }),
      error: (obj) => said.push({ level: 'error', obj }),
    });
    expect(said).toEqual([{ level: 'info', obj: { moved: 1, failed: 0 } }]);
    // the write check leaves nothing behind
    expect(b.keys('priv')).toEqual([EVIDENCE]);
  });

  it('without one, checks and moves nothing', async () => {
    const b = buckets({ pub: [EVIDENCE] });
    const storage = new MediaStorage(b.s3, 'pub', 'https://media.hevalo.app');
    expect(storage.hasPrivateBucket).toBe(false);
    expect(await storage.checkPrivateBucket()).toBeNull();
    expect(await storage.movePrivateFiles()).toEqual({ moved: 0, failed: 0 });
    expect(b.keys('pub')).toEqual([EVIDENCE]);
  });
});
