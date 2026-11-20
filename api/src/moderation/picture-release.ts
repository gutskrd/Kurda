import type { PictureSurface } from '@kurda/shared';
import type { MediaStorage } from '../media/storage.js';
import { letterNoticeText, type LetterNoticeHow } from '../letters/notice.js';
import { surfaceOfKind } from './image-scan.js';
import { pictureReviewNotice } from './notices.js';
import { evidenceObjectKey } from './pseudonym.js';
import { deliverNotice } from './sanctions-service.js';
import type { Executor } from './tx.js';

/**
 * The one way a picture becomes public after a person (or a second automatic look) cleared it, and the storage steps
 * around holding and releasing pictures. In the decision's transaction `releasePicture` clears it and publishes what
 * waited for it (a held post, a waiting profile or group photo swapped in, a held letter delivered); after the commit
 * `runPicturePublishing` copies its bytes from private storage to the public bucket, and the five-minute sweep
 * retries what failed. A picture hidden by reports is moved the other way by `runHoldMoves`.
 */

export interface ReleasedPicture {
  ownerId: string | null;
  surface: PictureSurface;
  /** the post, group or letter it belongs to, when there is one */
  target: string | null;
}

export interface ReleaseOptions {
  /** the same bytes under other keys that were taken down with it */
  copies?: string[];
  /** tell the owner it was checked and is fine; `asked`, for a refusal they asked about: they can share it now */
  notify?: 'held' | 'asked' | false;
}

/**
 * Clear a picture and publish what used it, in the caller's transaction. Idempotent: a picture already clear with
 * nothing waiting changes nothing but the notice.
 */
export async function releasePicture(db: Executor, key: string, opts: ReleaseOptions = {}): Promise<ReleasedPicture | null> {
  const keys = [...new Set([key, ...(opts.copies ?? [])])];
  const found = await db.query<{ key: string; kind: string | null; uploader_id: string | null }>(
    `SELECT key, kind, uploader_id FROM media_uploads WHERE key = ANY($1::text[]) ORDER BY key FOR UPDATE`,
    [keys],
  );
  const own = found.rows.find((r) => r.key === key);
  if (!own) return null;
  // Where the bytes are now: a private copy (held, refused, or quarantined) is published after the commit. A move to
  // quarantine still on its way may delete the public object after this, so its private copy is published too.
  await db.query(
    `UPDATE media_uploads m SET scan_status = 'cleared',
            private_key = COALESCE(m.private_key, m.quarantine_key, CASE WHEN m.quarantine_state = 'pending' THEN t.target END),
            publish_state = CASE WHEN COALESCE(m.private_key, m.quarantine_key) IS NOT NULL OR m.quarantine_state = 'pending'
                                 THEN 'pending' END,
            quarantine_state = NULL, quarantine_key = NULL, quarantined_at = NULL, cdn_purged = NULL
       FROM unnest($1::text[], $2::text[]) AS t(key, target)
      WHERE m.key = t.key`,
    [keys, keys.map(evidenceObjectKey)],
  );

  let target: string | null = null;
  const picturePosts = await db.query<{ id: string }>(
    `UPDATE image_posts SET status = 'published', updated_at = now()
      WHERE image_media_id = ANY($1::text[]) AND status = 'held' RETURNING id`,
    [keys],
  );
  target ??= picturePosts.rows[0]?.id ?? null;
  // a written post waits for every one of its pictures
  const written = await db.query<{ id: string }>(
    `UPDATE library_posts p SET status = 'published', published_at = COALESCE(p.published_at, now()), updated_at = now()
      WHERE p.status = 'held'
        AND EXISTS (SELECT 1 FROM library_post_media pm WHERE pm.post_id = p.id AND pm.media_key = ANY($1::text[]))
        AND NOT EXISTS (SELECT 1 FROM library_post_media pm JOIN media_uploads m ON m.key = pm.media_key
                         WHERE pm.post_id = p.id AND m.scan_status <> 'cleared')
      RETURNING p.id`,
    [keys],
  );
  target ??= written.rows[0]?.id ?? null;
  if (!target) {
    // still the post it belongs to, when it waits on another picture or is live already
    const post = await db.query<{ id: string }>(
      `SELECT id FROM image_posts WHERE image_media_id = $1 AND status <> 'removed'
       UNION ALL SELECT pm.post_id FROM library_post_media pm JOIN library_posts p ON p.id = pm.post_id
                  WHERE pm.media_key = $1 AND p.status <> 'removed'
       LIMIT 1`,
      [key],
    );
    target = post.rows[0]?.id ?? null;
  }

  // a profile photo that waited is swapped in, and the one it replaces goes to the orphan sweep unless still used
  const photos = await db.query<{ id: string; old: string | null }>(
    `UPDATE users u SET profile_photo_key = u.pending_profile_photo_key, pending_profile_photo_key = NULL
       FROM (SELECT id, profile_photo_key FROM users WHERE pending_profile_photo_key = ANY($1::text[]) FOR UPDATE) o
      WHERE u.id = o.id RETURNING u.id, o.profile_photo_key AS old`,
    [keys],
  );
  const groups = await db.query<{ id: string; old: string | null }>(
    `UPDATE groups g SET photo_key = g.pending_photo_key, photo_set_by = COALESCE(g.pending_photo_set_by, g.photo_set_by),
            pending_photo_key = NULL, pending_photo_set_by = NULL
       FROM (SELECT id, photo_key FROM groups WHERE pending_photo_key = ANY($1::text[]) AND archived_at IS NULL FOR UPDATE) o
      WHERE g.id = o.id RETURNING g.id, o.photo_key AS old`,
    [keys],
  );
  if (photos.rows.length > 0 || groups.rows.length > 0) {
    await db.query(`UPDATE media_uploads SET confirmed_at = COALESCE(confirmed_at, now()) WHERE key = ANY($1::text[])`, [keys]);
    const replaced = [...photos.rows, ...groups.rows].map((r) => r.old).filter((k): k is string => k !== null && !keys.includes(k));
    if (replaced.length > 0) {
      await db.query(
        `UPDATE media_uploads m SET confirmed_at = NULL, created_at = now()
          WHERE m.key = ANY($1::text[])
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.profile_photo_key = m.key OR u.pending_profile_photo_key = m.key)
            AND NOT EXISTS (SELECT 1 FROM groups g WHERE g.photo_key = m.key OR g.pending_photo_key = m.key)`,
        [replaced],
      );
    }
  }
  target ??= groups.rows[0]?.id ?? null;
  if (!target && surfaceOfKind(own.kind) === 'group_photo') {
    const g = await db.query<{ id: string }>(`SELECT id FROM groups WHERE photo_key = $1 LIMIT 1`, [key]);
    target = g.rows[0]?.id ?? null;
  }

  const letters = await deliverHeldLetters(db, keys);
  target ??= letters[0] ?? null;

  const released: ReleasedPicture = { ownerId: own.uploader_id, surface: surfaceOfKind(own.kind), target };
  if (opts.notify && released.ownerId) {
    await deliverNotice(db, released.ownerId, pictureReviewNotice('approved', released.surface, released.target, opts.notify === 'asked'));
  }
  return released;
}

/** Letters whose drawing waited for a person: delivered now, and their reader told as a letter's arrival always is. */
async function deliverHeldLetters(db: Executor, keys: string[]): Promise<string[]> {
  const sent = await db.query<{ id: string; sender_id: string; recipient_id: string | null; thread_id: string | null; answer: boolean }>(
    `UPDATE letters l SET status = 'delivered', delivered_at = now()
      WHERE l.drawing_key = ANY($1::text[]) AND l.status = 'held' AND l.recipient_id IS NOT NULL
      RETURNING l.id, l.sender_id, l.recipient_id, l.thread_id,
                EXISTS (SELECT 1 FROM letter_visits v WHERE v.answer_id = l.id) AS answer`,
    [keys],
  );
  for (const letter of sent.rows) {
    if (letter.thread_id) await db.query(`UPDATE letter_threads SET last_letter_at = now() WHERE id = $1`, [letter.thread_id]);
    if (!letter.recipient_id) continue;
    const people = await db.query<{ id: string; name: string; locale: string | null }>(
      `SELECT id, COALESCE(NULLIF(btrim(display_name), ''), username) AS name, locale FROM users WHERE id = ANY($1::uuid[])`,
      [[letter.sender_id, letter.recipient_id]],
    );
    const sender = people.rows.find((p) => p.id === letter.sender_id);
    const reader = people.rows.find((p) => p.id === letter.recipient_id);
    if (!sender || !reader) continue;
    const how: LetterNoticeHow = letter.answer ? 'home' : 'window';
    const words = letterNoticeText(how, sender.name, reader.locale);
    await db.query(
      `INSERT INTO notifications (user_id, category, title, body, data) VALUES ($1, 'letters', $2, $3, $4::jsonb)`,
      [
        reader.id,
        words.title,
        words.body,
        JSON.stringify({ kind: 'letter', threadId: letter.thread_id, fromUserId: letter.sender_id, how, letterId: letter.id }),
      ],
    );
  }
  return sent.rows.map((l) => l.id);
}

interface Log {
  warn: (obj: unknown, msg: string) => void;
}

/**
 * Copy approved pictures from private storage to the public bucket; returns how many finished. Never throws: without
 * storage nothing moves, and a failure stays pending for the sweep. The private copy goes once the public one is in
 * place, unless something must keep it (a report's evidence, a child-safety hit).
 */
export async function runPicturePublishing(
  db: Executor,
  storage: MediaStorage | null | undefined,
  opts: { keys?: string[]; log?: Log; limit?: number } = {},
): Promise<number> {
  if (!storage) return 0;
  if (opts.keys && opts.keys.length === 0) return 0;
  const pending = await db.query<{ key: string; content_type: string; private_key: string | null; preserve_evidence: boolean }>(
    `SELECT key, content_type, private_key, preserve_evidence FROM media_uploads
      WHERE publish_state = 'pending' AND ($1::text[] IS NULL OR key = ANY($1::text[]))
      ORDER BY key LIMIT $2`,
    [opts.keys ?? null, opts.limit ?? 100],
  );
  let done = 0;
  for (const row of pending.rows) {
    try {
      if (row.private_key && (await storage.evidenceExists(row.private_key))) {
        await storage.publishFromEvidence(row.private_key, row.key, row.content_type);
        if (!row.preserve_evidence) await storage.deleteEvidence(row.private_key);
      }
      await db.query(
        `UPDATE media_uploads SET publish_state = NULL, private_key = CASE WHEN preserve_evidence THEN private_key END
          WHERE key = $1 AND publish_state = 'pending'`,
        [row.key],
      );
      done++;
    } catch (err) {
      opts.log?.warn({ err, key: row.key }, 'could not publish an approved picture yet; the sweep will retry');
    }
  }
  return done;
}

/**
 * Move pictures hidden by reports off the public bucket: copied to private storage, the public object deleted and the
 * CDN asked to forget it. Never throws; what fails is retried by the sweep.
 */
export async function runHoldMoves(
  db: Executor,
  storage: MediaStorage | null | undefined,
  opts: { keys?: string[]; log?: Log; limit?: number } = {},
): Promise<number> {
  if (!storage) return 0;
  if (opts.keys && opts.keys.length === 0) return 0;
  const due = await db.query<{ key: string; content_type: string }>(
    `SELECT key, content_type FROM media_uploads
      WHERE scan_status = 'held' AND private_key IS NULL AND ($1::text[] IS NULL OR key = ANY($1::text[]))
      ORDER BY key LIMIT $2`,
    [opts.keys ?? null, opts.limit ?? 100],
  );
  let done = 0;
  for (const row of due.rows) {
    try {
      const target = evidenceObjectKey(row.key);
      if (await storage.exists(row.key)) {
        await storage.copyToEvidence(row.key, target, row.content_type);
        await storage.delete(row.key);
        await storage.purgePublic([row.key]);
      }
      if (await storage.evidenceExists(target)) {
        await db.query(`UPDATE media_uploads SET private_key = $2 WHERE key = $1 AND scan_status = 'held' AND private_key IS NULL`, [row.key, target]);
        done++;
      }
    } catch (err) {
      opts.log?.warn({ err, key: row.key }, 'could not move a hidden picture off the public bucket yet; the sweep will retry');
    }
  }
  return done;
}

/** What a picture's owner opens to see it while nobody else can: a short-lived private link, or its public address once clear. */
export async function ownerPictureUrl(db: Executor, storage: MediaStorage | null | undefined, key: string, ttlSeconds = 600): Promise<string | null> {
  if (!storage) return null;
  const r = await db.query<{ scan_status: string; private_key: string | null; quarantine_key: string | null }>(
    `SELECT scan_status, private_key, quarantine_key FROM media_uploads WHERE key = $1`,
    [key],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (row.scan_status === 'cleared' && !row.quarantine_key) return storage.publicUrl(key);
  const target = row.private_key ?? row.quarantine_key;
  if (target) return storage.createEvidenceDownloadUrl(target, ttlSeconds).catch(() => null);
  // still on the public bucket, on its way to private storage
  return storage.createDownloadUrl(key, ttlSeconds).catch(() => null);
}

/** A picture's bytes as a moderator's console fetches them. */
export interface StoredPicture {
  bytes: Buffer;
  contentType: string;
}

/** The longest picture a moderator's fetch reads, well above any stored upload. */
const MAX_READ_BYTES = 8 * 1024 * 1024;

/** A file's bytes from wherever it is kept now: private storage (held, refused, quarantined) or the public bucket. */
export async function readStoredPicture(db: Executor, storage: MediaStorage | null | undefined, key: string): Promise<StoredPicture | null> {
  if (!storage) return null;
  const m = await db.query<{ content_type: string; private_key: string | null; quarantine_key: string | null }>(
    `SELECT content_type, private_key, quarantine_key FROM media_uploads WHERE key = $1`,
    [key],
  );
  const row = m.rows[0];
  const target = row?.private_key ?? row?.quarantine_key ?? null;
  const known = row && row.content_type !== 'application/octet-stream' ? row.content_type : null;
  if (target) {
    const bytes = await storage.readEvidence(target).catch(() => null);
    if (bytes) return { bytes, contentType: known ?? 'image/webp' };
  }
  const file = await storage.read(key).catch(() => null);
  if (!file) return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of file.body) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += b.length;
    if (size > MAX_READ_BYTES) {
      file.body.destroy();
      return null;
    }
    chunks.push(b);
  }
  return { bytes: Buffer.concat(chunks), contentType: known ?? file.contentType ?? 'application/octet-stream' };
}
