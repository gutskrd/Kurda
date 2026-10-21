import { createHash } from 'node:crypto';
import type pg from 'pg';
import { sendEmailJob } from '../jobs/email.js';
import { emailLocaleFor } from '../email/templates.js';
import type { JobQueue } from '../jobs/queue.js';
import { mediaKey, type MediaStorage } from '../media/storage.js';
import { AppError } from '../plugins/errors.js';
import { handOnGroup } from '../groups/service.js';
import type { StoryGamesService } from '../story-games/service.js';
import { standaloneStoryGames } from '../story-games/standalone.js';
import { eraseRanks, exportRanks } from '../ranks/gdpr.js';
import { exportPosts } from './posts-export.js';
import { exportProgress } from './progress-export.js';
import { requestQuarantine, runQuarantine } from '../moderation/quarantine.js';
import { userHash } from '../moderation/pseudonym.js';
import type { AppleTokens } from '../auth/apple-tokens.js';

export const DELETION_GRACE_DAYS = 14;

export interface GdprDeps {
  storage?: MediaStorage | null;
  jobs?: JobQueue;
  log?: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void };
  /**
   * Takes a closing account out of the story games it is still in. The API
   * passes its own; by default one that pays rewards as the API does but wakes
   * nobody (the worker passes one that tells the API instances, over Redis).
   */
  storyGames?: Pick<StoryGamesService, 'leaveAll'>;
  /**
   * Revokes at Apple what Sign in with Apple issued for an account that is
   * closing for good (auth/apple-tokens.ts). Null or absent where Apple's key
   * is not configured, and nothing is revoked.
   */
  apple?: Pick<AppleTokens, 'revokeFor'> | null;
}

export class GdprService {
  private readonly storyGames: Pick<StoryGamesService, 'leaveAll'>;

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: GdprDeps = {},
  ) {
    this.storyGames = deps.storyGames ?? standaloneStoryGames(pool, { log: deps.log });
  }

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
   * Closes, for good, the accounts whose grace period ended: Sign in with
   * Apple revoked, then everything the person put in the account deleted
   * (`eraseAccountData`) and the account's own fields scrubbed, in one
   * transaction. What the app tells them when they ask — "your account and all
   * your data will be permanently deleted" — is what happens.
   *
   * It used to be different for adults: their account was anonymized and what
   * they had written, recorded and uploaded stayed up under a "deleted_…"
   * name, their messages in their friends' conversations with it. Only a
   * minor's went. Somebody who deletes their account expects their posts and
   * their voice to go with it, and that is what deleting an account has to
   * mean.
   *
   * What stays is the scrubbed row with the learning history every deleted
   * account keeps (XP, lessons, streaks, ledgers) — numbers tied to no name,
   * address or birth date — and moderation records, which are about other
   * people's safety. Gifts already given stay with whoever received them,
   * shown as from a former member (shop `giftsReceived`).
   *
   * Idempotent — sets deleted_at, so a rerun skips processed rows.
   */
  async anonymizeExpired(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - DELETION_GRACE_DAYS * 24 * 3_600_000);
    const due = await this.pool.query<{ id: string }>(
      `SELECT id FROM users
       WHERE deletion_requested_at < $1 AND deleted_at IS NULL
       LIMIT 200`,
      [cutoff],
    );
    for (const row of due.rows) {
      await this.leaveStoryGames(row.id);
      await this.revokeAppleSignIn(row.id);
      const files = await this.eraseAndAnonymize(row.id);
      this.deps.log?.info({ userId: row.id, files }, 'account deleted after grace period, with its content');
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
   * It removes what an ordinary deletion removes at the end of its grace
   * period: `eraseAccountData` deletes their posts, pictures, comments, voice
   * notes, messages, friendships, groups, story games, devices,
   * notifications, analytics and consent records, in one transaction with the
   * anonymizing — either the account is gone or none of it is, and the client
   * is told it was closed only after it was. Their files are deleted from storage after the commit;
   * any the storage cannot delete at once are left to the orphan sweep, which
   * deletes them on its next run.
   *
   * What stays is the anonymized row with the learning history every deleted
   * account keeps (XP, lessons, streaks, ledgers) — numbers tied to no name,
   * address or birth date — and moderation records, which are about other
   * people's safety.
   */
  async closeNow(userId: string, reason: 'under_minimum_age'): Promise<void> {
    await this.leaveStoryGames(userId);
    await this.revokeAppleSignIn(userId);
    const files = await this.eraseAndAnonymize(userId);
    this.deps.log?.info({ userId, reason, files }, 'account closed and its data removed');
  }

  /**
   * A closing account leaves the story games it is still in first, through
   * the games' own leave path — each game locked on its own, after nothing
   * else is held — so a lobby it hosts closes and a running game stops
   * waiting for a player who will never come back. Finished games stay for
   * the other players; the erase that follows takes this account's seat out.
   */
  private async leaveStoryGames(userId: string): Promise<void> {
    await this.storyGames.leaveAll(userId).catch((err) => {
      this.deps.log?.warn({ err, userId }, 'could not take a closing account out of its story games');
    });
  }

  /**
   * App Store guideline 5.1.1(v): deleting an account that signed in with
   * Apple revokes, at Apple, the refresh token kept for it, which ends the
   * app's Sign in with Apple for that person too. Asked before anonymizing,
   * which deletes the identity that holds the token, and outside its
   * transaction, which no request to another service should hold open. Apple
   * refusing or not answering is logged and the account closes all the same.
   */
  private async revokeAppleSignIn(userId: string): Promise<void> {
    await this.deps.apple?.revokeFor(userId).catch((err: unknown) => {
      this.deps.log?.warn({ err, userId }, 'could not revoke a closing account’s Sign in with Apple');
    });
  }

  /** `eraseAccountData` and the anonymizing in one transaction, then the files. */
  private async eraseAndAnonymize(userId: string): Promise<number> {
    const client = await this.pool.connect();
    let files: string[] = [];
    try {
      await client.query('BEGIN');
      // the purge reads keys and ownerships the anonymizing would clear
      files = await eraseAccountData(client, userId);
      await this.anonymize(userId, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await this.deleteFiles(files);
    // what a report still holds as evidence leaves the public bucket now, and
    // is deleted with the evidence (the five-minute sweep retries a failure)
    await runQuarantine(this.pool, this.deps.storage, { log: this.deps.log });
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
    // what they wrote to the support address, with the answers to it: it is
    // found by their address, which the next statement replaces, so first
    await eraseSupportMail(executor, userId);
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
    // what sign-in protection kept about the account: its devices and networks
    // (and the failure counts kept under them), the security emails it was
    // sent, any count or lock on it, the failures aimed at it, and the networks
    // it was seen on
    await executor.query(
      `DELETE FROM auth_lockouts WHERE scope = 'device' AND key IN (SELECT device_hash FROM known_devices WHERE user_id = $1)`,
      [userId],
    );
    await executor.query(`DELETE FROM known_devices WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM security_notices WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM auth_lockouts WHERE scope = 'account' AND key = $1::text`, [userId]);
    await executor.query(`DELETE FROM auth_network_failures WHERE target_hash = $1`, [userHash(userId)]);
    await executor.query(`DELETE FROM network_sightings WHERE user_id = $1`, [userId]);
    // off this week's league table at once (their earlier weeks stay, tied to
    // no name), their showcase gone from the profile nobody can open now, and
    // no badge push queued for an account that is closed
    await executor.query(
      `UPDATE league_members SET left_at = now()
        WHERE user_id = $1 AND left_at IS NULL
          AND cohort_id IN (SELECT id FROM league_cohorts WHERE NOT settled)`,
      [userId],
    );
    await executor.query(`DELETE FROM badge_showcase WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM badge_push_days WHERE user_id = $1`, [userId]);
    // what they wrote in the rating box or Send feedback is their words; the
    // stars and chips stay in the counts, tied to an anonymised account. An
    // answer that was only words has nothing left once they go — and the
    // table refuses an empty answer, so scrubbing it would fail, after the
    // account above was already anonymised and would never be picked again
    await executor.query(
      `DELETE FROM app_feedback WHERE user_id = $1 AND stars IS NULL AND cardinality(categories) = 0`,
      [userId],
    );
    await executor.query(`UPDATE app_feedback SET comment = NULL WHERE user_id = $1 AND comment IS NOT NULL`, [
      userId,
    ]);
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
    // what they posted, pictures as links to the files
    const posts = await exportPosts(this.pool, userId, (k) => this.deps.storage?.publicUrl(k) ?? null);
    const identities = await this.pool.query(
      `SELECT provider, email_at_link, created_at FROM oauth_identities WHERE user_id = $1`,
      [userId],
    );
    // their story games, as they played them — nothing about the other players
    const storyGames = await this.pool.query(
      `SELECT g.mode, COALESCE(g.story_snapshot->>'title', s.title) AS story_title, g.status, g.finished_at,
              g.question_count, p.score, p.correct, p.answered, p.xp_awarded
         FROM story_game_players p JOIN story_games g ON g.id = p.game_id
         LEFT JOIN stories s ON s.id = g.story_id
        WHERE p.user_id = $1 ORDER BY g.created_at DESC LIMIT 1000`,
      [userId],
    );
    // when they were asked for a rating, and their answers as they gave them;
    // the inbox's status and staff notes are the team's working state, not
    // something they told us
    const prompts = await this.pool.query(
      `SELECT app_feedback_prompted_at, store_review_prompted_at, store_review_count, store_review_version
         FROM users WHERE id = $1`,
      [userId],
    );
    const feedback = await this.pool.query(
      `SELECT stars, categories, comment, source, platform, app_version, locale, created_at
         FROM app_feedback WHERE user_id = $1 ORDER BY created_at`,
      [userId],
    );
    // their Game Ranks, every change with its reason (ranks/gdpr.ts)
    const ranks = await exportRanks(this.pool, userId);
    // what they wrote to the support address from this account's address, and
    // what they were answered; who on the team answered is not theirs
    // the devices and networks that have signed in to the account, by when,
    // the networks it was seen on by day, and the security emails it was sent;
    // each device and network is kept only as a keyed hash, which would mean
    // nothing to them, so the hashes are left out
    const devices = await this.pool.query(
      `SELECT kind, first_seen_at, last_seen_at, expires_at FROM known_devices WHERE user_id = $1 ORDER BY first_seen_at`,
      [userId],
    );
    const networks = await this.pool.query(
      `SELECT day, count(*)::int AS networks_seen FROM network_sightings WHERE user_id = $1 GROUP BY day ORDER BY day`,
      [userId],
    );
    const notices = await this.pool.query(
      `SELECT kind, sent_at FROM security_notices WHERE user_id = $1 ORDER BY sent_at`,
      [userId],
    );
    const support = await this.pool.query(
      `SELECT e.subject, e.received_at, e.text_body, e.html_body,
              COALESCE((SELECT json_agg(json_build_object('body', r.body, 'sentAt', r.sent_at) ORDER BY r.sent_at)
                          FROM support_email_replies r WHERE r.email_id = e.id), '[]'::json) AS answers
         FROM support_emails e
        WHERE e.from_address = (SELECT lower(u.email::text) FROM users u WHERE u.id = $1)
        ORDER BY e.received_at`,
      [userId],
    );
    return {
      exportedAt: new Date().toISOString(),
      format: 'kurda-user-export/v1',
      user: user.rows[0] ?? null,
      posts,
      sessions: sessions.rows,
      signInDevices: devices.rows,
      networksSeen: networks.rows,
      securityEmails: notices.rows,
      oauthIdentities: identities.rows,
      storyGames: storyGames.rows,
      appFeedback: { ...prompts.rows[0], answers: feedback.rows },
      gameRanks: ranks,
      supportEmails: support.rows,
      // XP, leagues, streaks and badges (gdpr/progress-export.ts)
      progress: await exportProgress(this.pool, userId),
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
      downloadUrl: await this.deps.storage!.createPrivateDownloadUrl(record.storage_key),
    };
  }
}

/**
 * Mail the account's owner sent to the support address, and the answers to it
 * (they go with it, by the foreign key). Found by the account's address, which
 * is the one thing the inbox knows them by — so this has to run before the
 * address is replaced, and it is the reason a closed account's address does
 * not live on in the inbox after the account itself has been anonymized.
 */
export async function eraseSupportMail(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<void> {
  await executor.query(
    `DELETE FROM support_emails
      WHERE from_address = (SELECT lower(u.email::text) FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL)`,
    [userId],
  );
}

/**
 * Everything a closing account holds beyond its own fields, deleted in the
 * caller's transaction (see `GdprService.anonymizeExpired` and `closeNow`). Returns the storage
 * keys nobody else uses any more, already marked as orphans, for the caller to
 * delete from storage once this has committed.
 *
 * A file a report still holds as evidence is not returned: it is marked as an
 * orphan all the same (the sweep leaves it alone while the evidence is kept,
 * and takes it once the retention lets it go), and it is quarantined — taken
 * off the public bucket into private storage — since nothing may show the
 * person's picture any more, and the bucket would otherwise go on serving it.
 *
 * Posts and pictures go with the comments, reactions and likes on them. The
 * person's own comments on other people's posts are emptied the way a deleted
 * comment is (the tombstone keeps the replies under it in place) and no longer
 * counted. Groups they own are handed on before they leave them.
 */
export async function eraseAccountData(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<string[]> {
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
  // the pictures on their written posts, and every other picture they uploaded
  // for a post: never posted (the sweep would take those in a day; a closed
  // account's go now), or taken off a reported post and kept for its case —
  // a report's evidence marks those, so they are quarantined below like any
  // other file held as evidence
  const pictures = await executor.query<{ key: string }>(
    `SELECT m.media_key AS key FROM library_post_media m JOIN library_posts p ON p.id = m.post_id WHERE p.author_id = $1
     UNION SELECT key FROM media_uploads WHERE uploader_id = $1`,
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

  // story games: their name off the games they hosted, then their answers and
  // seats (they left the unfinished ones through the leave path before this
  // transaction). The games first: a game's own transactions lock it before
  // its players, and this takes them in the same order.
  await q(`UPDATE story_games SET host_id = NULL WHERE host_id = $1`);
  await q(`DELETE FROM story_game_answers WHERE user_id = $1`);
  await q(`DELETE FROM story_game_players WHERE user_id = $1`);
  // their Game Ranks: ratings, history, leaves, choices, seasons (ranks/gdpr.ts)
  await eraseRanks(executor, userId);

  // messages, both sides of every conversation they were in — the gifts in
  // them with the rest
  await q(`DELETE FROM dm_messages WHERE user_lo = $1 OR user_hi = $1`);
  await q(`DELETE FROM group_messages WHERE sender_id = $1`);
  // and a gift posted in a group for them alone, a message about nobody else;
  // one to several friends stays for the others, its card no longer listing a
  // closed account (gifts/cards.ts)
  await q(
    `DELETE FROM group_messages m
      WHERE m.gift_batch_id IS NOT NULL
        AND m.gift_batch_id IN (SELECT g.batch_id FROM gifts g WHERE g.to_user_id = $1)
        AND NOT EXISTS (SELECT 1 FROM gifts o WHERE o.batch_id = m.gift_batch_id AND o.to_user_id <> $1)`,
  );
  // The line each friend was sent about a present from them ("<name> sent you
  // …", with their id in its data) is in the friend's notifications, not
  // theirs, so the delete of their own below does not reach it. Found through
  // the gifts they gave, which name every friend who was sent one — the shop's
  // older lines, which have the same kind and sender, as well.
  await q(
    `DELETE FROM notifications
      WHERE user_id IN (SELECT to_user_id FROM gifts WHERE from_user_id = $1::uuid)
        AND data->>'kind' = 'gift' AND data->>'fromUserId' = $1::text`,
  );
  // The gift rows stay: what they gave is the recipient's, and what they were
  // given stays with the anonymized account as its other history does (its
  // row is kept, so the foreign keys' own clean-up never runs). Only the line
  // from someone else's present back to this account goes, so it reads as
  // from a former member.
  await q(`UPDATE gifts SET from_user_id = NULL WHERE from_user_id = $1`);

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
  // game invites from and to them, and their rematch offers: the account is
  // anonymized, not deleted, so the foreign keys' cascade never runs
  await q(`DELETE FROM play_invites WHERE host_id = $1 OR invitee_id = $1`);
  await q(`DELETE FROM play_rematches WHERE user_id = $1`);
  await q(`DELETE FROM streak_reminders_sent WHERE user_id = $1`);
  await q(`DELETE FROM activity_congrats WHERE user_id = $1`);
  await q(`DELETE FROM activity_events WHERE actor_id = $1`);
  await q(`DELETE FROM analytics_events WHERE user_id = $1`);
  await q(`DELETE FROM app_feedback WHERE user_id = $1`);
  await q(`DELETE FROM user_tags WHERE user_id = $1`);
  await q(`DELETE FROM saved_words WHERE user_id = $1`);
  // the badges they showed on their profile, as the rest of what was shown there
  await q(`DELETE FROM user_badges WHERE user_id = $1`);
  await q(`DELETE FROM badge_users WHERE user_id = $1`);
  await q(`DELETE FROM badge_rated_games WHERE user_id = $1`);
  await q(`DELETE FROM badge_rank_seasons WHERE user_id = $1`);
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
  // one), marked as orphans; the ones held as evidence are quarantined instead
  // of deleted
  const unused = await executor.query<{ key: string; evidence: boolean }>(
    `SELECT k.key,
            (EXISTS (SELECT 1 FROM media_uploads m WHERE m.key = k.key AND m.preserve_evidence)
             OR EXISTS (SELECT 1 FROM image_scans s WHERE s.media_key = k.key AND s.preserve_evidence)) AS evidence
       FROM unnest($1::text[]) AS k(key)
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.profile_photo_key = k.key)
        AND NOT EXISTS (SELECT 1 FROM image_posts i WHERE i.image_media_id = k.key)
        AND NOT EXISTS (SELECT 1 FROM library_posts l WHERE l.audio_media_id = k.key)
        AND NOT EXISTS (SELECT 1 FROM library_post_media pm WHERE pm.media_key = k.key)
        AND NOT EXISTS (SELECT 1 FROM library_comments c WHERE c.audio_media_id = k.key)`,
    // once each: an old picture post's upload is both its picture and one of
    // their uploads, and a key twice would fail the marking below
    [[...new Set([...keys.rows, ...pictures.rows].map((r) => r.key))]],
  );
  const evidence = unused.rows.filter((r) => r.evidence).map((r) => r.key);
  const files = [...unused.rows.filter((r) => !r.evidence).map((r) => r.key), ...exports.rows.map((r) => r.key)];
  await q(
    `INSERT INTO media_uploads (key, content_type, content_length, created_at)
     SELECT k, 'application/octet-stream', 0, now() - interval '2 days' FROM unnest($1::text[]) AS k
     ON CONFLICT (key) DO UPDATE SET confirmed_at = NULL, created_at = now() - interval '2 days'`,
    [[...files, ...evidence]],
  );
  await requestQuarantine(executor, evidence);
  return files;
}
