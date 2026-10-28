import { MODERATED_MESSAGE_BODY, type ReportTargetType } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { parseTargetRef, type CaseSourceRow } from './sources.js';
import type { Executor } from './tx.js';

/**
 * Removing reported content, and putting it back.
 *
 * "Remove" used to be refused by the route (the old resolve schema forgot it)
 * and, where it ran, emptied a comment's body for good. Now a removal hides the
 * content everywhere the same way an author's delete does — a post or picture
 * becomes `removed`, a comment a tombstone, a chat message "Removed by Hevalo"
 * for both people — and records exactly what it changed on the case, so an
 * appeal that overturns the decision can restore it. The report's snapshot
 * keeps what it said either way.
 */

/** What a removal changed: enough to undo it. Stored on the case as `removed_content`. */
export type RemovalRecord =
  | { type: 'library_post' | 'image_post'; id: string; previousStatus: string }
  | {
      type: 'library_comment' | 'image_comment';
      id: string;
      postId: string;
      previousStatus: string;
      previousBody: string | null;
      previousAudio: string | null;
    }
  | { type: 'dm_message' | 'group_message'; id: string; previousBody: string | null; kind: string }
  | MediaRemoval
  /**
   * The CSAM action: the reported content and every copy of its media, all at
   * once. Never put back by an appeal — undoing it is a deliberate act by hand,
   * since the originals have left the public bucket by then.
   */
  | { type: 'csam'; parts: RemovalRecord[] };

/** A file hidden wherever it is used: blocked, its pictures removed, the profile photos it was taken off. */
export interface MediaRemoval {
  type: 'media';
  key: string;
  previousScanStatus: string | null;
  /** the picture posts (`image_posts`) it was the picture of */
  posts: Array<{ id: string; previousStatus: string }>;
  /**
   * the written posts it was one of the pictures on (`library_post_media`);
   * absent from removals recorded before written posts had pictures
   */
  libraryPosts?: Array<{ id: string; previousStatus: string }>;
  profilePhotoOf: string[];
  /**
   * The same bytes stored under other keys (`media_uploads.content_sha256`),
   * blocked with it; their posts are among `posts` and `libraryPosts`.
   * Absent from removals recorded before keys could differ for one picture.
   */
  copies?: Array<{ key: string; previousScanStatus: string }>;
}

/** Every key a removal blocked: the file's own and its copies'. */
export function removedKeys(rec: MediaRemoval): string[] {
  return [rec.key, ...(rec.copies ?? []).map((c) => c.key)];
}

/** The content a case is about, when it is content at all. */
export async function removableTarget(
  db: Executor,
  c: CaseSourceRow,
): Promise<{ type: ReportTargetType | 'media'; id: string } | null> {
  switch (c.source) {
    case 'report':
    case 'copyright':
      if (!c.target_type || !c.target_id) return null;
      return ['user', 'group', 'game_player'].includes(c.target_type) ? null : { type: c.target_type, id: c.target_id };
    case 'library_report':
    case 'image_report': {
      const t = parseTargetRef(c.source_ref);
      return t ? { type: t.type as ReportTargetType, id: t.id } : null;
    }
    case 'chat_report': {
      const r = await db.query<{ message_type: string; message_id: string }>(
        `SELECT message_type, message_id FROM chat_reports WHERE id = $1::uuid`,
        [c.source_ref],
      );
      const row = r.rows[0];
      if (!row) return null;
      return { type: row.message_type === 'dm' ? 'dm_message' : 'group_message', id: row.message_id };
    }
    case 'text_flag': {
      const r = await db.query<{ surface: string; content_type: string; content_ref: string | null }>(
        `SELECT surface, content_type, content_ref FROM moderation_flags WHERE id = $1::uuid`,
        [c.source_ref],
      );
      const f = r.rows[0];
      if (!f?.content_ref) return null;
      if (f.surface === 'library' && f.content_type === 'post') return { type: 'library_post', id: f.content_ref };
      if (f.surface === 'library' && f.content_type === 'comment') return { type: 'library_comment', id: f.content_ref };
      if (f.surface === 'caption' && f.content_type === 'comment') return { type: 'image_comment', id: f.content_ref };
      return null;
    }
    case 'image_flag': {
      const r = await db.query<{ media_key: string }>(`SELECT media_key FROM image_scans WHERE id = $1::uuid`, [c.source_ref]);
      return r.rows[0] ? { type: 'media', id: r.rows[0].media_key } : null;
    }
    default:
      return null;
  }
}

/** Hide the content and say what changed. Throws NOTHING_TO_REMOVE when the case is not about content. */
export async function removeContent(db: Executor, c: CaseSourceRow, adminId: string): Promise<RemovalRecord> {
  const target = await removableTarget(db, c);
  if (!target) throw new AppError('NOTHING_TO_REMOVE', 422, 'this case is not about a piece of content');
  switch (target.type) {
    case 'library_post':
    case 'image_post': {
      const table = target.type === 'library_post' ? 'library_posts' : 'image_posts';
      const r = await db.query<{ status: string }>(`SELECT status FROM ${table} WHERE id = $1::uuid FOR UPDATE`, [target.id]);
      const previousStatus = r.rows[0]?.status ?? 'removed';
      await db.query(`UPDATE ${table} SET status = 'removed', updated_at = now() WHERE id = $1::uuid`, [target.id]);
      return { type: target.type, id: target.id, previousStatus };
    }
    case 'library_comment':
    case 'image_comment': {
      const table = target.type === 'library_comment' ? 'library_comments' : 'image_comments';
      const posts = target.type === 'library_comment' ? 'library_posts' : 'image_posts';
      const audioCol = target.type === 'library_comment' ? 'audio_media_id' : 'NULL::text';
      const r = await db.query<{ status: string; body: string | null; audio: string | null; post_id: string }>(
        `SELECT status, body, ${audioCol} AS audio, post_id FROM ${table} WHERE id = $1::uuid FOR UPDATE`,
        [target.id],
      );
      const row = r.rows[0];
      if (!row) throw new AppError('NOTHING_TO_REMOVE', 422, 'that comment no longer exists');
      if (row.status === 'visible') {
        const clearAudio = target.type === 'library_comment' ? ', audio_media_id = NULL' : '';
        await db.query(`UPDATE ${table} SET status = 'removed', body = NULL${clearAudio}, updated_at = now() WHERE id = $1::uuid`, [target.id]);
        await db.query(`UPDATE ${posts} SET comment_count = GREATEST(0, comment_count - 1) WHERE id = $1`, [row.post_id]);
      }
      return {
        type: target.type,
        id: target.id,
        postId: row.post_id,
        previousStatus: row.status,
        previousBody: row.body,
        previousAudio: row.audio,
      };
    }
    case 'dm_message':
    case 'group_message': {
      const table = target.type === 'dm_message' ? 'dm_messages' : 'group_messages';
      const r = await db.query<{ body: string | null; kind: string; moderated_at: Date | null }>(
        `SELECT body, kind, moderated_at FROM ${table} WHERE id = $1::uuid FOR UPDATE`,
        [target.id],
      );
      const row = r.rows[0];
      // a message erased with its sender's account is already gone; the snapshot has it
      if (!row) return { type: target.type, id: target.id, previousBody: null, kind: 'text' };
      if (row.moderated_at === null) {
        // a gift or game card has no words to hide; it is marked, not rewritten
        await db.query(
          `UPDATE ${table} SET moderated_at = now(), moderated_by = $2,
                  body = CASE WHEN kind = 'text' THEN $3 ELSE body END
            WHERE id = $1::uuid`,
          [target.id, adminId, MODERATED_MESSAGE_BODY],
        );
      }
      return { type: target.type, id: target.id, previousBody: row.moderated_at === null ? row.body : null, kind: row.kind };
    }
    case 'media':
      return removeMedia(db, target.id);
    default:
      throw new AppError('NOTHING_TO_REMOVE', 422, 'this case is not about a piece of content');
  }
}

/**
 * Hide one file everywhere it is used. The same picture can sit under several
 * accounts' posts and profiles at once — a key is a hash of the bytes, and
 * where it is not (a picture uploaded for a post has its owner in its key, and
 * a new key each time it is posted again), the copies share the bytes' hash
 * (`content_sha256`) and go with it. Every picture post carrying any of them
 * is removed, and so is every written post one of them is on (a post is what
 * it shows, so it goes whole, as a picture post does); the file comes off
 * every profile it is the photo of (old chat messages, comments and
 * leaderboards draw the avatar from there), and every copy is blocked so it is
 * never served or accepted again.
 */
export async function removeMedia(db: Executor, key: string): Promise<MediaRemoval> {
  const media = await db.query<{ scan_status: string }>(`SELECT scan_status FROM media_uploads WHERE key = $1 FOR UPDATE`, [key]);
  const copies = await db.query<{ key: string; scan_status: string }>(
    `SELECT c.key, c.scan_status
       FROM media_uploads m JOIN media_uploads c ON c.content_sha256 = m.content_sha256 AND c.key <> m.key
      WHERE m.key = $1
      ORDER BY c.key FOR UPDATE OF c`,
    [key],
  );
  const keys = [key, ...copies.rows.map((c) => c.key)];
  await db.query(`UPDATE media_uploads SET scan_status = 'blocked' WHERE key = ANY($1::text[])`, [keys]);
  const posts = await db.query<{ id: string; status: string }>(
    `SELECT id, status FROM image_posts WHERE image_media_id = ANY($1::text[]) AND status <> 'removed' FOR UPDATE`,
    [keys],
  );
  await db.query(
    `UPDATE image_posts SET status = 'removed', updated_at = now() WHERE image_media_id = ANY($1::text[]) AND status <> 'removed'`,
    [keys],
  );
  const written = await db.query<{ id: string; status: string }>(
    `SELECT p.id, p.status FROM library_posts p
      WHERE p.status <> 'removed'
        AND p.id IN (SELECT m.post_id FROM library_post_media m WHERE m.media_key = ANY($1::text[]))
      FOR UPDATE`,
    [keys],
  );
  if (written.rows.length > 0) {
    await db.query(`UPDATE library_posts SET status = 'removed', updated_at = now() WHERE id = ANY($1::uuid[])`, [
      written.rows.map((p) => p.id),
    ]);
  }
  const photos = await db.query<{ id: string }>(`UPDATE users SET profile_photo_key = NULL WHERE profile_photo_key = $1 RETURNING id`, [key]);
  return {
    type: 'media',
    key,
    previousScanStatus: media.rows[0]?.scan_status ?? null,
    posts: posts.rows.map((p) => ({ id: p.id, previousStatus: p.status })),
    libraryPosts: written.rows.map((p) => ({ id: p.id, previousStatus: p.status })),
    profilePhotoOf: photos.rows.map((p) => p.id),
    copies: copies.rows.map((c) => ({ key: c.key, previousScanStatus: c.scan_status })),
  };
}

/**
 * The files a removal took down with the content: a picture post's image, a
 * written post's pictures and voice, a comment's voice.
 */
export async function mediaOfRemoval(db: Executor, rec: RemovalRecord): Promise<string[]> {
  switch (rec.type) {
    case 'image_post': {
      const r = await db.query<{ k: string }>(`SELECT image_media_id AS k FROM image_posts WHERE id = $1::uuid`, [rec.id]);
      return r.rows.map((x) => x.k);
    }
    case 'library_post': {
      const r = await db.query<{ k: string | null }>(
        `SELECT m.media_key AS k FROM library_post_media m WHERE m.post_id = $1::uuid
         UNION ALL SELECT audio_media_id FROM library_posts WHERE id = $1::uuid`,
        [rec.id],
      );
      return r.rows.map((x) => x.k).filter((k): k is string => k !== null);
    }
    case 'library_comment':
      return rec.previousAudio ? [rec.previousAudio] : [];
    case 'media':
      return removedKeys(rec);
    case 'csam':
      return (await Promise.all(rec.parts.map((p) => mediaOfRemoval(db, p)))).flat();
    default:
      return [];
  }
}

/**
 * Undo a removal (an appeal overturned the decision). Only what the removal
 * itself changed is put back, and only where nobody has changed it since — an
 * author who deleted their own post meanwhile keeps it deleted.
 */
export async function restoreContent(db: Executor, rec: RemovalRecord): Promise<void> {
  switch (rec.type) {
    case 'library_post':
    case 'image_post': {
      const table = rec.type === 'library_post' ? 'library_posts' : 'image_posts';
      if (rec.previousStatus === 'removed') return;
      await db.query(`UPDATE ${table} SET status = $2, updated_at = now() WHERE id = $1::uuid AND status = 'removed'`, [rec.id, rec.previousStatus]);
      return;
    }
    case 'library_comment':
    case 'image_comment': {
      if (rec.previousStatus !== 'visible') return;
      const table = rec.type === 'library_comment' ? 'library_comments' : 'image_comments';
      const posts = rec.type === 'library_comment' ? 'library_posts' : 'image_posts';
      const setAudio = rec.type === 'library_comment' ? ', audio_media_id = $3' : '';
      const params = rec.type === 'library_comment' ? [rec.id, rec.previousBody, rec.previousAudio] : [rec.id, rec.previousBody];
      const r = await db.query(
        `UPDATE ${table} SET status = 'visible', body = $2${setAudio}, updated_at = now() WHERE id = $1::uuid AND status = 'removed'`,
        params,
      );
      if (r.rowCount) await db.query(`UPDATE ${posts} SET comment_count = comment_count + 1 WHERE id = $1`, [rec.postId]);
      return;
    }
    case 'dm_message':
    case 'group_message': {
      const table = rec.type === 'dm_message' ? 'dm_messages' : 'group_messages';
      await db.query(
        `UPDATE ${table} SET moderated_at = NULL, moderated_by = NULL,
                body = CASE WHEN kind = 'text' THEN COALESCE($2, body) ELSE body END
          WHERE id = $1::uuid AND moderated_at IS NOT NULL`,
        [rec.id, rec.previousBody],
      );
      return;
    }
    case 'media': {
      if (rec.previousScanStatus) {
        await db.query(`UPDATE media_uploads SET scan_status = $2 WHERE key = $1 AND scan_status = 'blocked'`, [rec.key, rec.previousScanStatus]);
      }
      // the copies, the pictures and the posts that used it: one statement for each kind, not one per row
      const copies = rec.copies ?? [];
      if (copies.length > 0) {
        await db.query(
          `UPDATE media_uploads m SET scan_status = c.previous
             FROM unnest($1::text[], $2::text[]) AS c(key, previous)
            WHERE m.key = c.key AND m.scan_status = 'blocked'`,
          [copies.map((c) => c.key), copies.map((c) => c.previousScanStatus)],
        );
      }
      if (rec.posts.length > 0) {
        await db.query(
          `UPDATE image_posts t SET status = p.previous, updated_at = now()
             FROM unnest($1::uuid[], $2::text[]) AS p(id, previous)
            WHERE t.id = p.id AND t.status = 'removed'`,
          [rec.posts.map((p) => p.id), rec.posts.map((p) => p.previousStatus)],
        );
      }
      const libraryPosts = rec.libraryPosts ?? [];
      if (libraryPosts.length > 0) {
        await db.query(
          `UPDATE library_posts t SET status = p.previous, updated_at = now()
             FROM unnest($1::uuid[], $2::text[]) AS p(id, previous)
            WHERE t.id = p.id AND t.status = 'removed'`,
          [libraryPosts.map((p) => p.id), libraryPosts.map((p) => p.previousStatus)],
        );
      }
      if (rec.profilePhotoOf.length > 0) {
        await db.query(`UPDATE users SET profile_photo_key = $1 WHERE id = ANY($2::uuid[]) AND profile_photo_key IS NULL`, [rec.key, rec.profilePhotoOf]);
      }
      return;
    }
    case 'csam':
      // never automatically: see the record's type
      return;
  }
}

