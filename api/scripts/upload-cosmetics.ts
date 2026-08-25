/**
 * One-off ops script: upload profile-background assets to R2 under the
 * `backgrounds/` prefix, reusing the existing MediaStorage abstraction (same
 * bucket + credentials as profile photos — no new bucket, no secrets in code).
 *
 * Run locally with the R2 env vars set (never commit them):
 *   S3_ENDPOINT=… S3_BUCKET=mykurda-media S3_ACCESS_KEY_ID=… S3_SECRET_ACCESS_KEY=… \
 *   CDN_BASE_URL=https://media.mykurda.com \
 *   npx tsx api/scripts/upload-cosmetics.ts
 *
 * Idempotent: uploading the same file overwrites the same key. Backgrounds get
 * long-lived immutable caching via the storage layer's put(). Avatars + icons are
 * NOT uploaded here — they ship as web static assets (web/public/cosmetics).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { loadConfig } from '../src/config/env.js';
import { createStorage } from '../src/media/storage.js';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

async function main(): Promise<void> {
  const storage = createStorage(loadConfig());
  if (!storage) {
    console.error('Storage not configured — set S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY.');
    process.exit(1);
  }
  const dir = join(process.cwd(), 'mykurda-background');
  const files = readdirSync(dir).filter((f) => CONTENT_TYPES[extname(f).toLowerCase()]);
  if (files.length === 0) {
    console.error(`No background assets found in ${dir}`);
    process.exit(1);
  }
  for (const file of files) {
    const contentType = CONTENT_TYPES[extname(file).toLowerCase()]!;
    const key = `backgrounds/${file}`;
    await storage.put(key, readFileSync(join(dir, file)), contentType);
    console.log(`uploaded ${key} (${contentType})`);
  }
  console.log(`done: ${files.length} backgrounds → ${storage.publicUrl('backgrounds/<file>')}`);
}

void main();
