import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { lowerUuid } from '../http/ids.js';
import { APP_LOCALE_CODES, normalizeKurdish } from '@kurda/shared';
import { CURRENT_POLICY_VERSION } from '../gdpr/consent.js';
import { DELETION_GRACE_DAYS, GdprService, exportJobId } from '../gdpr/service.js';
import { appleTokens } from '../auth/apple-tokens.js';
import { makeExportJob } from '../jobs/gdpr-jobs.js';
import { AppError } from '../plugins/errors.js';
import { guestAccountError, requireAccount, requireAuth, requireRoles } from '../plugins/auth.js';
import { USERNAME_CHANGE_COOLDOWN_DAYS, UsernameChangeService } from './username-change.js';
import { cleanDisplayName, DISPLAY_NAME_MAX } from './display-name.js';
import { StreakService } from '../streaks/service.js';
import { SocialService } from '../social/service.js';
import { FriendService } from '../friends/service.js';
import { toPublicProfileDto } from '../social/profile-dto.js';
import type { AppConfig } from '../config/env.js';
import { mediaLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { setProfilePhoto } from '../media/profilePhoto.js';
import { assertUnrestricted, requireNotHeld, requireUnrestricted } from '../moderation/restrictions.js';
import { requireAccountCaller } from '../moderation/appeal-token.js';
import { accountHoldOf } from '../moderation/returns.js';
import { birthDateRequired, isBelowConsentAgeRow, isKnownAdultRow, isMinorRow } from './age.js';
import { BirthMonthService, birthDateBodySchema } from './birth-month.js';
import { leaveThisWeek, returnThisWeek } from '../leagues/service.js';
import { TIME_ZONE_MESSAGE, storableTimeZone } from '../streaks/time-zones.js';
import { RequestValidationError } from '../plugins/validation.js';
import { knownUnsupervised, supervisionOf } from '../parental/supervision.js';
import { premiumUntilSql } from '../cosmetics/access.js';
import { childSessionOf } from '../family/children.js';
import { childRefused } from '../family/child-gate.js';
import { currentRequest } from '../security/context.js';

export { USERNAME_CHANGE_COOLDOWN_DAYS };
/** The time zone can change at most once a week, so a streak cannot be farmed by hopping zones. */
export const TIMEZONE_CHANGE_COOLDOWN_DAYS = 7;

/** Bio stored as plain text: tags stripped, angle brackets and control characters removed, whitespace normalised; Kurdish diacritics untouched. */
export function sanitizeBio(raw: string): string {
  return normalizeKurdish(
    raw
      .replace(/<[^>]*>/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, ''),
  ).slice(0, 300);
}

// The shape only; the route asks whether the database knows the zone (streaks/time-zones.ts).
const timezoneSchema = z
  .string()
  .max(50)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: TIME_ZONE_MESSAGE },
  );

export const consentBodySchema = z
  .object({
    acceptPolicy: z.literal(true).optional(),
    analytics: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'no consent changes' });

export const patchMeBodySchema = z
  .object({
    displayName: z.string().min(1).max(DISPLAY_NAME_MAX).optional(),
    bio: z.string().max(1_000).optional(),
    /* Every interface language, from one list, so the picker cannot offer something the server would refuse. */
    locale: z.enum(APP_LOCALE_CODES).optional(),
    timezone: timezoneSchema.optional(),
    /** Refused here: a username changes at POST /me/username, which asks for the password (users/username-change.ts). */
    username: z.string().max(60).optional(),
    /** Denying the microphone skips speaking exercises course-wide. */
    skipSpeaking: z.boolean().optional(),
    /** ISO-3166 alpha-2 country, or '' to clear */
    country: z.string().regex(/^[A-Za-z]{2}$/).or(z.literal('')).optional(),
    /** take part in the weekly leagues; false leaves this week's league at once */
    leaguesEnabled: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'no fields to update' });

/** A username as typed; users/username.ts says which rule a name breaks. */
const usernameQuerySchema = z.object({ username: z.string().min(1).max(60) });
const changeUsernameBodySchema = z.strictObject({
  username: z.string().min(1).max(60),
  /** Asked of every account with a password; one that signs in through another service has none. */
  currentPassword: z.string().min(1).max(200).optional(),
});

interface MeRow {
  id: string;
  /** null for a guest, who has none until the account is claimed */
  email: string | null;
  username: string;
  display_name: string | null;
  bio: string | null;
  locale: string;
  timezone: string;
  roles: string[];
  email_verified_at: Date | null;
  username_changed_at: Date | null;
  consent_version: string | null;
  analytics_consent: boolean;
  birth_year: number | null;
  birth_month: number | null;
  leagues_enabled: boolean | null;
  xp: number;
  skip_speaking: boolean;
  profile_visibility: string;
  profile_photo_key: string | null;
  pending_profile_photo_key: string | null;
  selected_avatar_key: string | null;
  equipped_background_sku: string | null;
  equipped_icon_sku: string | null;
  premium_icon_enabled: boolean;
  premium_until: Date | null;
  country: string | null;
  /** a guest account (auth/guest.ts): learning only, until claimed */
  guest: boolean;
  created_at: Date;
  /** held while a person checks whether it belongs to someone banned (moderation/returns.ts) */
  held_at: Date | null;
  hold_reason: string | null;
  /** 'child' for a child's profile made by their parent (family/) */
  kind: string;
  /** the later of the account's own membership and its family plan's (cosmetics/access.ts `premiumUntilSql`), on GET /me */
  plus_until?: Date | null;
}

function toMe(row: MeRow) {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    locale: row.locale,
    timezone: row.timezone,
    roles: row.roles,
    emailVerified: row.email_verified_at !== null,
    consentVersion: row.consent_version,
    /** A guest has consented to nothing and is asked only on the claim form, which records it; a child's parent consented for them. */
    needsReconsent: !row.guest && row.kind !== 'child' && row.consent_version !== CURRENT_POLICY_VERSION,
    analyticsConsent: row.analytics_consent,
    /** No birth month on record yet, so the clients ask once first; never for a guest, whom the claim form asks. */
    birthDateRequired: row.birth_year == null && !row.guest,
    /** The birth month on record, for the account's own Settings; null until answered. */
    birthYear: row.birth_year,
    birthMonth: row.birth_month,
    guest: row.guest,
    /** 'child' for a child's profile made by their parent (family/), which the phone opens in child mode; 'person' otherwise. */
    kind: row.kind === 'child' ? 'child' : 'person',
    /** 13–17 today, worked out now rather than stored (users/age.ts). */
    minor: isMinorRow(row),
    /**
     * Known to be 18 or over, and neither a guest nor a child's profile: the one flag the apps read before suggesting a
     * purchase, Hevalo+ or giving a gift back. An unknown age is never an adult's.
     */
    knownAdult: !row.guest && row.kind !== 'child' && isKnownAdultRow(row),
    /** Under the age of digital consent (16) today, so consent choices such as analytics need a parent; the name is historical. */
    restrictedMode: isBelowConsentAgeRow(row),
    /** Never chosen means in for adults and out for minors and unknown ages, read from age each time. */
    leaguesEnabled: row.leagues_enabled ?? isKnownAdultRow(row),
    xp: row.xp,
    skipSpeaking: row.skip_speaking,
    profileVisibility: row.profile_visibility,
    createdAt: new Date(row.created_at).toISOString(),
    /** null for nearly everyone; set while the account may not post, message, upload, write letters or join groups */
    accountHold: accountHoldOf(row),
  };
}

/** Unconfirms a replaced or cleared photo key for the orphan job, unless another user references it (identical photos share a content-hashed key). */
async function scheduleOrphan(app: FastifyInstance, oldKey: string | null, newKey: string | null): Promise<void> {
  if (!oldKey || oldKey === newKey) return;
  const stillUsed = await app.db.query(`SELECT 1 FROM users WHERE profile_photo_key = $1 LIMIT 1`, [oldKey]);
  if ((stillUsed.rowCount ?? 0) > 0) return;
  await app.db.query(`UPDATE media_uploads SET confirmed_at = NULL, created_at = now() WHERE key = $1`, [oldKey]);
}

/**
 * What GET /me returns for one account: the row's fields, the streak settled on read, and the resolved cosmetics and
 * progression. Shared with POST /auth/claim, whose answer replaces what the app holds, so the two never drift.
 */
export function createMeReader(app: FastifyInstance): (userId: string) => Promise<Record<string, unknown>> {
  const streaks = new StreakService(app.db);
  const social = new SocialService(app.db, new FriendService(app.db));
  /** Resolve a stored photo key to a public CDN URL (null when unset/no storage). */
  const photoUrl = (key: string | null): string | null =>
    key && app.storage ? app.storage.publicUrl(key) : null;

  return async (userId) => {
    // Reuse the enriched profile query and resolver for cosmetics, level and favourites (self view: details always
    // visible); ranks and badges are not part of the account.
    const [row, profile, supervision] = await Promise.all([
      // the membership the apps show is the account's own or its family's plan, whichever lasts longer
      app.db.query<MeRow>(`SELECT *, ${premiumUntilSql('users')} AS plus_until FROM users WHERE id = $1`, [userId]).then((r) => r.rows[0] as MeRow),
      social.profile(userId, userId, { badges: false }),
      // null for everyone but a supervised teen; read only when the session found a live parent link (parental/supervision.ts)
      knownUnsupervised(userId) ? null : supervisionOf(app.db, userId),
    ]);
    // Settle the streak on read so a lapsed day shows as broken.
    const streak = await streaks.get(row.id, row.timezone);
    const publicDto = toPublicProfileDto(profile, app.storage);
    return {
      ...toMe(row),
      streak,
      profilePhotoUrl: photoUrl(row.profile_photo_key),
      // the new photo a person is still checking, for its owner only (a short-lived private link)
      profilePhotoPending: app.hasDecorator('pictures') ? await app.pictures.ownerLink(row.pending_profile_photo_key) : null,
      // resolved, safe cosmetic + progression fields (same as public profile)
      avatarUrl: publicDto.avatarUrl,
      background: publicDto.background,
      icon: publicDto.icon,
      level: publicDto.level,
      premium: publicDto.premium,
      favoritePoem: publicDto.favoritePoem,
      favoriteStory: publicDto.favoriteStory,
      // self-only equip state, for the cosmetic pickers (not exposed publicly)
      premiumIconEnabled: row.premium_icon_enabled,
      country: row.country,
      selectedAvatarKey: row.selected_avatar_key,
      equippedBackgroundSku: row.equipped_background_sku,
      equippedIconSku: row.equipped_icon_sku,
      premiumUntil: row.plus_until ?? null,
      supervision,
      // a child's parent, and whether this session is the one opened on the parent's phone, which the PIN gives back
      ...(row.kind === 'child' ? { child: await childSessionOf(app.db, userId, currentRequest()?.user?.familyId ?? null) } : {}),
    };
  };
}

export function registerUserRoutes(app: FastifyInstance, config: AppConfig): void {
  const limits = mediaLimits(config);
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  // The raw-image body parser is registered app-wide (registerImageUploadParser) and shared with image post uploads.
  const me = createMeReader(app);

  app.get('/me', { preHandler: requireAuth }, async (req) => ({ user: await me(req.user!.id) }));

  /** Presence heartbeat, pinged while the app is open; "online" is derived from it at read time. One cheap row update, under the global rate limit. */
  app.post('/me/heartbeat', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => {
    // last_seen_at is overwritten in place and says only who is online now; the one row per user per day is what DAU, WAU
    // and MAU count. One statement, since every open app sends this once a minute.
    await app.db.query(
      `WITH seen AS (UPDATE users SET last_seen_at = now() WHERE id = $1)
       INSERT INTO user_activity_days (day, user_id) VALUES (current_date, $1) ON CONFLICT DO NOTHING`,
      [req.user!.id],
    );
    return { ok: true };
  });

  /**
   * Uploads a profile photo as raw image bytes (Content-Type image/*): validated, resized and compressed to WebP, held to
   * the size, storage and op limits, stored, and replacing the old one. Rate limited per user.
   */
  app.post(
    '/me/profile-picture',
    {
      config: {
        rawBody: true,
        rateLimit: { max: limits.uploadRateMax, windowMs: limits.uploadRateWindowMs, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      // A picture like any other, so a media restriction covers it, and it is shown to others, which a guest is not yet.
      preHandler: [requireAccount, requireUnrestricted('media')],
    },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_IMAGE', message: 'send raw image bytes with an image/* content-type' });

      const res = await setProfilePhoto(
        { pool: app.db, storage: app.storage, usage, pictures: app.pictures, limits, log: app.log },
        req.user!.id,
        raw,
      );
      if (!res.ok) {
        req.log.warn({ userId: req.user!.id, reason: res.reason, bytes: raw.length }, 'profile photo upload rejected');
        // a refusal by the picture check says why, and how to ask a person (PictureRejection)
        if (res.retryAfterSec) reply.header('retry-after', String(res.retryAfterSec));
        return reply.code(res.status).send({ code: res.code, message: res.message, ...(res.refusal ?? {}) });
      }
      // held: others keep seeing the old photo, and the new one is the owner's alone until a person checks it
      return {
        profilePhotoUrl: res.profilePhotoUrl,
        review: res.review,
        ...(res.review === 'held' ? { profilePhotoPending: res.profilePhotoPending ?? null } : {}),
      };
    },
  );

  /** Media cost-safety monitoring (admin): stored bytes/objects + our R2 op counts. */
  app.get('/admin/media/usage', { config: { skipValidation: true }, preHandler: requireRoles('admin') }, async () =>
    usage.snapshot({
      storageLimitBytes: limits.storageLimitBytes,
      classALimit: limits.classALimit,
      classBLimit: limits.classBLimit,
    }),
  );

  /** Clear the photo (revert to the initials fallback). */
  app.delete('/me/profile-picture', { config: { skipValidation: true }, preHandler: requireAccount }, async (req) => {
    const prev = await app.db.query<{ profile_photo_key: string | null }>(
      `SELECT profile_photo_key FROM users WHERE id = $1`,
      [req.user!.id],
    );
    // a new photo still waiting for a person is taken down with it
    await app.db.query(`UPDATE users SET profile_photo_key = NULL, pending_profile_photo_key = NULL WHERE id = $1`, [req.user!.id]);
    await scheduleOrphan(app, prev.rows[0]?.profile_photo_key ?? null, null);
    return { ok: true };
  });

  /**
   * The devices signed in to the account, each listed once. A session is a live refresh-token family, and one device can
   * hold several (it signed in again, or the admin console beside the website); they are one row with the device name,
   * first sign-in and last use. A session from an app sending no device id is its own row. `id` is one of the device's
   * sessions (this one's for the device in hand), and signing it out ends all of the device's sessions.
   */
  app.get('/me/sessions', { preHandler: requireAuth }, async (req) => {
    const result = await app.db.query<{
      family_id: string;
      device_name: string | null;
      started_at: Date;
      last_seen_at: Date;
      current: boolean;
    }>(
      `WITH families AS (
         -- a live session has one unrevoked token, the latest: its row says
         -- when it was last used, and carries the session's start along
         SELECT family_id, device_hash, device_name, session_started_at, created_at,
                family_id::text = coalesce($2::text, '') AS current
           FROM refresh_tokens
          WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       )
       SELECT (array_agg(family_id ORDER BY current DESC, created_at DESC))[1] AS family_id,
              (array_agg(device_name ORDER BY created_at DESC) FILTER (WHERE device_name IS NOT NULL))[1] AS device_name,
              min(session_started_at) AS started_at,
              max(created_at) AS last_seen_at,
              bool_or(current) AS current
         FROM families
        GROUP BY coalesce(device_hash, family_id::text)
        ORDER BY max(created_at) DESC`,
      [req.user!.id, req.user!.familyId ?? null],
    );
    return {
      sessions: result.rows.map((row) => ({
        id: row.family_id,
        deviceName: row.device_name,
        startedAt: new Date(row.started_at).toISOString(),
        lastSeenAt: new Date(row.last_seen_at).toISOString(),
        current: row.current,
      })),
    };
  });

  /** Sign one device out: the session `id` and every other session its device holds. */
  app.delete(
    '/me/sessions/:id',
    {
      schema: { params: z.object({ id: lowerUuid() }) },
      preHandler: requireAuth,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const result = await app.db.query<{ family_id: string }>(
        `UPDATE refresh_tokens SET revoked_at = now()
          WHERE user_id = $2 AND revoked_at IS NULL
            AND (family_id = $1
                 OR device_hash = (SELECT device_hash FROM refresh_tokens
                                    WHERE family_id = $1 AND user_id = $2 AND revoked_at IS NULL
                                      AND device_hash IS NOT NULL
                                    LIMIT 1))
          RETURNING family_id`,
        [id, req.user!.id],
      );
      if ((result.rowCount ?? 0) === 0) {
        throw new AppError('SESSION_NOT_FOUND', 404, 'no active session with that id');
      }
      // When the caller signed out their own device, the client must drop its tokens now rather than keep them up to 15 minutes.
      return { revoked: true, current: result.rows.some((r) => r.family_id === req.user!.familyId) };
    },
  );

  /** Re-consent and the analytics preference. */
  app.post(
    '/me/consent',
    { schema: { body: consentBodySchema }, preHandler: requireAuth },
    async (req) => {
      const body = req.body as z.infer<typeof consentBodySchema>;
      if (body.acceptPolicy) {
        await app.db.query(
          `UPDATE users SET consent_version = $2, consented_at = now() WHERE id = $1`,
          [req.user!.id, CURRENT_POLICY_VERSION],
        );
      }
      if (body.analytics !== undefined) {
        if (body.analytics) {
          const age = await app.db.query<{ birth_year: number | null; birth_month: number | null }>(
            `SELECT birth_year, birth_month FROM users WHERE id = $1`,
            [req.user!.id],
          );
          // Below 16 consent is a parent's to give (GDPR art. 8), and there is no way for a parent to give it yet, so it stays off.
          if (isBelowConsentAgeRow(age.rows[0]!)) {
            throw new AppError('PARENTAL_CONSENT_REQUIRED', 403, 'this needs a parent’s consent below age 16');
          }
          // and whether it is a parent's is not known until the age is
          if (age.rows[0]!.birth_year == null) throw birthDateRequired();
        }
        await app.db.query(`UPDATE users SET analytics_consent = $2 WHERE id = $1`, [
          req.user!.id,
          body.analytics,
        ]);
      }
      const row = await app.db.query<MeRow>(`SELECT * FROM users WHERE id = $1`, [req.user!.id]);
      return { user: toMe(row.rows[0] as MeRow) };
    },
  );

  const gdpr = new GdprService(app.db, {
    storage: app.storage,
    jobs: app.jobs,
    log: app.log,
    // The story games' own service, read when called since it is registered later; leaving through it wakes other players' polls.
    storyGames: { leaveAll: (userId) => app.storyGames.leaveAll(userId) },
    // and the multiplayer learning games' (api/src/mp), the same way
    multiplayer: { leaveAll: (userId) => app.multiplayer.leaveAll(userId) },
    // closing a child's account at once revokes their Sign in with Apple too
    apple: appleTokens(config, app.db, { log: app.log }),
  });
  const birthMonths = new BirthMonthService(app.db, gdpr);

  /**
   * The one-time birth month answer for an account with none (provider sign-ups, and accounts from before it was asked),
   * accepted once (BirthMonthService). Under 13 closes the account, so the client must drop its tokens on
   * UNDER_MINIMUM_AGE.
   */
  app.post(
    '/me/birth-date',
    {
      schema: { body: birthDateBodySchema },
      config: { rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } },
      preHandler: requireAuth,
    },
    async (req) => {
      const { birthYear, birthMonth } = req.body as z.infer<typeof birthDateBodySchema>;
      await birthMonths.set(req.user!.id, { year: birthYear, month: birthMonth });
      const row = await app.db.query<MeRow>(`SELECT * FROM users WHERE id = $1`, [req.user!.id]);
      return { user: toMe(row.rows[0] as MeRow) };
    },
  );

  /*
   * The GDPR rights survive a ban: a suspended or banned person reaches these three with the appeal token from sign-in
   * (moderation/appeal-token.ts), as well as anyone signed in. Deleting keeps moderation records and the ban registry's
   * entries, which the privacy policy explains.
   */

  /**
   * GDPR: starts the 14-day deletion grace period. A guest is closed at once instead, having no way to sign in again and
   * no address for the notice.
   */
  // it emails the deletion notice, so its limit keeps counting while Redis is down
  app.delete('/me', { config: { rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const, onStoreDown: 'local' as const } } }, async (req) => {
    const caller = await requireAccountCaller(config, req);
    if (caller.guest) {
      await gdpr.closeNow(caller.id, 'guest_left');
      return { deletionScheduled: false, deleted: true, graceDays: 0 };
    }
    // An unconfirmed sign-up is closed at once too, since there is nothing to come back to and the address was never shown
    // to be theirs; a guest's unconfirmed claim goes the same way, learning included, because deletion was asked for.
    if (!caller.emailVerified && (await gdpr.endUnconfirmedSignup(caller.id, { keepLearning: false })) === 'closed') {
      return { deletionScheduled: false, deleted: true, graceDays: 0 };
    }
    await gdpr.requestDeletion(caller.id);
    return { deletionScheduled: true, graceDays: DELETION_GRACE_DAYS };
  });

  /** GDPR: request a data export, fulfilled by the worker (in this process unless RUN_WORKER_IN_API=false). */
  app.post(
    '/me/export',
    {
      config: { skipValidation: true, rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } }, // no body
    },
    async (req, reply) => {
      const caller = await requireAccountCaller(config, req);
      const { id: exportId, reused } = await gdpr.requestExport(caller.id);
      // Queued again for a request already made: one job per request, so this is nothing while that job is kept, and
      // starts it again once the queue has let it go.
      if (app.jobs) {
        await app.jobs.enqueue(makeExportJob(gdpr), { exportId }, { idempotencyKey: exportJobId(exportId) });
      }
      // `reused`: a copy asked for in the last day stands, and no second one is made until the day is out
      return reply.code(202).send({ requested: true, reused });
    },
  );

  app.get('/me/export', { config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } } }, async (req) => {
    const caller = await requireAccountCaller(config, req);
    return gdpr.exportStatus(caller.id);
  });

  /**
   * Changing one's mind about deleting the account, within the grace period. Signing in cancels it too, but a suspended
   * or banned person cannot sign in, so they reach this with their appeal token. Idempotent: `{ cancelled: true }`
   * whether or not a deletion was waiting.
   */
  app.post(
    '/me/deletion/cancel',
    { config: { skipValidation: true, rateLimit: { max: 10, windowMs: 60_000, per: 'user-or-ip' as const } } },
    async (req) => {
      const caller = await requireAccountCaller(config, req);
      await gdpr.cancelDeletion(caller.id);
      return { cancelled: true };
    },
  );

  /**
   * Signs out everywhere, ending refresh sessions and live access tokens. `?except=current` keeps this session; the
   * others' access tokens stop at once too, since revoked families' tokens are refused (plugins/auth.ts).
   */
  app.delete('/me/sessions', { schema: { querystring: z.object({ except: z.literal('current').optional() }) }, preHandler: requireAuth }, async (req) => {
    const { except } = req.query as { except?: 'current' };
    const current = req.user!.familyId;
    if (except === 'current' && current) {
      // Every session but this one ends, this device's older ones included; the count is of other devices, as listed.
      const others = await app.db.query<{ devices: number }>(
        `WITH here AS (
           SELECT device_hash FROM refresh_tokens
            WHERE user_id = $1 AND family_id::text = $2 AND revoked_at IS NULL
            LIMIT 1
         ), ended AS (
           UPDATE refresh_tokens SET revoked_at = now()
            WHERE user_id = $1 AND revoked_at IS NULL AND family_id::text <> $2
            RETURNING family_id, device_hash, expires_at
         )
         SELECT count(DISTINCT coalesce(device_hash, family_id::text))::int AS devices
           FROM ended
          WHERE expires_at > now()
            AND (device_hash IS NULL OR device_hash IS DISTINCT FROM (SELECT device_hash FROM here))`,
        [req.user!.id, current],
      );
      return { revoked: true, everywhere: false, sessionsEnded: others.rows[0]?.devices ?? 0 };
    }
    await app.db.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.user!.id],
    );
    // Bumping token_version invalidates every outstanding access token at once, including this request's.
    await app.db.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [
      req.user!.id,
    ]);
    return { revoked: true, everywhere: true };
  });

  app.patch(
    '/me',
    { schema: { body: patchMeBodySchema }, preHandler: requireAuth },
    async (req) => {
      const body = req.body as z.infer<typeof patchMeBodySchema>;
      const userId = req.user!.id;
      // What others read about you is published text, so not while you may not post, and not as a guest, whom nobody reads;
      // nor may a guest join the leagues. Language, time zone, country and the speaking setting stay open to a guest.
      const published = body.displayName !== undefined || body.bio !== undefined || body.username !== undefined;
      if (req.user!.guest === true && (published || body.leaguesEnabled !== undefined)) throw guestAccountError();
      // A child's name is their parent's to set, and a child takes no part in leagues; the language, zone and speaking stay theirs.
      if (req.user!.child === true && (published || body.leaguesEnabled !== undefined || body.country !== undefined)) throw childRefused();
      if (published) await assertUnrestricted(app.db, userId, 'post');

      const sets: string[] = [];
      const values: unknown[] = [userId];
      const add = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (body.displayName !== undefined) add('display_name', cleanDisplayName(body.displayName));
      if (body.bio !== undefined) add('bio', sanitizeBio(body.bio));
      if (body.locale !== undefined) add('locale', body.locale);
      if (body.skipSpeaking !== undefined) add('skip_speaking', body.skipSpeaking);
      if (body.country !== undefined) add('country', body.country === '' ? null : body.country.toUpperCase());
      if (body.leaguesEnabled !== undefined) add('leagues_enabled', body.leaguesEnabled);

      if (body.timezone !== undefined) {
        // a zone the app's date code takes but the database does not would fail every query of the account's day
        if (!(await storableTimeZone(app.db, body.timezone))) throw new RequestValidationError('body', [{ path: 'timezone', message: TIME_ZONE_MESSAGE }]);
        const cur = await app.db.query<{ timezone: string; timezone_changed_at: Date | null }>(
          `SELECT timezone, timezone_changed_at FROM users WHERE id = $1`,
          [userId],
        );
        const row = cur.rows[0]!;
        if (body.timezone !== row.timezone) {
          // At most one time zone change a week, so a streak cannot be farmed by hopping zones.
          const cooldownMs = TIMEZONE_CHANGE_COOLDOWN_DAYS * 24 * 3_600_000;
          if (
            row.timezone_changed_at &&
            Date.now() - new Date(row.timezone_changed_at).getTime() < cooldownMs
          ) {
            throw new AppError(
              'TIMEZONE_CHANGE_COOLDOWN',
              429,
              `timezone can only be changed once every ${TIMEZONE_CHANGE_COOLDOWN_DAYS} days`,
              { retryAfterSec: Math.ceil((new Date(row.timezone_changed_at).getTime() + cooldownMs - Date.now()) / 1_000) },
            );
          }
          add('timezone', body.timezone);
          add('timezone_changed_at', new Date());
        }
      }

      // A username is not a profile field: it changes with the password, within limits, and is recorded (POST /me/username).
      if (body.username !== undefined) {
        throw new AppError('USERNAME_CHANGE_ELSEWHERE', 400, 'a username is changed at POST /me/username');
      }

      if (sets.length === 0) {
        const unchanged = await app.db.query<MeRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
        return { user: toMe(unchanged.rows[0] as MeRow) };
      }

      {
        const updated = await app.db.query<MeRow>(
          `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
          values,
        );
        // Leaving applies now, not at the week's end, since the point is to leave this week's table.
        if (body.leaguesEnabled === false) await leaveThisWeek(app.db, userId);
        // Coming back returns them to this week's group if they had one; otherwise they join with their next learning XP.
        if (body.leaguesEnabled === true) await returnThisWeek(app.db, userId);
        return { user: toMe(updated.rows[0] as MeRow) };
      }
    },
  );

  /*
   * The username: what a person is told before changing it, whether a name could be theirs, and the change
   * (users/username-change.ts has the rules).
   *
   *   GET  /me/username              where they stand: the wait, names held for them, whether a password is asked
   *   GET  /me/username/available    ?username=…  (30 a minute)
   *   POST /me/username              { username, currentPassword? }  (5 in 15 minutes, as a password change)
   *
   * Not open to a guest, whose name is made up until they claim the account, nor to someone who may not post, since a
   * username is published.
   */
  const usernames = new UsernameChangeService(app.db, { jobs: app.jobs ?? null, security: app.securityLog, log: app.log });
  const requireNamed = async (req: { user?: { id: string; guest?: boolean } }): Promise<string> => {
    if (req.user!.guest === true) throw guestAccountError();
    await assertUnrestricted(app.db, req.user!.id, 'post');
    return req.user!.id;
  };

  app.get('/me/username', { preHandler: requireAuth }, async (req) => {
    if (req.user!.guest === true) throw guestAccountError();
    return usernames.status(req.user!.id);
  });

  app.get(
    '/me/username/available',
    {
      schema: { querystring: usernameQuerySchema },
      preHandler: requireAuth,
      config: { rateLimit: { max: 30, windowMs: 60_000, per: 'user-or-ip' as const } },
    },
    async (req) => {
      if (req.user!.guest === true) throw guestAccountError();
      return usernames.available(req.user!.id, (req.query as z.infer<typeof usernameQuerySchema>).username);
    },
  );

  app.post(
    '/me/username',
    {
      schema: { body: changeUsernameBodySchema },
      // a username is published, so a held account keeps its own until a person has looked
      preHandler: [requireAuth, requireNotHeld],
      config: { rateLimit: { max: 5, windowMs: 15 * 60_000, per: 'user-or-ip' as const, onStoreDown: 'local' as const } },
    },
    async (req) => {
      const userId = await requireNamed(req);
      const body = req.body as z.infer<typeof changeUsernameBodySchema>;
      const result = await usernames.change(userId, body.username, body.currentPassword);
      const row = await app.db.query<MeRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
      return { user: toMe(row.rows[0] as MeRow), changed: result.changed, status: await usernames.status(userId) };
    },
  );
}
