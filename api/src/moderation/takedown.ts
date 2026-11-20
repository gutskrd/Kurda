import { APPEAL_WINDOW_DAYS, MODERATED_MESSAGE_BODY, type BanContentChoice } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { releasePicture } from './picture-release.js';
import type { Executor } from './tx.js';

/**
 * What a suspension or ban does to the person's content, as the moderator chose (shared/src/account-hold.ts):
 *
 * - **Keep**: nothing changes here; bylines show the account as unavailable (moderation/availability.ts).
 * - **Hide**: everything public goes from others' view at once: written and picture posts, comments, group messages,
 *   letters still in flight, the profile's photo, name, bio, country, background and tags, and the group photos they
 *   set. Each item's state before is kept (`ban_takedown_items`), so lifting, overturning or an ending suspension puts
 *   back exactly that, wherever nobody changed it since.
 * - **Remove**: hidden the same way, and their pictures and voice leave the public bucket (the picture checks'
 *   `withdrawn` path, picture-release.ts `runHoldMoves`); once the appeal window has passed with no appeal open and the
 *   ban still standing, the posts and letters are deleted and what was kept to restore them goes (`purgeDue`).
 * - **Also their private messages**: their direct messages read "Removed by Hevalo" to the other person too.
 *
 * A person has at most one takedown that governs: content is put back only when no other ban in force has one, and
 * otherwise passes to that ban's takedown.
 */

export type TakedownChoice = Exclude<BanContentChoice, 'keep'>;

/** What a takedown took, as the dialog's summary and the audit log count it. */
export interface TakedownCounts {
  posts: number;
  pictures: number;
  comments: number;
  groupMessages: number;
  directMessages: number;
  letters: number;
  profile: boolean;
  groupPhotos: number;
}

/** What a person has that a takedown would cover, for the ban dialog's summary. */
export interface ContentSummary {
  posts: number;
  pictures: number;
  comments: number;
  groupMessages: number;
  directMessages: number;
  lettersInFlight: number;
  profile: boolean;
  groupPhotos: number;
}

/** One statement: what is public of this person now. */
export async function contentSummary(db: Executor, userId: string): Promise<ContentSummary> {
  const r = await db.query<{
    library_posts: number; image_posts: number; post_pictures: number; comments: number; group_messages: number;
    direct_messages: number; letters: number; profile: boolean; group_photos: number;
  }>(
    `SELECT (SELECT count(*)::int FROM library_posts WHERE author_id = $1 AND status IN ('published','held')) AS library_posts,
            (SELECT count(*)::int FROM image_posts WHERE author_id = $1 AND status IN ('published','held')) AS image_posts,
            (SELECT count(*)::int FROM library_post_media m JOIN library_posts p ON p.id = m.post_id
              WHERE p.author_id = $1 AND p.status IN ('published','held')) AS post_pictures,
            (SELECT count(*)::int FROM library_comments WHERE author_id = $1 AND status = 'visible')
              + (SELECT count(*)::int FROM image_comments WHERE author_id = $1 AND status = 'visible') AS comments,
            (SELECT count(*)::int FROM group_messages WHERE sender_id = $1 AND deleted_at IS NULL AND moderated_at IS NULL) AS group_messages,
            (SELECT count(*)::int FROM dm_messages WHERE sender_id = $1 AND moderated_at IS NULL) AS direct_messages,
            (SELECT count(*)::int FROM letters WHERE sender_id = $1 AND status IN ('flying','held')) AS letters,
            (SELECT u.profile_photo_key IS NOT NULL OR u.display_name IS NOT NULL OR u.bio IS NOT NULL OR u.country IS NOT NULL
                    OR u.equipped_background_sku IS NOT NULL
                    OR EXISTS (SELECT 1 FROM user_tags t WHERE t.user_id = u.id AND t.displayed)
               FROM users u WHERE u.id = $1) AS profile,
            (SELECT count(*)::int FROM groups WHERE photo_set_by = $1 AND photo_key IS NOT NULL AND archived_at IS NULL) AS group_photos`,
    [userId],
  );
  const c = r.rows[0]!;
  return {
    posts: c.library_posts + c.image_posts,
    // a picture post is one picture; a written post has up to four
    pictures: c.image_posts + c.post_pictures,
    comments: c.comments,
    groupMessages: c.group_messages,
    directMessages: c.direct_messages,
    lettersInFlight: c.letters,
    profile: c.profile === true,
    groupPhotos: c.group_photos,
  };
}

export interface TakedownInput {
  sanctionId: string;
  userId: string;
  choice: TakedownChoice;
  includeMessages: boolean;
  /** the admin who chose it; null for an automatic ban */
  adminId: string | null;
}

export interface TakedownResult {
  takedownId: string;
  counts: TakedownCounts;
  /** pictures and voice to move off the public bucket after the commit (Remove) */
  withdrawn: string[];
}

/** Count the rows a data-modifying statement reports. */
async function count(db: Executor, sql: string, params: unknown[]): Promise<number> {
  const r = await db.query<{ n: number }>(sql, params);
  return r.rows[0]?.n ?? 0;
}

/**
 * Take down a person's content for a ban, in the ban's transaction. Each kind is one statement: the rows taken, their
 * state recorded, and the change made, so the cost does not grow with the number of statements.
 */
export async function takeDown(db: Executor, input: TakedownInput): Promise<TakedownResult> {
  const t = await db.query<{ id: string }>(
    `INSERT INTO ban_takedowns (sanction_id, user_id, choice, include_messages, purge_after, created_by)
     VALUES ($1, $2, $3, $4, CASE WHEN $3 = 'remove' THEN now() + make_interval(days => $5::int) END, $6)
     RETURNING id`,
    [input.sanctionId, input.userId, input.choice, input.includeMessages, APPEAL_WINDOW_DAYS, input.adminId],
  );
  const id = t.rows[0]!.id;
  const p = [id, input.userId];

  const posts = {
    library: await count(
      db,
      `WITH t AS (SELECT id, status FROM library_posts WHERE author_id = $2 AND status IN ('published','held') FOR UPDATE),
       ins AS (INSERT INTO ban_takedown_items (takedown_id, item_type, item_id, previous)
               SELECT $1, 'library_post', t.id::text, jsonb_build_object('status', t.status) FROM t),
       upd AS (UPDATE library_posts x SET status = 'removed', updated_at = now() FROM t WHERE x.id = t.id RETURNING 1)
       SELECT count(*)::int AS n FROM upd`,
      p,
    ),
    image: await count(
      db,
      `WITH t AS (SELECT id, status FROM image_posts WHERE author_id = $2 AND status IN ('published','held') FOR UPDATE),
       ins AS (INSERT INTO ban_takedown_items (takedown_id, item_type, item_id, previous)
               SELECT $1, 'image_post', t.id::text, jsonb_build_object('status', t.status) FROM t),
       upd AS (UPDATE image_posts x SET status = 'removed', updated_at = now() FROM t WHERE x.id = t.id RETURNING 1)
       SELECT count(*)::int AS n FROM upd`,
      p,
    ),
  };

  // a comment becomes a tombstone, as a removal makes it, and its post counts one fewer
  let comments = 0;
  for (const [table, posts_, type, audio] of [
    ['library_comments', 'library_posts', 'library_comment', 'audio_media_id'],
    ['image_comments', 'image_posts', 'image_comment', 'NULL::text'],
  ] as const) {
    const clearAudio = table === 'library_comments' ? ', audio_media_id = NULL' : '';
    comments += await count(
      db,
      `WITH t AS (SELECT id, post_id, body, ${audio} AS audio FROM ${table} WHERE author_id = $2 AND status = 'visible' FOR UPDATE),
       ins AS (INSERT INTO ban_takedown_items (takedown_id, item_type, item_id, previous)
               SELECT $1, '${type}', t.id::text, jsonb_build_object('postId', t.post_id, 'body', t.body, 'audio', t.audio) FROM t),
       upd AS (UPDATE ${table} x SET status = 'removed', body = NULL${clearAudio}, updated_at = now() FROM t WHERE x.id = t.id RETURNING 1),
       counted AS (UPDATE ${posts_} q SET comment_count = GREATEST(0, q.comment_count - c.n)
                     FROM (SELECT post_id, count(*)::int AS n FROM t GROUP BY post_id) c WHERE q.id = c.post_id)
       SELECT count(*)::int AS n FROM upd`,
      p,
    );
  }

  // messages read "Removed by Hevalo" to everyone; a gift or game card is marked, not rewritten
  const messages = async (table: 'group_messages' | 'dm_messages', type: string, extra: string) =>
    count(
      db,
      `WITH t AS (SELECT id, body, kind FROM ${table} WHERE sender_id = $2 AND moderated_at IS NULL ${extra} FOR UPDATE),
       ins AS (INSERT INTO ban_takedown_items (takedown_id, item_type, item_id, previous)
               SELECT $1, '${type}', t.id::text, jsonb_build_object('body', t.body, 'kind', t.kind) FROM t),
       upd AS (UPDATE ${table} x SET moderated_at = now(), moderated_by = $3,
                      body = CASE WHEN x.kind = 'text' THEN $4 ELSE x.body END
                 FROM t WHERE x.id = t.id RETURNING 1)
       SELECT count(*)::int AS n FROM upd`,
      [...p, input.adminId, MODERATED_MESSAGE_BODY],
    );
  const groupMessages = await messages('group_messages', 'group_message', 'AND deleted_at IS NULL');
  const directMessages = input.includeMessages ? await messages('dm_messages', 'dm_message', '') : 0;

  // a letter still in flight is not delivered
  const letters = await count(
    db,
    `WITH t AS (SELECT id, status FROM letters WHERE sender_id = $2 AND status IN ('flying','held') FOR UPDATE),
     ins AS (INSERT INTO ban_takedown_items (takedown_id, item_type, item_id, previous)
             SELECT $1, 'letter', t.id::text, jsonb_build_object('status', t.status) FROM t),
     upd AS (UPDATE letters x SET status = 'removed' FROM t WHERE x.id = t.id RETURNING 1)
     SELECT count(*)::int AS n FROM upd`,
    p,
  );

  // the profile: photo, name, bio, country, background and the tags they show
  const profile = await db.query<{ had: boolean }>(
    `WITH t AS (SELECT u.id, u.profile_photo_key, u.pending_profile_photo_key, u.display_name, u.bio, u.country, u.equipped_background_sku,
                       COALESCE((SELECT array_agg(g.id) FROM user_tags g WHERE g.user_id = u.id AND g.displayed), '{}') AS tags
                  FROM users u WHERE u.id = $2 FOR UPDATE),
     ins AS (INSERT INTO ban_takedown_items (takedown_id, item_type, item_id, previous)
             SELECT $1, 'profile', t.id::text,
                    jsonb_build_object('photoKey', t.profile_photo_key, 'pendingPhotoKey', t.pending_profile_photo_key,
                                       'displayName', t.display_name, 'bio', t.bio, 'country', t.country,
                                       'backgroundSku', t.equipped_background_sku, 'tags', to_jsonb(t.tags))
               FROM t),
     hide AS (UPDATE users x SET profile_photo_key = NULL, pending_profile_photo_key = NULL, display_name = NULL, bio = NULL,
                     country = NULL, equipped_background_sku = NULL
                FROM t WHERE x.id = t.id),
     tags AS (UPDATE user_tags g SET displayed = false FROM t WHERE g.id = ANY(t.tags))
     SELECT (t.profile_photo_key IS NOT NULL OR t.display_name IS NOT NULL OR t.bio IS NOT NULL OR t.country IS NOT NULL
             OR t.equipped_background_sku IS NOT NULL OR cardinality(t.tags) > 0) AS had
       FROM t`,
    p,
  );

  const groupPhotos = await count(
    db,
    `WITH t AS (SELECT id, photo_key FROM groups WHERE photo_set_by = $2 AND photo_key IS NOT NULL AND archived_at IS NULL FOR UPDATE),
     ins AS (INSERT INTO ban_takedown_items (takedown_id, item_type, item_id, previous)
             SELECT $1, 'group_photo', t.id::text, jsonb_build_object('photoKey', t.photo_key) FROM t),
     upd AS (UPDATE groups x SET photo_key = NULL FROM t WHERE x.id = t.id RETURNING 1)
     SELECT count(*)::int AS n FROM upd`,
    p,
  );

  // Remove: the pictures and voice of what was taken leave the public bucket, kept privately for the appeal window
  let withdrawn: string[] = [];
  if (input.choice === 'remove') {
    const keys = await db.query<{ key: string }>(
      `WITH taken AS (SELECT item_type, item_id, previous FROM ban_takedown_items WHERE takedown_id = $1),
       candidates AS (
         SELECT i.image_media_id AS key FROM image_posts i JOIN taken t ON t.item_type = 'image_post' AND t.item_id = i.id::text
         UNION SELECT m.media_key FROM library_post_media m JOIN taken t ON t.item_type = 'library_post' AND t.item_id = m.post_id::text
         UNION SELECT l.audio_media_id FROM library_posts l JOIN taken t ON t.item_type = 'library_post' AND t.item_id = l.id::text
          WHERE l.audio_media_id IS NOT NULL
         UNION SELECT t.previous->>'audio' FROM taken t WHERE t.item_type = 'library_comment' AND t.previous->>'audio' IS NOT NULL
         UNION SELECT t.previous->>'photoKey' FROM taken t WHERE t.item_type IN ('profile','group_photo') AND t.previous->>'photoKey' IS NOT NULL
         UNION SELECT t.previous->>'pendingPhotoKey' FROM taken t WHERE t.item_type = 'profile' AND t.previous->>'pendingPhotoKey' IS NOT NULL
       ),
       -- a photo is a hash of its bytes, so the same file can be someone else's photo too: that one is left alone
       own AS (
         SELECT m.key, m.scan_status FROM media_uploads m JOIN candidates c ON c.key = m.key
          WHERE m.scan_status IN ('cleared','held','gated')
            AND (m.uploader_id = $2 OR m.uploader_id IS NULL)
            AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id <> $2 AND (u.profile_photo_key = m.key OR u.pending_profile_photo_key = m.key))
            AND NOT EXISTS (SELECT 1 FROM groups g WHERE g.photo_key = m.key OR g.pending_photo_key = m.key)
          ORDER BY m.key FOR UPDATE OF m
       ),
       ins AS (INSERT INTO ban_takedown_items (takedown_id, item_type, item_id, previous)
               SELECT $1, 'picture', own.key, jsonb_build_object('scanStatus', own.scan_status) FROM own),
       upd AS (UPDATE media_uploads x SET scan_status = 'withdrawn', withdrawn_at = now(), publish_state = NULL
                 FROM own WHERE x.key = own.key RETURNING x.key)
       SELECT key FROM upd`,
      p,
    );
    withdrawn = keys.rows.map((k) => k.key);
  }

  const counts: TakedownCounts = {
    posts: posts.library + posts.image,
    pictures: withdrawn.length,
    comments,
    groupMessages,
    directMessages,
    letters,
    profile: profile.rows[0]?.had === true,
    groupPhotos,
  };
  await db.query(`UPDATE ban_takedowns SET counts = $2::jsonb WHERE id = $1`, [id, JSON.stringify(counts)]);
  return { takedownId: id, counts, withdrawn };
}

interface TakedownRow {
  id: string;
  sanction_id: string;
  user_id: string | null;
  choice: TakedownChoice;
  state: 'hidden' | 'restored' | 'purged';
  kind: string;
  revoked_at: Date | null;
  ends_at: Date | null;
}

/**
 * Put back what a takedown took, where nobody changed it since: a post still removed, a comment still a tombstone, a
 * message still marked, a profile field still empty. Pictures come back public (or waiting for a person, if they were).
 */
export async function restoreTakedown(db: Executor, takedownId: string, reason: string): Promise<void> {
  const p = [takedownId];
  for (const [table, type] of [['library_posts', 'library_post'], ['image_posts', 'image_post']] as const) {
    await db.query(
      `UPDATE ${table} x SET status = i.previous->>'status', updated_at = now()
         FROM ban_takedown_items i
        WHERE i.takedown_id = $1 AND i.item_type = '${type}' AND x.id = i.item_id::uuid AND x.status = 'removed'`,
      p,
    );
  }
  for (const [table, posts, type] of [
    ['library_comments', 'library_posts', 'library_comment'],
    ['image_comments', 'image_posts', 'image_comment'],
  ] as const) {
    const audio = table === 'library_comments' ? `, audio_media_id = i.previous->>'audio'` : '';
    await db.query(
      `WITH back AS (
         UPDATE ${table} x SET status = 'visible', body = i.previous->>'body'${audio}, updated_at = now()
           FROM ban_takedown_items i
          WHERE i.takedown_id = $1 AND i.item_type = '${type}' AND x.id = i.item_id::uuid AND x.status = 'removed'
          RETURNING x.post_id)
       UPDATE ${posts} q SET comment_count = q.comment_count + c.n
         FROM (SELECT post_id, count(*)::int AS n FROM back GROUP BY post_id) c WHERE q.id = c.post_id`,
      p,
    );
  }
  for (const [table, type] of [['group_messages', 'group_message'], ['dm_messages', 'dm_message']] as const) {
    await db.query(
      `UPDATE ${table} x SET moderated_at = NULL, moderated_by = NULL,
              body = CASE WHEN x.kind = 'text' THEN COALESCE(i.previous->>'body', x.body) ELSE x.body END
         FROM ban_takedown_items i
        WHERE i.takedown_id = $1 AND i.item_type = '${type}' AND x.id = i.item_id::uuid AND x.moderated_at IS NOT NULL`,
      p,
    );
  }
  // a letter that was in flight comes home with its bird rather than out again, as an overturned removal brings it
  await db.query(
    `UPDATE letters x SET status = CASE WHEN i.previous->>'status' = 'held' THEN 'held' ELSE 'recalled' END,
            recalled_at = CASE WHEN i.previous->>'status' = 'held' THEN x.recalled_at ELSE now() END,
            landed_at = CASE WHEN i.previous->>'status' = 'held' THEN x.landed_at ELSE now() END
       FROM ban_takedown_items i
      WHERE i.takedown_id = $1 AND i.item_type = 'letter' AND x.id = i.item_id::uuid AND x.status = 'removed'`,
    p,
  );
  await db.query(
    `UPDATE users x SET profile_photo_key = COALESCE(x.profile_photo_key, i.previous->>'photoKey'),
            pending_profile_photo_key = COALESCE(x.pending_profile_photo_key, i.previous->>'pendingPhotoKey'),
            display_name = COALESCE(x.display_name, i.previous->>'displayName'),
            bio = COALESCE(x.bio, i.previous->>'bio'),
            country = COALESCE(x.country, i.previous->>'country'),
            equipped_background_sku = COALESCE(x.equipped_background_sku, i.previous->>'backgroundSku')
       FROM ban_takedown_items i
      WHERE i.takedown_id = $1 AND i.item_type = 'profile' AND x.id = i.item_id::uuid`,
    p,
  );
  await db.query(
    `UPDATE user_tags g SET displayed = true
       FROM ban_takedown_items i, jsonb_array_elements_text(i.previous->'tags') AS tag(id)
      WHERE i.takedown_id = $1 AND i.item_type = 'profile' AND g.id = tag.id::uuid`,
    p,
  );
  await db.query(
    `UPDATE groups x SET photo_key = i.previous->>'photoKey'
       FROM ban_takedown_items i
      WHERE i.takedown_id = $1 AND i.item_type = 'group_photo' AND x.id = i.item_id::uuid AND x.photo_key IS NULL AND x.archived_at IS NULL`,
    p,
  );
  // pictures last, so the posts they belong to are back first: one waiting for a person waits again, any other is public
  const pictures = await db.query<{ key: string; previous: string }>(
    `SELECT i.item_id AS key, i.previous->>'scanStatus' AS previous FROM ban_takedown_items i
      JOIN media_uploads m ON m.key = i.item_id AND m.scan_status = 'withdrawn'
     WHERE i.takedown_id = $1 AND i.item_type = 'picture'`,
    p,
  );
  const waiting = pictures.rows.filter((r) => r.previous === 'held').map((r) => r.key);
  if (waiting.length > 0) {
    await db.query(`UPDATE media_uploads SET scan_status = 'held', withdrawn_at = NULL WHERE key = ANY($1::text[]) AND scan_status = 'withdrawn'`, [waiting]);
  }
  for (const r of pictures.rows) if (r.previous !== 'held') await releasePicture(db, r.key);

  await db.query(`DELETE FROM ban_takedown_items WHERE takedown_id = $1`, p);
  await db.query(`UPDATE ban_takedowns SET state = 'restored', restored_at = now(), restore_reason = $2 WHERE id = $1`, [
    takedownId,
    reason.slice(0, 500),
  ]);
}

/**
 * After a person's sanctions change, in that transaction: a takedown whose ban was lifted or overturned, or a Hide
 * whose suspension ended, puts content back. When another ban in force still has a takedown, the content passes to it
 * instead and stays down. Returns how many were put back.
 */
export async function settleTakedowns(db: Executor, userId: string): Promise<number> {
  const r = await db.query<TakedownRow>(
    `SELECT t.id, t.sanction_id, t.user_id, t.choice, t.state, s.kind, s.revoked_at, s.ends_at
       FROM ban_takedowns t JOIN sanctions s ON s.id = t.sanction_id
      WHERE t.user_id = $1 AND t.state = 'hidden'
      ORDER BY t.created_at
      FOR UPDATE OF t`,
    [userId],
  );
  const now = Date.now();
  const inForce = (t: TakedownRow) => t.revoked_at === null && (t.ends_at === null || t.ends_at.getTime() > now);
  // a Remove stays removed when its suspension simply ends; only lifting or overturning it brings content back
  const due = r.rows.filter((t) => t.revoked_at !== null || (!inForce(t) && t.choice === 'hide'));
  const governing = r.rows.filter((t) => inForce(t)).at(-1) ?? null;
  let restored = 0;
  for (const t of due) {
    if (governing) {
      await db.query(`UPDATE ban_takedown_items SET takedown_id = $2 WHERE takedown_id = $1`, [t.id, governing.id]);
      await db.query(`UPDATE ban_takedowns SET state = 'restored', restored_at = now(), restore_reason = 'passed to a later ban' WHERE id = $1`, [t.id]);
      continue;
    }
    await restoreTakedown(db, t.id, t.revoked_at ? 'ban lifted' : 'suspension ended');
    restored++;
  }
  return restored;
}

/** People whose takedowns are due to settle: bans lifted, or Hide suspensions ended. Bounded. */
export async function takedownsToSettle(db: Executor, limit = 200): Promise<string[]> {
  const r = await db.query<{ user_id: string }>(
    `SELECT DISTINCT t.user_id FROM ban_takedowns t JOIN sanctions s ON s.id = t.sanction_id
      WHERE t.state = 'hidden' AND t.user_id IS NOT NULL
        AND (s.revoked_at IS NOT NULL OR (t.choice = 'hide' AND s.ends_at IS NOT NULL AND s.ends_at <= now()))
      LIMIT $1`,
    [limit],
  );
  return r.rows.map((x) => x.user_id);
}

/**
 * Removals past the appeal window, with no appeal open and the ban still standing (or ended without being overturned):
 * posts and letters are deleted, and what was kept to restore everything goes. The withdrawn pictures' private copies
 * are deleted by the refused-picture sweep once nothing keeps them (pictures-service.ts `expireRefused`). Bounded.
 */
export async function purgeDue(db: Executor, limit = 50): Promise<number> {
  const due = await db.query<{ id: string }>(
    `SELECT t.id FROM ban_takedowns t JOIN sanctions s ON s.id = t.sanction_id
      WHERE t.state = 'hidden' AND t.choice = 'remove' AND t.purge_after <= now() AND s.revoked_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM appeals a WHERE a.sanction_id = t.sanction_id AND a.status = 'open')
      ORDER BY t.purge_after
      LIMIT $1`,
    [limit],
  );
  for (const { id } of due.rows) {
    await db.query(
      `DELETE FROM library_posts x USING ban_takedown_items i
        WHERE i.takedown_id = $1 AND i.item_type = 'library_post' AND x.id = i.item_id::uuid AND x.status = 'removed'`,
      [id],
    );
    await db.query(
      `DELETE FROM image_posts x USING ban_takedown_items i
        WHERE i.takedown_id = $1 AND i.item_type = 'image_post' AND x.id = i.item_id::uuid AND x.status = 'removed'`,
      [id],
    );
    await db.query(
      `DELETE FROM letters x USING ban_takedown_items i
        WHERE i.takedown_id = $1 AND i.item_type = 'letter' AND x.id = i.item_id::uuid AND x.status = 'removed'`,
      [id],
    );
    await db.query(`DELETE FROM ban_takedown_items WHERE takedown_id = $1`, [id]);
    await db.query(`UPDATE ban_takedowns SET state = 'purged', purged_at = now() WHERE id = $1`, [id]);
  }
  return due.rows.length;
}

/**
 * A moderator removing one item on a case while a ban's takedown holds it: the case takes it over, with the state it had
 * before the ban, so lifting the ban does not bring back what the case removed and overturning the case does.
 */
export async function claimFromTakedown(db: Executor, itemType: string, itemId: string): Promise<Record<string, unknown> | null> {
  const r = await db.query<{ previous: Record<string, unknown> }>(
    `DELETE FROM ban_takedown_items i USING ban_takedowns t
      WHERE i.takedown_id = t.id AND t.state = 'hidden' AND i.item_type = $1 AND i.item_id = $2
      RETURNING i.previous`,
    [itemType, itemId],
  );
  return r.rows[0]?.previous ?? null;
}

/** The content choice as sent: Keep needs nothing; Hide and Remove name what happens, and the messages tick rides on them. */
export function parseContentChoice(choice: BanContentChoice | undefined, includeMessages: boolean | undefined): { choice: BanContentChoice; includeMessages: boolean } {
  const c = choice ?? 'keep';
  if (c === 'keep' && includeMessages) {
    throw new AppError('CONTENT_CHOICE_CONFLICT', 422, 'private messages are hidden with the rest of their content, not on their own');
  }
  return { choice: c, includeMessages: c !== 'keep' && includeMessages === true };
}
