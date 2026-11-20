import { Readable } from 'node:stream';
import type pg from 'pg';
import type { MediaStorage } from '../media/storage.js';

/**
 * A picture upload as `POST /images/upload` leaves it: owned by the uploader, scanned, and unconfirmed until a post
 * uses it. Written straight to the table, since the route needs a bucket the integration database lacks, and posts
 * check this row (media/postMedia.ts). Re-seeding a key hands it to the new owner unused, so fixed keys can rerun.
 */
export async function seedPictureUpload(
  pool: Pick<pg.Pool, 'query'>,
  key: string,
  uploaderId: string,
  opts: { scanStatus?: 'cleared' | 'gated' | 'blocked' | 'pending'; width?: number; height?: number } = {},
): Promise<string> {
  await pool.query(
    `INSERT INTO media_uploads (key, content_type, content_length, scan_status, uploader_id, kind, width, height)
     VALUES ($1, 'image/webp', 1024, $2, $3, 'image-post', $4, $5)
     ON CONFLICT (key) DO UPDATE SET confirmed_at = NULL, created_at = now(), content_type = 'image/webp',
       scan_status = EXCLUDED.scan_status, uploader_id = EXCLUDED.uploader_id, kind = 'image-post',
       width = EXCLUDED.width, height = EXCLUDED.height`,
    [key, opts.scanStatus ?? 'cleared', uploaderId, opts.width ?? 1280, opts.height ?? 720],
  );
  return key;
}

/**
 * An in-memory bucket for routes that need storage to run (`POST /images/upload` answers 503 without it). Decorate an
 * app built without S3 settings before `ready()`: `app.decorate('storage', memoryStorage())`. `objects` is the public
 * bucket and `evidence` the private one (held and refused pictures, quarantined evidence). Real-bucket behaviour is
 * covered by suites run against a real bucket.
 */
export function memoryStorage(base = 'https://cdn.test'): MediaStorage & { objects: Map<string, Buffer>; evidence: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  const evidence = new Map<string, Buffer>();
  const storage = {
    objects,
    evidence,
    hasPrivateBucket: true,
    publicUrl: (key: string) => `${base}/${key}`,
    put: async (key: string, body: Buffer) => {
      objects.set(key, body);
    },
    putPrivate: async (key: string, body: Buffer) => {
      objects.set(key, body);
    },
    delete: async (key: string) => {
      objects.delete(key);
    },
    exists: async (key: string) => objects.has(key),
    read: async (key: string) => (objects.has(key) ? { body: Readable.from([objects.get(key)!]), contentType: 'image/webp' } : null),
    putEvidence: async (target: string, body: Buffer) => {
      evidence.set(target, body);
    },
    copyToEvidence: async (key: string, target: string) => {
      const body = objects.get(key);
      if (!body) throw new Error('NoSuchKey');
      evidence.set(target, body);
    },
    publishFromEvidence: async (target: string, key: string) => {
      const body = evidence.get(target);
      if (!body) throw new Error('NoSuchKey');
      objects.set(key, body);
    },
    readEvidence: async (target: string) => evidence.get(target) ?? null,
    evidenceExists: async (target: string) => evidence.has(target),
    deleteEvidence: async (target: string) => {
      evidence.delete(target);
    },
    createDownloadUrl: async (key: string, ttl = 900) => `https://signed.test/public/${key}?ttl=${ttl}`,
    createEvidenceDownloadUrl: async (target: string, ttl = 300) => `https://signed.test/evidence/${target}?ttl=${ttl}`,
    purgePublic: async () => null,
  };
  return storage as unknown as MediaStorage & { objects: Map<string, Buffer>; evidence: Map<string, Buffer> };
}
