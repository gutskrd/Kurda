import { describe, expect, it } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { loadConfig } from '../config/env.js';
import {
  IMMUTABLE_CACHE_CONTROL,
  MAX_UPLOAD_BYTES,
  MediaStorage,
  PRIVATE_CACHE_CONTROL,
  cloudflarePurge,
  createStorage,
  mediaKey,
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
