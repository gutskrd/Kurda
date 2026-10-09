import { createHash } from 'node:crypto';
import type pg from 'pg';
import { sendEmailJob } from '../jobs/email.js';
import { emailLocaleFor } from '../email/templates.js';
import type { JobQueue } from '../jobs/queue.js';
import { mediaKey, type MediaStorage } from '../media/storage.js';
import { AppError } from '../plugins/errors.js';
import { isMinorRow } from '../users/age.js';
import { handOnGroup } from '../groups/service.js';

export const DELETION_GRACE_DAYS = 14;

export interface GdprDeps {
  storage?: MediaStorage | null;
  jobs?: JobQueue;
  log?: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void };
}

export class GdprService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: GdprDeps = {},
  ) {}

  /** Starts the 14-day grace period; logging in again cancels it. */
  async requestDeletion(userId: string): Promise<void> {
    const result = await this.pool.query<{ email: string; username: string; locale: string }>(
      `UPDATE users SET deletion_requested_at = now()
       WHERE id = $1 AND deletion_requested_at IS NULL AND deleted_at IS NULL
       RETURNING email, username, locale`,
      [userId],
    );
    const user = result.rows[0];
    if (user && this.deps.jobs) {
      await this.deps.jobs
        .enqueue(sendEmailJob, {
          to: user.email,
          template: 'deletion-notice',
          vars: { username: user.username, graceDays: String(DELETION_GRACE_DAYS) },
          locale: emailLocaleFor(user.locale),
        })
        .catch(() => undefined);
    }
  }

  /** Called on successful login — a returning user keeps their account. */
  async cancelDeletion(userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE users SET deletion_requested_at = NULL
       WHERE id = $1 AND deletion_requested_at IS NOT NULL AND deleted_at IS NULL`,
      [userId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Anonymizes accounts whose grace period ended: PII scrubbed, sessions
   * and linked identities destroyed, row kept for aggregate statistics.
   * Idempotent — sets deleted_at, so a rerun skips processed rows.
   */
  async anonymizeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 24 * 3_600_000);
    const due = await this.pool.query<{ id: string; birth_year: number | null; birth_month: number | null }>(
      `SELECT id, birth_year, birth_month FROM users
       WHERE deletion_requested_at < $1 AND deleted_at IS NULL
       LIMIT 200`,
      [cutoff],
    );
    for (const row of due.rows) {
      // A minor's friends-only posts are hidden because of their birth date,
      // and anonymizing clears it: left behind under a "deleted_…" name, what
      // a 15-year-old shared with friends would become readable by anyone.
      // So a minor's deletion removes what they put in, as a child's closure
      // does, instead of leaving it.
      if (isMinorRow(row, now)) {
        await this.eraseAndAnonymize(row.id);
        this.deps.log?.info({ userId: row.id }, 'minor account deleted after grace period, with its content');
        continue;
      }
      await this.anonymize(row.id);
      this.deps.log?.info({ userId: row.id }, 'account anonymized after grace period');
    }
    return due.rows.length;
  }

  /**
   * Closes one account now and removes what the person put in it, with no
   * grace period and no email.
   *
   * For the one case where waiting would be wrong: an account we have just
   * learned belongs to someone under 13. The fourteen-day grace exists so a
   * user can change their mind, and that is not a choice this account has.
   * No email either — the address may be a child's.
   *
   * Anonymizing, which is all an ordinary deletion does, scrubs the account's
   * own fields and leaves everything the person wrote, recorded and uploaded
   * under a "deleted_…" name. For a child that is not enough: what we know
   * about them is to be deleted, their voice above all. So `eraseChildData`
   * also deletes their posts, pictures, comments, voice notes, messages,
   * friendships, groups, devices, notifications, analytics and consent
   * records, in one transaction with the anonymizing — either the account is
   * gone or none of it is, and the client is told it was closed only after it
   * was. Their files are deleted from storage after the commit; any the
   * storage cannot delete at once are left to the orphan sweep, which deletes
   * them on its next run.
   *
   * What stays is the anonymized row with the learning history every deleted
   * account keeps (XP, lessons, streaks, ledgers) — numbers tied to no name,
   * address or birth date — and moderation records, which are about other
   * people's safety.
   */
  async closeNow(userId: string, reason: 'under_minimum_age'): Promise<void> {
    const files = await this.eraseAndAnonymize(userId);
    this.deps.log?.info({ userId, reason, files }, 'account closed and its data removed');
  }

  /** `eraseChildData` and the anonymizing in one transaction, then the files. */
  private async eraseAndAnonymize(userId: string): Promise<number> {
    const client = await this.pool.connect();
    let files: string[] = [];
    try {
      await client.query('BEGIN');
      // the purge reads keys and ownerships the anonymizing would clear
      files = await eraseChildData(client, userId);
      await this.anonymize(userId, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.deleteFiles(files);
    return files.length;
  }

  /**
   * Delete stored objects nothing references any more. They were already
   * marked as orphans in the transaction that let go of them, so one that
   * fails here — or every one, when no storage is configured — is deleted by
   * the next orphan sweep (media/service.ts) instead.
   */
  private async deleteFiles(keys: string[]): Promise<void> {
    if (!this.deps.storage) return;
    for (const key of keys) {
      try {
        await this.deps.storage.delete(key);
        await this.pool.query(`DELETE FROM media_uploads WHERE key = $1`, [key]);
      } catch (err) {
        this.deps.log?.warn({ err, key }, 'could not delete a closed account’s file; the orphan sweep will');
      }
    }
  }

  private async anonymize(userId: string, executor: Pick<pg.Pool, 'query'> = this.pool): Promise<void> {
    await executor.query(
      `UPDATE users SET
         email = 'deleted_' || id || '@deleted.kurda.app',
         username = 'deleted_' || substr(id::text, 1, 8),
         display_name = NULL, bio = NULL, password_hash = NULL,
         email_verified_at = NULL,
         phone_verified_at = NULL, phone_hash = NULL, phone_masked = NULL,
         birth_year = NULL, birth_month = NULL,
         token_version = token_version + 1,
         deleted_at = now()
       WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    await executor.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await executor.query(`DELETE FROM oauth_identities WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM email_tokens WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM phone_verifications WHERE user_id = $1`, [userId]);
  }

  /** Creates an export request; the worker fulfills it. */
  async requestExport(userId: string): Promise<string> {
    if (!this.deps.storage) {
      throw new AppError('EXPORT_NOT_AVAILABLE', 503, 'data export is not available right now');
    }
    const existing = await this.pool.query<{ id: string }>(
      `SELECT id FROM user_exports
       WHERE user_id = $1 AND requested_at > now() - interval '24 hours'
       ORDER BY requested_at DESC LIMIT 1`,
      [userId],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    const created = await this.pool.query<{ id: string }>(
      `INSERT INTO user_exports (user_id) VALUES ($1) RETURNING id`,
      [userId],
    );
    return (created.rows[0] as { id: string }).id;
  }

  /**
   * Gathers everything we store about the user into one document — the birth
   * month and year included, which are personal data like the rest.
   */
  async buildExport(userId: string): Promise<Record<string, unknown>> {
    const user = await this.pool.query(
      `SELECT id, email, username, display_name, bio, locale, timezone, roles,
              email_verified_at, phone_verified_at, phone_masked,
              birth_year, birth_month,
              created_at, updated_at, deletion_requested_at
       FROM users WHERE id = $1`,
      [userId],
    );
    const sessions = await this.pool.query(
      `SELECT device_name, created_at, expires_at, revoked_at
       FROM refresh_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [userId],
    );
    const identities = await this.pool.query(
      `SELECT provider, email_at_link, created_at FROM oauth_identities WHERE user_id = $1`,
      [userId],
    );
    return {
      exportedAt: new Date().toISOString(),
      format: 'kurda-user-export/v1',
      user: user.rows[0] ?? null,
      sessions: sessions.rows,
      oauthIdentities: identities.rows,
    };
  }

  /** Worker-side fulfillment: build, upload, mark completed. */
  async fulfillExport(exportId: string): Promise<void> {
    if (!this.deps.storage) throw new Error('storage not configured');
    const row = await this.pool.query<{ user_id: string; completed_at: Date | null }>(
      `SELECT user_id, completed_at FROM user_exports WHERE id = $1`,
      [exportId],
    );
    const record = row.rows[0];
    if (!record || record.completed_at) return; // idempotent

    const body = Buffer.from(JSON.stringify(await this.buildExport(record.user_id), null, 2));
    const sha256Hex = createHash('sha256').update(body).digest('hex');
    const key = mediaKey('user-export', sha256Hex, 'application/json');
    /*
     * Written with private, no-store headers and straight from here.
     *
     * This used to take a signed upload URL and PUT to it over the network —
     * the server fetching a URL it had just signed for itself, to reach a
     * bucket it holds the credentials for. The round trip bought nothing, and
     * it went through the path that stamps `public, max-age=31536000,
     * immutable` on what it stores, because everything else that path stores is
     * a picture. So a file holding one person's account, sessions and linked
     * identities was a public object with a year-long cache directive.
     */
    await this.deps.storage.putPrivate(key, body, 'application/json');
    await this.pool.query(
      `UPDATE user_exports SET storage_key = $2, completed_at = now() WHERE id = $1`,
      [exportId, key],
    );
  }

  /** Latest export status + fresh signed URL when ready. */
  async exportStatus(
    userId: string,
  ): Promise<{ status: 'none' | 'pending' | 'ready'; downloadUrl?: string; requestedAt?: string }> {
    const row = await this.pool.query<{
      storage_key: string | null;
      completed_at: Date | null;
      requested_at: Date;
    }>(
      `SELECT storage_key, completed_at, requested_at FROM user_exports
       WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`,
      [userId],
    );
    const record = row.rows[0];
    if (!record) return { status: 'none' };
    if (!record.completed_at || !record.storage_key) {
      return { status: 'pending', requestedAt: new Date(record.requested_at).toISOString() };
    }
    return {
      status: 'ready',
      requestedAt: new Date(record.requested_at).toISOString(),
      downloadUrl: await this.deps.storage!.createDownloadUrl(record.storage_key),
    };
  }
}

/**
 * Everything a closed child's account holds beyond its own fields, deleted in
 * the caller's transaction (see `GdprService.closeNow`). Returns the storage
 * keys nobody else uses any more, already marked as orphans, for the caller to
 * delete from storage once this has committed.
 *
 * Posts and pictures go with the comments, reactions and likes on them. The
 * child's own comments on other people's posts are emptied the way a deleted
 * comment is (the tombstone keeps the replies under it in place) and no longer
 * counted. Groups they own are handed on before they leave them.
 */
export async function eraseChildData(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<string[]> {
  const q = (sql: string, params: unknown[] = [userId]) => executor.query(sql, params);

  // the files, read before the rows that point at them go
  const keys = await executor.query<{ key: string }>(
    `SELECT profile_photo_key AS key FROM users WHERE id = $1 AND profile_photo_key IS NOT NULL
     UNION SELECT image_media_id FROM image_posts WHERE author_id = $1
     UNION SELECT audio_media_id FROM library_posts WHERE author_id = $1 AND audio_media_id IS NOT NULL
     UNION SELECT audio_media_id FROM library_comments WHERE author_id = $1 AND audio_media_id IS NOT NULL`,
    [userId],
  );
  const exports = await executor.query<{ key: string }>(
    `SELECT storage_key AS key FROM user_exports WHERE user_id = $1 AND storage_key IS NOT NULL`,
    [userId],
  );

  // their posts, and the likes and saves pointing at them (no foreign key)
  const libraryPosts = await executor.query<{ id: string }>(
    `DELETE FROM library_posts WHERE author_id = $1 RETURNING id`,
    [userId],
  );
  const imagePosts = await executor.query<{ id: string }>(
    `DELETE FROM image_posts WHERE author_id = $1 RETURNING id`,
    [userId],
  );
  await q(
    `DELETE FROM post_engagements
      WHERE (target_type = 'library' AND target_id = ANY($1::uuid[]))
         OR (target_type = 'image' AND target_id = ANY($2::uuid[]))`,
    [libraryPosts.rows.map((r) => r.id), imagePosts.rows.map((r) => r.id)],
  );
  await q(`DELETE FROM post_engagements WHERE user_id = $1`);

  // their comments elsewhere: emptied and uncounted, as a deleted comment is
  await q(
    `UPDATE library_posts p SET comment_count = GREATEST(0, p.comment_count - c.n)
       FROM (SELECT post_id, count(*)::int n FROM library_comments
              WHERE author_id = $1 AND status = 'visible' GROUP BY post_id) c
      WHERE p.id = c.post_id`,
  );
  await q(
    `UPDATE library_comments SET status = 'removed', body = NULL, audio_media_id = NULL, updated_at = now()
      WHERE author_id = $1`,
  );
  await q(
    `UPDATE image_posts p SET comment_count = GREATEST(0, p.comment_count - c.n)
       FROM (SELECT post_id, count(*)::int n FROM image_comments
              WHERE author_id = $1 AND status = 'visible' GROUP BY post_id) c
      WHERE p.id = c.post_id`,
  );
  await q(`UPDATE image_comments SET status = 'removed', body = NULL, updated_at = now() WHERE author_id = $1`);
  await q(
    `UPDATE image_posts p SET reaction_count = GREATEST(0, p.reaction_count - 1)
       FROM image_reactions r WHERE r.post_id = p.id AND r.user_id = $1`,
  );
  await q(`DELETE FROM image_reactions WHERE user_id = $1`);

  // messages, both sides of every conversation they were in
  await q(`DELETE FROM dm_messages WHERE user_lo = $1 OR user_hi = $1`);
  await q(`DELETE FROM group_messages WHERE sender_id = $1`);

  // groups: hand on the ones they own, then leave them all
  const owned = await executor.query<{ group_id: string }>(
    `SELECT group_id FROM group_members WHERE user_id = $1 AND role = 'owner'`,
    [userId],
  );
  await q(`DELETE FROM group_members WHERE user_id = $1`);
  await q(`DELETE FROM group_reads WHERE user_id = $1`);
  await q(`DELETE FROM group_mutes WHERE user_id = $1`);
  for (const row of owned.rows) {
    await q(`UPDATE groups SET owner_id = NULL WHERE id = $1 AND owner_id = $2`, [row.group_id, userId]);
    await handOnGroup(executor, row.group_id);
  }

  // the people they knew, and what reached them
  await q(`DELETE FROM friendships WHERE user_lo = $1 OR user_hi = $1`);
  await q(`DELETE FROM blocks WHERE blocker_id = $1 OR blocked_id = $1`);
  await q(`DELETE FROM device_tokens WHERE user_id = $1`);
  await q(`DELETE FROM notification_prefs WHERE user_id = $1`);
  await q(`DELETE FROM notifications WHERE user_id = $1`);
  await q(`DELETE FROM streak_reminders_sent WHERE user_id = $1`);
  await q(`DELETE FROM activity_congrats WHERE user_id = $1`);
  await q(`DELETE FROM activity_events WHERE actor_id = $1`);
  await q(`DELETE FROM analytics_events WHERE user_id = $1`);
  await q(`DELETE FROM user_tags WHERE user_id = $1`);
  await q(`DELETE FROM saved_words WHERE user_id = $1`);
  await q(`DELETE FROM user_exports WHERE user_id = $1`);

  // every way back in, and the consent they gave
  await q(`DELETE FROM refresh_tokens WHERE user_id = $1`);
  await q(`DELETE FROM email_verification_codes WHERE user_id = $1`);
  await q(
    `UPDATE users SET
       profile_photo_key = NULL, selected_avatar_key = NULL, country = NULL,
       favorite_poem_id = NULL, favorite_story_id = NULL, last_seen_at = NULL,
       consent_version = NULL, consented_at = NULL, analytics_consent = false,
       profile_sections = '{}'::jsonb, leagues_enabled = NULL
     WHERE id = $1`,
  );

  // files nobody else uses (keys are content hashes, so two people can share
  // one) and that are not held as evidence, marked as orphans
  const unused = await executor.query<{ key: string }>(
    `SELECT k.key FROM unnest($1::text[]) AS k(key)
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.profile_photo_key = k.key)
        AND NOT EXISTS (SELECT 1 FROM image_posts i WHERE i.image_media_id = k.key)
        AND NOT EXISTS (SELECT 1 FROM library_posts l WHERE l.audio_media_id = k.key)
        AND NOT EXISTS (SELECT 1 FROM library_comments c WHERE c.audio_media_id = k.key)
        AND NOT EXISTS (SELECT 1 FROM image_scans s WHERE s.media_key = k.key AND s.preserve_evidence)`,
    [keys.rows.map((r) => r.key)],
  );
  const files = [...unused.rows.map((r) => r.key), ...exports.rows.map((r) => r.key)];
  await q(
    `INSERT INTO media_uploads (key, content_type, content_length, created_at)
     SELECT k, 'application/octet-stream', 0, now() - interval '2 days' FROM unnest($1::text[]) AS k
     ON CONFLICT (key) DO UPDATE SET confirmed_at = NULL, created_at = now() - interval '2 days'`,
    [files],
  );
  return files;
}
