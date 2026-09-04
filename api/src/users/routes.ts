import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { normalizeKurdish, stripControlChars } from '@kurda/shared';
import { CURRENT_POLICY_VERSION } from '../gdpr/consent.js';
import { DELETION_GRACE_DAYS, GdprService } from '../gdpr/service.js';
import { makeExportJob } from '../jobs/gdpr-jobs.js';
import { AppError } from '../plugins/errors.js';
import { requireAuth, requireRoles } from '../plugins/auth.js';
import { validateUsername, USERNAME_ERROR_MESSAGE } from './username.js';
import { StreakService } from '../streaks/service.js';
import { SocialService } from '../social/service.js';
import { FriendService } from '../friends/service.js';
import { toPublicProfileDto } from '../social/profile-dto.js';
import { ImageModerationService } from '../moderation/image-moderation-service.js';
import type { AppConfig } from '../config/env.js';
import { mediaLimits } from '../media/mediaLimits.js';
import { MediaUsageService } from '../media/mediaUsage.js';
import { setProfilePhoto } from '../media/profilePhoto.js';

export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;
/** Profile photos are small; cap tighter than the global media limit (KUR-177). */
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
/** Timezone can be changed at most once per week (KUR-031 anti time-travel). */
export const TIMEZONE_CHANGE_COOLDOWN_DAYS = 7;

/**
 * Bio is stored as plain text only: tags stripped, angle brackets and
 * control characters removed, whitespace normalized. Kurdish diacritics
 * pass through untouched.
 */
export function sanitizeBio(raw: string): string {
  return normalizeKurdish(
    raw
      .replace(/<[^>]*>/g, ' ')
      .replace(/[<>]/g, '')
      .replace(/[\u0000-\u001F\u007F]/g, ''),
  ).slice(0, 300);
}

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
    { message: 'must be a valid IANA timezone (e.g. Europe/Berlin)' },
  );

export const consentBodySchema = z
  .object({
    acceptPolicy: z.literal(true).optional(),
    analytics: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'no consent changes' });

export const patchMeBodySchema = z
  .object({
    displayName: z.string().min(1).max(60).optional(),
    bio: z.string().max(1_000).optional(),
    locale: z.enum(['en', 'ku', 'de', 'tr', 'ar']).optional(),
    timezone: timezoneSchema.optional(),
    username: z.string().min(3).max(30).optional(),
    /** deny mic → speaking exercises skipped course-wide (KUR-036) */
    skipSpeaking: z.boolean().optional(),
    /** ISO-3166 alpha-2 country, or '' to clear */
    country: z.string().regex(/^[A-Za-z]{2}$/).or(z.literal('')).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'no fields to update' });

interface MeRow {
  id: string;
  email: string;
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
  restricted_mode: boolean;
  xp: number;
  skip_speaking: boolean;
  profile_visibility: string;
  profile_photo_key: string | null;
  selected_avatar_key: string | null;
  equipped_background_sku: string | null;
  equipped_icon_sku: string | null;
  premium_icon_enabled: boolean;
  premium_until: Date | null;
  country: string | null;
  created_at: Date;
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
    needsReconsent: row.consent_version !== CURRENT_POLICY_VERSION,
    analyticsConsent: row.analytics_consent,
    restrictedMode: row.restricted_mode,
    xp: row.xp,
    skipSpeaking: row.skip_speaking,
    profileVisibility: row.profile_visibility,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * Un-confirm a replaced/cleared photo key so the media orphan job reclaims it —
 * but only when no other user still references it (content-hashed keys are shared
 * when two users happen to have identical photos).
 */
async function scheduleOrphan(app: FastifyInstance, oldKey: string | null, newKey: string | null): Promise<void> {
  if (!oldKey || oldKey === newKey) return;
  const stillUsed = await app.db.query(`SELECT 1 FROM users WHERE profile_photo_key = $1 LIMIT 1`, [oldKey]);
  if ((stillUsed.rowCount ?? 0) > 0) return;
  await app.db.query(`UPDATE media_uploads SET confirmed_at = NULL, created_at = now() WHERE key = $1`, [oldKey]);
}

export function registerUserRoutes(app: FastifyInstance, config: AppConfig): void {
  const streaks = new StreakService(app.db);
  const limits = mediaLimits(config);
  const usage = new MediaUsageService(app.db, app.redis ?? null);
  // The raw-image body parser is registered app-wide (registerImageUploadParser),
  // shared with the meme/image upload route (KUR-290).

  /** Resolve a stored photo key to a public CDN URL (null when unset/no storage). */
  const photoUrl = (key: string | null): string | null =>
    key && app.storage ? app.storage.publicUrl(key) : null;

  const social = new SocialService(app.db, new FriendService(app.db));

  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const result = await app.db.query<MeRow>(`SELECT * FROM users WHERE id = $1`, [req.user!.id]);
    const row = result.rows[0] as MeRow;
    // settle the streak on read so a lapsed day shows as broken (KUR-031)
    const streak = await streaks.get(row.id, row.timezone);
    // reuse the single enriched profile query + resolver for cosmetics/level/
    // favorites (self view: friendStatus 'self', details always visible)
    const publicDto = toPublicProfileDto(await social.profile(row.id, row.id), app.storage);
    return {
      user: {
        ...toMe(row),
        streak,
        profilePhotoUrl: photoUrl(row.profile_photo_key),
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
        premiumUntil: row.premium_until,
      },
    };
  });

  /**
   * Presence heartbeat: the client pings this periodically while the app is
   * open. Records last activity; "online" is derived from it at read time. Cheap
   * single-row update, rate-limited by the global default.
   */
  app.post('/me/heartbeat', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => {
    await app.db.query(`UPDATE users SET last_seen_at = now() WHERE id = $1`, [req.user!.id]);
    // last_seen_at is overwritten in place, so it can say who is online now but
    // keeps no history; this one row per user per day is what DAU/WAU/MAU count.
    await app.db.query(
      `INSERT INTO user_activity_days (day, user_id) VALUES (current_date, $1) ON CONFLICT DO NOTHING`,
      [req.user!.id],
    );
    return { ok: true };
  });

  // ---- Profile photo (KUR-177 + cost-safety): through-server upload ----

  /**
   * Upload a profile photo: POST the raw image bytes (Content-Type image/*). The
   * server validates + resizes + WebP-compresses it, enforces the size / storage /
   * op limits, stores it, and replaces the old one. Per-user rate-limited.
   */
  app.post(
    '/me/profile-picture',
    {
      config: {
        rateLimit: { max: limits.uploadRateMax, windowMs: limits.uploadRateWindowMs, per: 'user-or-ip' as const },
        skipValidation: true,
      },
      preHandler: requireAuth,
    },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const raw = Buffer.isBuffer(req.body) ? (req.body as Buffer) : null;
      if (!raw) return reply.code(415).send({ code: 'INVALID_IMAGE', message: 'send raw image bytes with an image/* content-type' });

      const res = await setProfilePhoto(
        { pool: app.db, storage: app.storage, usage, moderation: new ImageModerationService(app.db), limits, log: app.log },
        req.user!.id,
        raw,
      );
      if (!res.ok) {
        req.log.warn({ userId: req.user!.id, reason: res.reason, bytes: raw.length }, 'profile photo upload rejected');
        return reply.code(res.status).send({ code: res.code, message: res.message });
      }
      return { profilePhotoUrl: res.profilePhotoUrl };
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
  app.delete('/me/profile-picture', { config: { skipValidation: true }, preHandler: requireAuth }, async (req) => {
    const prev = await app.db.query<{ profile_photo_key: string | null }>(
      `SELECT profile_photo_key FROM users WHERE id = $1`,
      [req.user!.id],
    );
    await app.db.query(`UPDATE users SET profile_photo_key = NULL WHERE id = $1`, [req.user!.id]);
    await scheduleOrphan(app, prev.rows[0]?.profile_photo_key ?? null, null);
    return { ok: true };
  });

  /** Active sessions = live refresh-token families (KUR-022). */
  app.get('/me/sessions', { preHandler: requireAuth }, async (req) => {
    const result = await app.db.query<{
      family_id: string;
      device_name: string | null;
      started_at: Date;
      last_seen_at: Date;
    }>(
      `SELECT family_id, max(device_name) AS device_name,
              min(created_at) AS started_at, max(created_at) AS last_seen_at
       FROM refresh_tokens
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       GROUP BY family_id
       ORDER BY max(created_at) DESC`,
      [req.user!.id],
    );
    return {
      sessions: result.rows.map((row) => ({
        id: row.family_id,
        deviceName: row.device_name,
        startedAt: new Date(row.started_at).toISOString(),
        lastSeenAt: new Date(row.last_seen_at).toISOString(),
        current: row.family_id === req.user!.familyId,
      })),
    };
  });

  app.delete(
    '/me/sessions/:id',
    {
      schema: { params: z.object({ id: z.uuid() }) },
      preHandler: requireAuth,
    },
    async (req) => {
      const { id } = req.params as { id: string };
      const result = await app.db.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE family_id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [id, req.user!.id],
      );
      if ((result.rowCount ?? 0) === 0) {
        throw new AppError('SESSION_NOT_FOUND', 404, 'no active session with that id');
      }
      // when the caller revoked their own session, the client must drop
      // its tokens now — the access token would otherwise live ≤15 min
      return { revoked: true, current: id === req.user!.familyId };
    },
  );

  /** Re-consent + analytics preference (KUR-109). */
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
        await app.db.query(`UPDATE users SET analytics_consent = $2 WHERE id = $1`, [
          req.user!.id,
          body.analytics,
        ]);
      }
      const row = await app.db.query<MeRow>(`SELECT * FROM users WHERE id = $1`, [req.user!.id]);
      return { user: toMe(row.rows[0] as MeRow) };
    },
  );

  const gdpr = new GdprService(app.db, { storage: app.storage, jobs: app.jobs, log: app.log });

  /** GDPR: start the 14-day deletion grace period (KUR-024). */
  app.delete('/me', { preHandler: requireAuth }, async (req) => {
    await gdpr.requestDeletion(req.user!.id);
    return { deletionScheduled: true, graceDays: DELETION_GRACE_DAYS };
  });

  /** GDPR: request a data export (fulfilled by the worker). */
  app.post(
    '/me/export',
    {
      config: { skipValidation: true }, // no body
      preHandler: requireAuth,
    },
    async (req, reply) => {
      const exportId = await gdpr.requestExport(req.user!.id);
      if (app.jobs) {
        await app.jobs.enqueue(makeExportJob(gdpr), { exportId }, { idempotencyKey: `export:${exportId}` });
      }
      return reply.code(202).send({ requested: true });
    },
  );

  app.get('/me/export', { preHandler: requireAuth }, async (req) => {
    return gdpr.exportStatus(req.user!.id);
  });

  /** Logout everywhere: kills refresh sessions AND live access tokens. */
  app.delete('/me/sessions', { preHandler: requireAuth }, async (req) => {
    await app.db.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [req.user!.id],
    );
    // token_version bump invalidates every outstanding access token
    // immediately, including the one making this request
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

      const sets: string[] = [];
      const values: unknown[] = [userId];
      const add = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (body.displayName !== undefined) add('display_name', stripControlChars(normalizeKurdish(body.displayName)));
      if (body.bio !== undefined) add('bio', sanitizeBio(body.bio));
      if (body.locale !== undefined) add('locale', body.locale);
      if (body.skipSpeaking !== undefined) add('skip_speaking', body.skipSpeaking);
      if (body.country !== undefined) add('country', body.country === '' ? null : body.country.toUpperCase());

      if (body.timezone !== undefined) {
        const cur = await app.db.query<{ timezone: string; timezone_changed_at: Date | null }>(
          `SELECT timezone, timezone_changed_at FROM users WHERE id = $1`,
          [userId],
        );
        const row = cur.rows[0]!;
        if (body.timezone !== row.timezone) {
          // Cap tz changes to once a week so a streak can't be farmed by
          // hopping timezones to fabricate extra days (KUR-031).
          const cooldownMs = TIMEZONE_CHANGE_COOLDOWN_DAYS * 24 * 3_600_000;
          if (
            row.timezone_changed_at &&
            Date.now() - new Date(row.timezone_changed_at).getTime() < cooldownMs
          ) {
            throw new AppError(
              'TIMEZONE_CHANGE_COOLDOWN',
              429,
              `timezone can only be changed once every ${TIMEZONE_CHANGE_COOLDOWN_DAYS} days`,
            );
          }
          add('timezone', body.timezone);
          add('timezone_changed_at', new Date());
        }
      }

      if (body.username !== undefined) {
        const res = validateUsername(body.username);
        if (!res.ok) {
          throw new AppError('INVALID_USERNAME', 400, USERNAME_ERROR_MESSAGE[res.reason], { reason: res.reason });
        }
        const username = res.value;
        const current = await app.db.query<{ username: string; username_changed_at: Date | null }>(
          `SELECT username, username_changed_at FROM users WHERE id = $1`,
          [userId],
        );
        const row = current.rows[0] as { username: string; username_changed_at: Date | null };
        // case-insensitive compare: only a real change spends the cooldown (a
        // re-cased no-op like Mohamad→mohamad is not a "change")
        if (username.toLowerCase() !== row.username.toLowerCase()) {
          const cooldownMs = USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 3_600_000;
          if (row.username_changed_at && Date.now() - new Date(row.username_changed_at).getTime() < cooldownMs) {
            const availableAt = new Date(new Date(row.username_changed_at).getTime() + cooldownMs);
            throw new AppError(
              'USERNAME_CHANGE_COOLDOWN',
              429,
              `You can change your username again on ${availableAt.toISOString().slice(0, 10)}.`,
              { availableAt: availableAt.toISOString(), cooldownDays: USERNAME_CHANGE_COOLDOWN_DAYS },
            );
          }
          add('username', username);
          add('username_changed_at', new Date());
        }
      }

      if (sets.length === 0) {
        const unchanged = await app.db.query<MeRow>(`SELECT * FROM users WHERE id = $1`, [userId]);
        return { user: toMe(unchanged.rows[0] as MeRow) };
      }

      try {
        const updated = await app.db.query<MeRow>(
          `UPDATE users SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
          values,
        );
        return { user: toMe(updated.rows[0] as MeRow) };
      } catch (err) {
        if ((err as { constraint?: string }).constraint === 'users_username_active_uniq') {
          throw new AppError('USERNAME_TAKEN', 409, 'username already in use');
        }
        throw err;
      }
    },
  );
}
