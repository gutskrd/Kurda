import type pg from 'pg';

/** The upload kind `POST /images/upload` stores pictures under. */
export const POST_PICTURE_KIND = 'image-post';

/** Why a picture cannot go on a post. */
export type PictureClaimFailure =
  /**
   * Not a picture its author uploaded for a post, or not one that cleared the
   * scan — an unknown key, somebody else's upload or profile photo, a voice
   * note, an upload from before uploads had owners. One answer for all of
   * them, so the answer never tells anyone whose a key is.
   */
  | 'INVALID_MEDIA'
  /** already on a post, this one's or another's */
  | 'MEDIA_IN_USE';

export interface ClaimedPicture {
  key: string;
  width: number | null;
  height: number | null;
}

export type PictureClaim =
  | { ok: true; pictures: ClaimedPicture[] }
  | { ok: false; code: PictureClaimFailure; mediaKey: string };

/**
 * Claim uploads for a post, inside the caller's transaction.
 *
 * A post may use a picture only if its author uploaded it through
 * `POST /images/upload`, the scan cleared it, and no post uses it yet. The
 * upload step leaves such a picture unconfirmed (media/imageMedia.ts) and this
 * is what confirms it — so "unconfirmed" is "not on a post", one picture is one
 * post's, and a picture nobody posts is left to the orphan sweep.
 *
 * The rows are locked, so two posts racing for the same upload cannot both
 * have it: the second sees it confirmed and is told it is in use. Keys come
 * back in the order asked for, with the size they were stored at.
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
 * The same answer as `claimPostPictures` would give, without claiming
 * anything: for a route to refuse a post for its pictures before the post
 * counts toward a velocity cap or its words reach the spam check. The claim
 * still decides; this only answers early.
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
      row.scan_status === 'cleared' &&
      // taken off the public bucket by moderation (moderation/quarantine.ts)
      !row.quarantined;
    if (!usable) return { ok: false, code: 'INVALID_MEDIA', mediaKey: key };
    if (row.confirmed) return { ok: false, code: 'MEDIA_IN_USE', mediaKey: key };
  }
  return { ok: true, pictures: keys.map((key) => ({ key, width: byKey.get(key)!.width, height: byKey.get(key)!.height })) };
}

/**
 * Let go of pictures an edit took off a post, inside the caller's transaction.
 *
 * They go back to how an unposted upload is: unconfirmed, so the orphan sweep
 * deletes them after a day — unless their owner puts them on a post again
 * before then.
 *
 * Not a picture a moderator still has to look at: one whose scan flagged it
 * for review, or one a scan holds as evidence, stays confirmed, kept the way a
 * removed post's pictures are. (The caller keeps a reported post's pictures
 * by not letting go of them at all — see `LibraryService.update`.) One a
 * decided report's snapshot still holds is let go like any other, and the
 * sweep leaves it alone until the evidence's retention ends
 * (`media_uploads.preserve_evidence`, media/service.ts).
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
