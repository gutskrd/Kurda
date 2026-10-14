import type { QuarantineState } from '@kurda/shared';
import type { MediaStorage } from '../media/storage.js';
import { evidenceObjectKey } from './pseudonym.js';
import type { Executor } from './tx.js';

/**
 * Taking evidence off the public bucket.
 *
 * Media is served straight from a public-read bucket behind a CDN, at
 * `CDN_BASE_URL/<key>`, with a year-long `immutable` cache. Marking an upload
 * "blocked" only stops new posts from using it; the object itself stays where
 * every earlier viewer, scraper and cache can fetch it. For CSAM, and for a
 * closed child's picture that a report still holds as evidence, that is the
 * one thing that must not happen. So such a file is quarantined:
 *
 *   1. in the decision's transaction it is marked (`requestQuarantine`):
 *      'pending', and kept from every cleanup;
 *   2. after the commit (`runQuarantine`) it is copied to private storage — the
 *      evidence bucket, or a keyed private key in the main one — and only then
 *      is the public object deleted, so a failed copy never loses the evidence;
 *      the CDN is asked to forget the URL where a purge is configured;
 *   3. it is 'done', with `quarantine_key` saying where the original is now.
 *      The case view signs links to that copy; the retention sweep deletes it
 *      with the rest of the evidence.
 *
 * Storage calls happen outside any transaction, and a step that fails leaves
 * the file 'pending' for the five-minute moderation sweep to try again. Every
 * step can be repeated: the private key is the same for the same file, and
 * deleting what is already gone is not an error.
 */

/** Mark files for quarantine and keep them from cleanup, in the caller's transaction. */
export async function requestQuarantine(db: Executor, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // a file with no upload row (an older upload path) still gets one, so the
  // sweep can find it and the retention can let it go
  await db.query(
    `INSERT INTO media_uploads (key, content_type, content_length, preserve_evidence, quarantine_state)
     SELECT k, 'application/octet-stream', 0, true, 'pending' FROM unnest($1::text[]) AS k
     ON CONFLICT (key) DO UPDATE SET
       preserve_evidence = true,
       quarantine_state = CASE WHEN media_uploads.quarantine_state = 'done' THEN 'done' ELSE 'pending' END`,
    [[...new Set(keys)]],
  );
}

export interface QuarantineRunOptions {
  /** only these files (the ones a decision just marked); otherwise any pending, a batch at a time */
  keys?: string[];
  log?: { warn: (obj: unknown, msg: string) => void };
  limit?: number;
}

/**
 * Move pending files off the public bucket. Returns how many were finished.
 * Never throws: without storage (local development) nothing can move and the
 * files stay pending; a file whose move fails stays pending for the sweep.
 */
export async function runQuarantine(
  db: Executor,
  storage: MediaStorage | null | undefined,
  opts: QuarantineRunOptions = {},
): Promise<number> {
  if (!storage) return 0;
  if (opts.keys && opts.keys.length === 0) return 0;
  const pending = await db.query<{ key: string; content_type: string }>(
    `SELECT key, content_type FROM media_uploads
      WHERE quarantine_state = 'pending' AND ($1::text[] IS NULL OR key = ANY($1::text[]))
      ORDER BY key LIMIT $2`,
    [opts.keys ?? null, opts.limit ?? 100],
  );
  let done = 0;
  for (const row of pending.rows) {
    try {
      const target = evidenceObjectKey(row.key);
      if (await storage.exists(row.key)) {
        await storage.copyToEvidence(row.key, target, row.content_type === 'application/octet-stream' ? undefined : row.content_type);
        await storage.delete(row.key);
      }
      const kept = await storage.evidenceExists(target);
      const purged = await storage.purgePublic([row.key]);
      await db.query(
        `UPDATE media_uploads SET quarantine_state = 'done', quarantine_key = $2, quarantined_at = now(), cdn_purged = $3
          WHERE key = $1 AND quarantine_state = 'pending'`,
        [row.key, kept ? target : null, purged],
      );
      done++;
    } catch (err) {
      opts.log?.warn({ err, key: row.key }, 'could not quarantine an evidence file yet; the sweep will retry');
    }
  }
  return done;
}

export interface MediaWhereabouts {
  contentType: string;
  quarantine: QuarantineState | null;
  quarantineKey: string | null;
  cdnPurged: boolean | null;
}

/** Where each of these files is now, for the case view and the CSAM filing task. */
export async function mediaWhereabouts(db: Executor, keys: string[]): Promise<Map<string, MediaWhereabouts>> {
  if (keys.length === 0) return new Map();
  const r = await db.query<{
    key: string; content_type: string; quarantine_state: QuarantineState | null; quarantine_key: string | null; cdn_purged: boolean | null;
  }>(
    `SELECT key, content_type, quarantine_state, quarantine_key, cdn_purged FROM media_uploads WHERE key = ANY($1::text[])`,
    [keys],
  );
  return new Map(
    r.rows.map((m) => [
      m.key,
      { contentType: m.content_type, quarantine: m.quarantine_state, quarantineKey: m.quarantine_key, cdnPurged: m.cdn_purged },
    ]),
  );
}
