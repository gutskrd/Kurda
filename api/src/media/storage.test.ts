import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env.js';
import {
  IMMUTABLE_CACHE_CONTROL,
  MAX_UPLOAD_BYTES,
  createStorage,
  mediaKey,
} from './storage.js';

const HASH = 'a'.repeat(64);

const offlineConfig = loadConfig({
  NODE_ENV: 'test',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'kurda-test',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
});

describe('publicUrl', () => {
  it('derives a public URL as CDN_BASE_URL + "/" + key, with no double slash', () => {
    const key = `profile-photo/${HASH}.webp`;
    // explicit CDN base
    const storage = createStorage(
      loadConfig({
        NODE_ENV: 'test',
        S3_BUCKET: 'mykurda-media',
        S3_ACCESS_KEY_ID: 'x',
        S3_SECRET_ACCESS_KEY: 'y',
        CDN_BASE_URL: 'https://media.mykurda.com',
      }),
    )!;
    expect(storage.publicUrl(key)).toBe(`https://media.mykurda.com/profile-photo/${HASH}.webp`);
    expect(storage.publicUrl(key)).not.toContain('//profile-photo');
  });

  it('tolerates a CDN_BASE_URL with a trailing slash (no doubled slash in the URL)', () => {
    const storage = createStorage(
      loadConfig({
        NODE_ENV: 'test', // trailing-slash rejection only applies in production
        S3_BUCKET: 'mykurda-media',
        S3_ACCESS_KEY_ID: 'x',
        S3_SECRET_ACCESS_KEY: 'y',
        CDN_BASE_URL: 'https://media.mykurda.com/',
      }),
    )!;
    expect(storage.publicUrl('profile-photo/x.webp')).toBe('https://media.mykurda.com/profile-photo/x.webp');
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
