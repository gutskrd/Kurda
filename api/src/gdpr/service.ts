import { createHash } from 'node:crypto';
import type pg from 'pg';
import { sendEmailJob } from '../jobs/email.js';
import { emailLocaleFor } from '../email/templates.js';
import type { JobQueue } from '../jobs/queue.js';
import { PrivateStorageUnavailable, mediaKey, type MediaStorage } from '../media/storage.js';
import { AppError } from '../plugins/errors.js';
import { lockPersonFor } from '../limits/limits.js';
import { inTransaction } from '../moderation/tx.js';
import { handOnGroups } from '../groups/service.js';
import type { StoryGamesService } from '../story-games/service.js';
import { standaloneStoryGames } from '../story-games/standalone.js';
import type { MultiplayerService } from '../mp/service.js';
import { standaloneMultiplayer } from '../mp/standalone.js';
import { eraseRanks, exportRanks } from '../ranks/gdpr.js';
import { exportPosts } from './posts-export.js';
import { exportProgress } from './progress-export.js';
import { requestQuarantine, runQuarantine } from '../moderation/quarantine.js';
import { userHash } from '../moderation/pseudonym.js';
import type { AppleTokens } from '../auth/apple-tokens.js';
import { GUEST_IDLE_DAYS } from '../auth/guest.js';
import { UNCONFIRMED_SIGNUP, UNCONFIRMED_SIGNUP_DAYS, forgetOldSends } from '../auth/pending-signups.js';

export const DELETION_GRACE_DAYS = 14;

/**
 * Cancels a deletion still in its grace period, since the app and the notice promise that signing in again keeps the
 * account. Every sign-in path calls this before issuing a session. True when there was a deletion to cancel.
 */
export async function cancelPendingDeletion(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<boolean> {
  const result = await executor.query(
    `UPDATE users SET deletion_requested_at = NULL
     WHERE id = $1 AND deletion_requested_at IS NOT NULL AND deleted_at IS NULL`,
    [userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export interface GdprDeps {
  storage?: MediaStorage | null;
  jobs?: JobQueue;
  log?: { info: (obj: unknown, msg: string) => void; warn: (obj: unknown, msg: string) => void };
  /**
   * Takes a closing account out of the story games it is in. The API passes its own; the default pays as the API does
   * but wakes nobody, and the worker passes one that notifies the API instances over Redis.
   */
  storyGames?: Pick<StoryGamesService, 'leaveAll'>;
  /** The same for the multiplayer learning games (api/src/mp). */
  multiplayer?: Pick<MultiplayerService, 'leaveAll'>;
  /** Revokes Sign in with Apple for an account closing for good (auth/apple-tokens.ts); null where the key is not configured. */
  apple?: Pick<AppleTokens, 'revokeFor'> | null;
}

export class GdprService {
  private readonly storyGames: Pick<StoryGamesService, 'leaveAll'>;
  private readonly multiplayer: Pick<MultiplayerService, 'leaveAll'>;

  constructor(
    private readonly pool: pg.Pool,
    private readonly deps: GdprDeps = {},
  ) {
    this.storyGames = deps.storyGames ?? standaloneStoryGames(pool, { log: deps.log });
    this.multiplayer = deps.multiplayer ?? standaloneMultiplayer(pool, { log: deps.log });
  }

  /**
   * Starts the 14-day grace period, which signing in again cancels. Every session of the account ends here, on every
   * device, so nothing carries on signed in unaware; the next screen anywhere is the sign-in. Ending the sessions also
   * takes the account's phones off its notifications (migration `push-ends-with-its-session`).
   */
  async requestDeletion(userId: string): Promise<void> {
    const result = await this.pool.query<{ email: string | null; username: string; locale: string }>(
      `UPDATE users SET deletion_requested_at = now()
       WHERE id = $1 AND deletion_requested_at IS NULL AND deleted_at IS NULL
       RETURNING email, username, locale`,
      [userId],
    );
    await this.pool.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
    const user = result.rows[0];
    // the notice goes to the address; a guest's row has none (DELETE /me closes a guest at once)
    if (user && user.email !== null && this.deps.jobs) {
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

  /** A returning user keeps their account (`cancelPendingDeletion`). */
  async cancelDeletion(userId: string): Promise<boolean> {
    return cancelPendingDeletion(this.pool, userId);
  }

  /**
   * Closes for good the accounts whose grace period ended, in one transaction each: Sign in with Apple revoked,
   * everything the person put in the account deleted (`eraseAccountData`), and the account's own fields scrubbed, as
   * the app promises. What stays is the scrubbed row with its anonymous learning history (XP, lessons, streaks,
   * ledgers) and moderation records, which concern other people's safety; gifts already given stay with their
   * recipients as from a former member. Idempotent: deleted_at is set, so a rerun skips processed rows.
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
   * Closes one account now and removes its data, with no grace period and no email. For an account just found to
   * belong to someone under 13, who has no choice to change their mind and whose address may be a child's; and for a
   * guest (auth/guest.ts) who deletes or goes idle for GUEST_IDLE_DAYS, who has no address and no way back.
   *
   * It removes what an ordinary deletion removes, in one transaction with the anonymising, so the client hears it was
   * closed only once it was. Files are deleted after the commit, and any storage cannot delete at once go on the next
   * orphan sweep. What stays is the same as for `anonymizeExpired`.
   */
  async closeNow(userId: string, reason: 'under_minimum_age' | 'guest_left' | 'guest_idle' | 'never_confirmed'): Promise<void> {
    await this.leaveStoryGames(userId);
    await this.revokeAppleSignIn(userId);
    const files = await this.eraseAndAnonymize(userId);
    this.deps.log?.info({ userId, reason, files }, 'account closed and its data removed');
  }

  /**
   * Closes the guests nobody has touched for GUEST_IDLE_DAYS (jobs/guest-jobs.ts). "Touched" is the latest of
   * creation, the presence heartbeat (`last_seen_at`) and the last refresh token, which the app renews whenever it is
   * used, so nothing new is written to know it. Idempotent and batched; a backlog waits for the next run.
   */
  async purgeIdleGuests(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - GUEST_IDLE_DAYS * 24 * 3_600_000);
    const due = await this.pool.query<{ id: string }>(
      `SELECT u.id FROM users u
        WHERE u.guest AND u.deleted_at IS NULL
          AND GREATEST(u.created_at, COALESCE(u.last_seen_at, u.created_at),
                       COALESCE((SELECT max(rt.created_at) FROM refresh_tokens rt WHERE rt.user_id = u.id), u.created_at)) < $1
        ORDER BY u.created_at
        LIMIT 200`,
      [cutoff],
    );
    for (const row of due.rows) await this.closeNow(row.id, 'guest_idle');
    return due.rows.length;
  }

  /**
   * Ends a sign-up whose address was never confirmed (auth/pending-signups.ts) and says what became of it. One made
   * from nothing is closed at once with no notice, since there is nothing to come back for and the address was never
   * shown to be theirs. One a guest made by giving an address keeps the guest's learning: the address, password and
   * code go and the row is a guest again, unless `keepLearning: false` asks for it to be closed too. Rechecked under
   * the row's lock, so an account confirmed, deleted or linked a moment ago is 'kept'.
   */
  async endUnconfirmedSignup(userId: string, opts: { keepLearning?: boolean } = {}): Promise<'closed' | 'lapsed' | 'kept'> {
    const keepLearning = opts.keepLearning ?? true;
    const lapsed = await inTransaction(this.pool, async (client) => {
      const row = await client.query<{ claimed: boolean }>(
        `SELECT u.claimed_from_guest_at IS NOT NULL AS claimed FROM users u WHERE u.id = $1 AND ${UNCONFIRMED_SIGNUP} FOR UPDATE OF u`,
        [userId],
      );
      const found = row.rows[0];
      if (!found) return 'kept' as const;
      if (!found.claimed || !keepLearning) return 'close' as const;
      await client.query(`DELETE FROM email_verification_codes WHERE user_id = $1`, [userId]);
      await client.query(`UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
      await client.query(
        `UPDATE users SET guest = true, email = NULL, password_hash = NULL, email_verified_at = NULL, claimed_from_guest_at = NULL
          WHERE id = $1`,
        [userId],
      );
      return 'lapsed' as const;
    });
    if (lapsed === 'close') {
      await this.closeNow(userId, 'never_confirmed');
      return 'closed';
    }
    if (lapsed === 'lapsed') this.deps.log?.info({ userId }, 'an unconfirmed claim lapsed: the account is a guest again');
    return lapsed;
  }

  /**
   * Frees an address held by an unconfirmed sign-up for whoever is about to sign up, claim an account or arrive from a
   * provider with it. An address that is free, or confirmed by its account, is left alone, and the unique index
   * refuses the caller as before.
   */
  async releaseAddress(email: string, exceptUserId: string | null = null): Promise<void> {
    const holder = await this.pool.query<{ id: string }>(
      `SELECT u.id FROM users u WHERE u.email = $1 AND ($2::uuid IS NULL OR u.id <> $2::uuid) AND ${UNCONFIRMED_SIGNUP}`,
      [email, exceptUserId],
    );
    const id = holder.rows[0]?.id;
    if (id) await this.endUnconfirmedSignup(id);
  }

  /**
   * Ends the sign-ups nobody confirmed within UNCONFIRMED_SIGNUP_DAYS and forgets confirmation-email counts no longer
   * in their window. Batched and idempotent, like the guest purge beside it.
   */
  async purgeUnconfirmedSignups(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - UNCONFIRMED_SIGNUP_DAYS * 24 * 3_600_000);
    const due = await this.pool.query<{ id: string }>(
      `SELECT u.id FROM users u
        WHERE COALESCE(u.claimed_from_guest_at, u.created_at) < $1 AND ${UNCONFIRMED_SIGNUP}
        ORDER BY u.created_at
        LIMIT 200`,
      [cutoff],
    );
    let ended = 0;
    for (const row of due.rows) if ((await this.endUnconfirmedSignup(row.id)) !== 'kept') ended++;
    await forgetOldSends(this.pool);
    return ended;
  }

  /**
   * A closing account first leaves its story games through the games' own leave path, each game locked on its own
   * with nothing else held, so a hosted lobby closes and a running game stops waiting. Finished games stay for the
   * other players; the erase that follows removes this account's seat.
   */
  private async leaveStoryGames(userId: string): Promise<void> {
    await this.storyGames.leaveAll(userId).catch((err) => {
      this.deps.log?.warn({ err, userId }, 'could not take a closing account out of its story games');
    });
    // and the multiplayer learning games, the same way
    await this.multiplayer.leaveAll(userId).catch((err) => {
      this.deps.log?.warn({ err, userId }, 'could not take a closing account out of its multiplayer games');
    });
  }

  /**
   * Revokes the Sign in with Apple refresh token of an account being deleted, as the App Store requires (guideline
   * 5.1.1(v)). Called before anonymising, which deletes the identity holding the token, and outside its transaction,
   * since no call to another service should hold one open. A refusal or timeout is logged and the account closes
   * anyway.
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
    // Evidence a report still holds leaves the public bucket now; the five-minute sweep retries a failure.
    await runQuarantine(this.pool, this.deps.storage, { log: this.deps.log });
    return files.length;
  }

  /**
   * Deletes stored objects nothing references. They were marked as orphans in the transaction that released them, so
   * any that fail here, or all of them without storage, go on the next orphan sweep (media/service.ts).
   */
  private async deleteFiles(keys: string[]): Promise<void> {
    if (!this.deps.storage) return;
    const deleted: string[] = [];
    for (const key of keys) {
      try {
        await this.deps.storage.delete(key);
        deleted.push(key);
      } catch (err) {
        this.deps.log?.warn({ err, key }, 'could not delete a closed account’s file; the orphan sweep will');
      }
    }
    // the rows of every file that went, in one statement rather than one each
    if (deleted.length === 0) return;
    await this.pool.query(`DELETE FROM media_uploads WHERE key = ANY($1::text[])`, [deleted]).catch((err: unknown) => {
      this.deps.log?.warn({ err, keys: deleted.length }, 'could not delete a closed account’s file rows; the orphan sweep will');
    });
  }

  private async anonymize(userId: string, executor: Pick<pg.Pool, 'query'> = this.pool): Promise<void> {
    // Support mail is found by their address, which the next statement replaces, so it goes first.
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
    // Their former usernames go too, and are no longer held for anybody.
    await executor.query(`DELETE FROM username_history WHERE user_id = $1`, [userId]);
    // their tree, and the kinds of tree they bought
    await executor.query(`DELETE FROM user_trees WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM user_tree_kinds WHERE user_id = $1`, [userId]);
    await executor.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
    await executor.query(`DELETE FROM oauth_identities WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM email_tokens WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM phone_verifications WHERE user_id = $1`, [userId]);
    // What sign-in protection kept: devices and networks with their failure counts, security emails sent, any count or
    // lock on the account, failures aimed at it, and the networks it was seen on.
    await executor.query(
      `DELETE FROM auth_lockouts WHERE scope = 'device' AND key IN (SELECT device_hash FROM known_devices WHERE user_id = $1)`,
      [userId],
    );
    await executor.query(`DELETE FROM known_devices WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM security_notices WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM auth_lockouts WHERE scope = 'account' AND key = $1::text`, [userId]);
    await executor.query(`DELETE FROM auth_network_failures WHERE target_hash = $1`, [userHash(userId)]);
    await executor.query(`DELETE FROM network_sightings WHERE user_id = $1`, [userId]);
    // Off this week's league table at once (earlier weeks stay, anonymous), showcase gone, and no badge push queued.
    await executor.query(
      `UPDATE league_members SET left_at = now()
        WHERE user_id = $1 AND left_at IS NULL
          AND cohort_id IN (SELECT id FROM league_cohorts WHERE NOT settled)`,
      [userId],
    );
    await executor.query(`DELETE FROM badge_showcase WHERE user_id = $1`, [userId]);
    await executor.query(`DELETE FROM badge_push_days WHERE user_id = $1`, [userId]);
    // Feedback text is their words; stars and chips stay in the counts, anonymous. An answer that was only words is
    // deleted, because the table refuses an empty answer and a failing scrub here would strand an account already
    // anonymised above.
    await executor.query(
      `DELETE FROM app_feedback WHERE user_id = $1 AND stars IS NULL AND cardinality(categories) = 0`,
      [userId],
    );
    await executor.query(`UPDATE app_feedback SET comment = NULL WHERE user_id = $1 AND comment IS NOT NULL`, [
      userId,
    ]);
  }

  /**
   * Creates an export request for the worker. One a day: asking again within 24 hours returns the existing request.
   * Taken under the person's lock, so two taps make one export rather than two full builds.
   */
  async requestExport(userId: string): Promise<string> {
    // Exports are kept only in a bucket readable through a signed link (media/storage.ts `putPrivate`); without one the
    // request is refused rather than promised.
    if (!this.deps.storage?.hasPrivateBucket) {
      throw new AppError('EXPORT_NOT_AVAILABLE', 503, 'data export is not available right now');
    }
    return inTransaction(this.pool, async (client) => {
      await lockPersonFor(client, 'export', userId);
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM user_exports
         WHERE user_id = $1 AND requested_at > now() - interval '24 hours'
         ORDER BY requested_at DESC LIMIT 1`,
        [userId],
      );
      if (existing.rows[0]) return existing.rows[0].id;

      const created = await client.query<{ id: string }>(
        `INSERT INTO user_exports (user_id) VALUES ($1) RETURNING id`,
        [userId],
      );
      return (created.rows[0] as { id: string }).id;
    });
  }

  /** Gathers everything stored about the user into one document, birth month and year included. */
  async buildExport(userId: string): Promise<Record<string, unknown>> {
    const user = await this.pool.query(
      `SELECT id, email, username, display_name, bio, locale, timezone, roles,
              email_verified_at, phone_verified_at, phone_masked,
              birth_year, birth_month,
              created_at, updated_at, deletion_requested_at
       FROM users WHERE id = $1`,
      [userId],
    );
    const previousUsernames = await this.pool.query(
      `SELECT username, changed_at, held_until FROM username_history WHERE user_id = $1 ORDER BY changed_at DESC LIMIT 200`,
      [userId],
    );
    // their tree as it stands, and the kinds of tree they bought
    const tree = await this.pool.query(
      `SELECT species, planted_on, last_watered_on, waterings, water, harvests, planted FROM user_trees WHERE user_id = $1`,
      [userId],
    );
    const treeKinds = await this.pool.query(`SELECT species, bought_at FROM user_tree_kinds WHERE user_id = $1 ORDER BY bought_at`, [userId]);
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
    // Their multiplayer learning games with what they typed in each, nothing about other players.
    const multiplayerGames = await this.pool.query(
      `SELECT l.game, l.mode, l.dialect, l.status, l.started_at, l.finished_at, p.seat, p.place, p.score, p.xp_awarded,
              COALESCE((SELECT json_agg(json_build_object('text', m.text, 'at', m.created_at) ORDER BY m.seq)
                          FROM game_moves m WHERE m.lobby_id = l.id AND m.user_id = $1 AND m.text IS NOT NULL), '[]'::json) AS typed
         FROM game_lobby_players p JOIN game_lobbies l ON l.id = p.lobby_id
        WHERE p.user_id = $1 ORDER BY l.created_at DESC LIMIT 1000`,
      [userId],
    );
    // When they were asked for a rating and their answers; the inbox status and staff notes are the team's, not theirs.
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
    // their game ranks while they ran, every change with its reason (ranks/gdpr.ts)
    const ranks = await exportRanks(this.pool, userId);
    // The letters they wrote, each with its paper, drawing, notes and delivery; letters to them are their pen pals'
    // words.
    const letters = await this.pool.query(
      `SELECT body, decor, status, created_at AS written_at, delivered_at FROM letters WHERE sender_id = $1 ORDER BY created_at`,
      [userId],
    );
    // the bird they chose to carry them, and how often they changed it
    const letterBird = await this.pool.query(`SELECT bird, changes, chosen_at, updated_at FROM letter_birds WHERE user_id = $1`, [userId]);
    // The birds they called to their window and how each visit ended; the letters those birds carried are others' words.
    const birdsCalled = await this.pool.query(`SELECT called_at, ended_at, outcome FROM letter_visits WHERE visitor_id = $1 ORDER BY called_at`, [userId]);
    // The paper they last used, their widget choices, and when each phone's widget was made and last read (tokens are
    // kept only as hashes, which would mean nothing to them).
    const letterPaper = await this.pool.query(`SELECT paper, updated_at FROM letter_prefs WHERE user_id = $1`, [userId]);
    const widgetPrefs = await this.pool.query(`SELECT pinned_letter_id, show_words, updated_at FROM letter_widget_prefs WHERE user_id = $1`, [userId]);
    const widgets = await this.pool.query(`SELECT created_at, last_used_at FROM letter_widget_tokens WHERE user_id = $1 ORDER BY created_at`, [userId]);
    // Devices and networks that signed in, the networks seen by day, and security emails sent. Devices and networks are
    // kept only as keyed hashes, which are left out.
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
    // Their mail to the support address from this account's address and the answers; who answered is not theirs.
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
      previousUsernames: previousUsernames.rows,
      tree: tree.rows[0] ?? null,
      treeKinds: treeKinds.rows,
      posts,
      sessions: sessions.rows,
      signInDevices: devices.rows,
      networksSeen: networks.rows,
      securityEmails: notices.rows,
      oauthIdentities: identities.rows,
      storyGames: storyGames.rows,
      multiplayerGames: multiplayerGames.rows,
      appFeedback: { ...prompts.rows[0], answers: feedback.rows },
      gameRanks: ranks,
      lettersWritten: letters.rows,
      letterBird: letterBird.rows[0] ?? null,
      birdsCalled: birdsCalled.rows,
      letterPaper: letterPaper.rows[0] ?? null,
      letterWidget: { prefs: widgetPrefs.rows[0] ?? null, phones: widgets.rows },
      supportEmails: support.rows,
      // XP, leagues, streaks, badges, the story shelf and the saved words (gdpr/progress-export.ts)
      progress: await exportProgress(this.pool, userId),
    };
  }

  /**
   * Worker-side fulfilment: build, upload, mark completed, and delete the person's earlier export files. Without a
   * writable private bucket no export is made (PrivateStorageUnavailable), never one in the public bucket; the request
   * is withdrawn as the job fails, so GET /me/export stops promising one and the person can ask again later.
   */
  async fulfillExport(exportId: string): Promise<void> {
    if (!this.deps.storage) throw new Error('storage not configured');
    const row = await this.pool.query<{ user_id: string; completed_at: Date | null }>(
      `SELECT user_id, completed_at FROM user_exports WHERE id = $1`,
      [exportId],
    );
    const record = row.rows[0];
    if (!record || record.completed_at) return; // idempotent
    if (!this.deps.storage.hasPrivateBucket) {
      await this.pool.query(`DELETE FROM user_exports WHERE id = $1 AND completed_at IS NULL`, [exportId]);
      throw new PrivateStorageUnavailable();
    }

    const body = Buffer.from(JSON.stringify(await this.buildExport(record.user_id), null, 2));
    const sha256Hex = createHash('sha256').update(body).digest('hex');
    const key = mediaKey('user-export', sha256Hex, 'application/json');
    // Written privately with no-store headers, straight from here; the signed-upload path would store it as a public,
    // year-long cached object.
    await this.deps.storage.putPrivate(key, body, 'application/json');
    await this.pool.query(
      `UPDATE user_exports SET storage_key = $2, completed_at = now() WHERE id = $1`,
      [exportId, key],
    );
    await this.deleteEarlierExports(record.user_id, exportId, key);
  }

  /**
   * Deletes the files of the person's earlier exports once a newer one is ready, since only the newest is offered. One
   * that cannot be deleted keeps its key and is retried with the next export or when the account closes.
   */
  private async deleteEarlierExports(userId: string, exportId: string, kept: string): Promise<void> {
    const earlier = await this.pool.query<{ id: string; storage_key: string }>(
      `SELECT id, storage_key FROM user_exports WHERE user_id = $1 AND id <> $2 AND storage_key IS NOT NULL`,
      [userId, exportId],
    );
    const deleted: string[] = [];
    for (const old of earlier.rows) {
      try {
        // the same bytes have the same key: that file is the new export's too
        if (old.storage_key !== kept) await this.deps.storage!.delete(old.storage_key);
        deleted.push(old.id);
      } catch (err) {
        this.deps.log?.warn({ err, userId }, 'could not delete an earlier data export; it is tried again with the next one');
      }
    }
    if (deleted.length > 0) await this.pool.query(`UPDATE user_exports SET storage_key = NULL WHERE id = ANY($1::uuid[])`, [deleted]);
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
 * Erases the account owner's mail to the support address and the answers to it (by foreign key). The inbox knows
 * them only by address, so this must run before the address is replaced.
 */
export async function eraseSupportMail(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<void> {
  await executor.query(
    `DELETE FROM support_emails
      WHERE from_address = (SELECT lower(u.email::text) FROM users u WHERE u.id = $1 AND u.deleted_at IS NULL)`,
    [userId],
  );
}

/**
 * Deletes everything a closing account holds beyond its own fields, in the caller's transaction, and returns the
 * storage keys nobody else uses, already marked as orphans, to delete after the commit. A file a report holds as
 * evidence is marked too but not returned: it is quarantined into private storage, since nothing may show it now,
 * and the sweep takes it once retention allows. Posts and pictures go with their comments, reactions and likes; the
 * person's comments elsewhere become tombstones that keep replies in place. Owned groups are handed on first.
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
  // Pictures on their written posts and every other post upload: unposted ones (the sweep would take those in a day;
  // a closed account's go now) and ones taken off a reported post, which the report marks as evidence so they are
  // quarantined below.
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

  // Story games: their name off hosted games, then their answers and seats (unfinished ones were left beforehand).
  // Games first, because a game's transactions lock it before its players.
  await q(`UPDATE story_games SET host_id = NULL WHERE host_id = $1`);
  await q(`DELETE FROM story_game_answers WHERE user_id = $1`);
  await q(`DELETE FROM story_game_players WHERE user_id = $1`);
  // Multiplayer learning games likewise: name off hosted lobbies, their text off every move (the move stays for the
  // others), then their seats.
  await q(`UPDATE game_lobbies SET host_id = NULL WHERE host_id = $1`);
  await q(`UPDATE game_moves SET user_id = NULL, text = NULL WHERE user_id = $1`);
  await q(`DELETE FROM game_lobby_players WHERE user_id = $1`);
  // their shelf and where they were in each story: a reading record is theirs alone
  await q(`DELETE FROM story_bookmarks WHERE user_id = $1`);
  await q(`DELETE FROM story_reading WHERE user_id = $1`);
  // the learning games: their rounds (with every try), what they met and how far they climbed
  await q(`DELETE FROM game_sessions WHERE user_id = $1`);
  await q(`DELETE FROM game_seen WHERE user_id = $1`);
  await q(`DELETE FROM game_progress WHERE user_id = $1`);
  // the Stories' riddles: which they tried, the hints they took, which they solved
  await q(`DELETE FROM riddle_progress WHERE user_id = $1`);
  // the voices they recorded for the course, and their name off the links they made for others
  await q(`DELETE FROM recording_voices WHERE user_id = $1`);
  await q(`UPDATE recording_voices SET linked_by = NULL WHERE linked_by = $1`);
  // What game ranks stored about them while they ran (ranks/gdpr.ts).
  await eraseRanks(executor, userId);

  // Both sides of every conversation they were in, gifts included.
  await q(`DELETE FROM dm_messages WHERE user_lo = $1 OR user_hi = $1`);
  // and every correspondence with a pen pal, both sides of it, as with messages
  await q(`DELETE FROM letters WHERE sender_id = $1 OR recipient_id = $1`);
  await q(`DELETE FROM letter_threads WHERE user_lo = $1 OR user_hi = $1`);
  // and the bird they chose to carry them, and the birds they called to their window
  await q(`DELETE FROM letter_birds WHERE user_id = $1`);
  await q(`DELETE FROM letter_visits WHERE visitor_id = $1`);
  // Their last paper and their letter widgets (a pin of someone else's on one of their letters went with the letter).
  await q(`DELETE FROM letter_prefs WHERE user_id = $1`);
  await q(`DELETE FROM letter_widget_tokens WHERE user_id = $1`);
  await q(`DELETE FROM letter_widget_prefs WHERE user_id = $1`);
  await q(`DELETE FROM group_messages WHERE sender_id = $1`);
  // A group gift for them alone goes; one to several friends stays for the others, no longer listing a closed account
  // (gifts/cards.ts).
  await q(
    `DELETE FROM group_messages m
      WHERE m.gift_batch_id IS NOT NULL
        AND m.gift_batch_id IN (SELECT g.batch_id FROM gifts g WHERE g.to_user_id = $1)
        AND NOT EXISTS (SELECT 1 FROM gifts o WHERE o.batch_id = m.gift_batch_id AND o.to_user_id <> $1)`,
  );
  // The notification each friend got about a present from them sits in the friend's list, so their own delete below
  // misses it. It is found through the gifts they gave, which also covers the shop's older notifications.
  await q(
    `DELETE FROM notifications
      WHERE user_id IN (SELECT to_user_id FROM gifts WHERE from_user_id = $1::uuid)
        AND data->>'kind' = 'gift' AND data->>'fromUserId' = $1::text`,
  );
  // Gift rows stay: given ones belong to the recipient, received ones stay with the anonymised row like its other
  // history. Only the link back to this account goes, so they read as from a former member.
  await q(`UPDATE gifts SET from_user_id = NULL WHERE from_user_id = $1`);

  // groups: hand on the ones they own, then leave them all
  const owned = await executor.query<{ group_id: string }>(
    `SELECT group_id FROM group_members WHERE user_id = $1 AND role = 'owner'`,
    [userId],
  );
  await q(`DELETE FROM group_members WHERE user_id = $1`);
  await q(`DELETE FROM group_reads WHERE user_id = $1`);
  await q(`DELETE FROM group_mutes WHERE user_id = $1`);
  await q(`DELETE FROM group_bans WHERE user_id = $1`);
  await q(`DELETE FROM group_rejoin_requests WHERE user_id = $1`);
  // And the note that they were removed from a formerly open group, kept so it could be undone.
  await q(`DELETE FROM open_group_closures WHERE user_id = $1`);
  // Their name off what they did as a group admin; the account is anonymised, not deleted, so SET NULL never runs.
  await q(`UPDATE group_bans SET banned_by = NULL WHERE banned_by = $1`);
  await q(`UPDATE group_rejoin_requests SET decided_by = NULL WHERE decided_by = $1`);
  await q(`UPDATE groups SET chat_cleared_by = NULL WHERE chat_cleared_by = $1`);
  if (owned.rows.length > 0) {
    const ids = owned.rows.map((row) => row.group_id);
    await q(`UPDATE groups SET owner_id = NULL WHERE id = ANY($1::uuid[]) AND owner_id = $2`, [ids, userId]);
    await handOnGroups(executor, ids);
  }

  // the people they knew, and what reached them
  await q(`DELETE FROM friendships WHERE user_lo = $1 OR user_hi = $1`);
  await q(`DELETE FROM blocks WHERE blocker_id = $1 OR blocked_id = $1`);
  await q(`DELETE FROM device_tokens WHERE user_id = $1`);
  await q(`DELETE FROM notification_prefs WHERE user_id = $1`);
  await q(`DELETE FROM notifications WHERE user_id = $1`);
  // Game invites from and to them and their rematch offers; the account is anonymised, so the cascade never runs.
  await q(`DELETE FROM play_invites WHERE host_id = $1 OR invitee_id = $1`);
  await q(`DELETE FROM play_rematches WHERE user_id = $1`);
  await q(`DELETE FROM streak_reminders_sent WHERE user_id = $1`);
  await q(`DELETE FROM activity_congrats WHERE user_id = $1`);
  await q(`DELETE FROM activity_events WHERE actor_id = $1`);
  await q(`DELETE FROM analytics_events WHERE user_id = $1`);
  await q(`DELETE FROM app_feedback WHERE user_id = $1`);
  await q(`DELETE FROM user_tags WHERE user_id = $1`);
  await q(`DELETE FROM saved_words WHERE user_id = $1`);
  // The badges shown on their profile.
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

  // Files nobody else uses (keys are content hashes, so people can share one), marked as orphans; evidence is
  // quarantined instead.
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
    // Once each: an old picture post's upload is both its picture and their upload, and a duplicate key would fail the
    // marking.
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
