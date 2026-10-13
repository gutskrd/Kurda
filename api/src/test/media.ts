import type pg from 'pg';
import type { MediaStorage } from '../media/storage.js';

/**
 * A picture upload as `POST /images/upload` leaves it: owned by the uploader,
 * through the scan, and unconfirmed until a post uses it.
 *
 * Written straight into the table, because the route needs a bucket that the
 * integration database runs without — and what a post checks is this row
 * (media/postMedia.ts). Re-seeding a key hands it to the new owner, unused, so
 * suites with fixed keys can run again on the same database.
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
 * A bucket that keeps what is put in it in memory, for the routes that need
 * storage to run at all (`POST /images/upload` answers 503 without it).
 *
 * Decorate an app built without S3 settings with it before `ready()`:
 * `app.decorate('storage', memoryStorage())`. The real bucket's behaviour is
 * covered by the suites that run against MinIO.
 */
export function memoryStorage(base = 'https://cdn.test'): MediaStorage & { objects: Map<string, Buffer> } {
  const objects = new Map<string, Buffer>();
  const storage = {
    objects,
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
  };
  return storage as unknown as MediaStorage & { objects: Map<string, Buffer> };
}
