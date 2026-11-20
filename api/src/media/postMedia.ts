import type pg from 'pg';

/** The upload kind `POST /images/upload` stores pictures under. */
export const POST_PICTURE_KIND = 'image-post';

/** Why a picture cannot go on a post. */
export type PictureClaimFailure =
  /**
   * Not a picture its author uploaded for a post, or one the check refused or moderation took down. One answer for every
   * case, so it never reveals whose a key is.
   */
  | 'INVALID_MEDIA'
  /** already on a post, this one's or another's */
  | 'MEDIA_IN_USE';

export interface ClaimedPicture {
  key: string;
  width: number | null;
  height: number | null;
  /** a person checks it before anyone else sees it, so the post waits with it */
  held: boolean;
}

export type PictureClaim =
  | { ok: true; pictures: ClaimedPicture[] }
  | { ok: false; code: PictureClaimFailure; mediaKey: string };

/**
 * Claims uploads for a post inside the caller's transaction. A post may use a picture only if its author uploaded it
 * through `POST /images/upload`, the check cleared it or holds it for a person, and no post uses it yet; the upload
 * step leaves it unconfirmed and this confirms it, so one picture is one post's and unposted ones go to the orphan
 * sweep. A held picture makes the post wait for the same person (`held`). Rows are locked, so two posts racing for an
 * upload cannot both get it. Keys come back in the order asked, with their stored sizes.
 */
export async function claimPostPictures(
  executor: Pick<pg.PoolClient, 'query'>,
  authorId: string,
  keys: readonly string[],
): Promise<PictureClaim> {
  const checked = await inspect(executor, authorId, keys, true);
  if (checked.ok && keys.length > 0) {
    await executor.query(`UPDATE media_uploads SET confirmed_at = now() WHERE key = ANY($1::text[])`, [keys]);
  }
  return checked;
}

/**
 * What `claimPostPictures` would answer, without claiming, so a route can refuse a post before it counts toward
 * velocity or the spam check. The claim still decides.
 */
export async function checkPostPictures(
  executor: Pick<pg.Pool, 'query'>,
  authorId: string,
  keys: readonly string[],
): Promise<PictureClaim> {
  return inspect(executor, authorId, keys, false);
}

async function inspect(
  executor: Pick<pg.Pool, 'query'>,
  authorId: string,
  keys: readonly string[],
  lock: boolean,
): Promise<PictureClaim> {
  if (keys.length === 0) return { ok: true, pictures: [] };
  // the same picture twice in one post is not two pictures
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) return { ok: false, code: 'MEDIA_IN_USE', mediaKey: key };
    seen.add(key);
  }

  const rows = await executor.query<{
    key: string; uploader_id: string | null; kind: string | null; content_type: string;
    scan_status: string; quarantined: boolean; confirmed: boolean; width: number | null; height: number | null;
  }>(
    `SELECT key, uploader_id, kind, content_type, scan_status, quarantine_state IS NOT NULL AS quarantined,
            confirmed_at IS NOT NULL AS confirmed, width, height
       FROM media_uploads WHERE key = ANY($1::text[])
      -- always the same order, so two claims on overlapping pictures queue
      -- behind each other instead of deadlocking
      ORDER BY key${lock ? ' FOR UPDATE' : ''}`,
    [keys],
  );
  const byKey = new Map(rows.rows.map((r) => [r.key, r]));
  for (const key of keys) {
    const row = byKey.get(key);
    const usable =
      row &&
      row.uploader_id === authorId &&
      row.kind === POST_PICTURE_KIND &&
      row.content_type.startsWith('image/') &&
      (row.scan_status === 'cleared' || row.scan_status === 'held') &&
      // taken off the public bucket by moderation (moderation/quarantine.ts)
      !row.quarantined;
    if (!usable) return { ok: false, code: 'INVALID_MEDIA', mediaKey: key };
    if (row.confirmed) return { ok: false, code: 'MEDIA_IN_USE', mediaKey: key };
  }
  return {
    ok: true,
    pictures: keys.map((key) => {
      const row = byKey.get(key)!;
      return { key, width: row.width, height: row.height, held: row.scan_status === 'held' };
    }),
  };
}

/**
 * Releases pictures an edit took off a post, inside the caller's transaction: unconfirmed again, so the orphan sweep
 * deletes them after a day unless reposted. Pictures a moderator still needs (flagged for review, or held as scan
 * evidence) stay confirmed; the caller keeps a reported post's pictures by not releasing them (`LibraryService.update`).
 * One still in a decided report's snapshot is released, and the sweep spares it until the evidence retention ends
 * (`media_uploads.preserve_evidence`).
 */
export async function releasePostPictures(executor: Pick<pg.PoolClient, 'query'>, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  await executor.query(
    `UPDATE media_uploads m SET confirmed_at = NULL, created_at = now()
      WHERE m.key = ANY($1::text[])
        AND NOT EXISTS (SELECT 1 FROM image_scans s
                         WHERE s.media_key = m.key AND (s.status = 'pending' OR s.preserve_evidence))`,
    [keys],
  );
}
