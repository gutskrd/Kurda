import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { normalizeKurdish, stripControlChars } from '@kurda/shared';
import { CURRENT_POLICY_VERSION } from '../gdpr/consent.js';
import { DELETION_GRACE_DAYS, GdprService } from '../gdpr/service.js';
import { makeExportJob } from '../jobs/gdpr-jobs.js';
import { AppError } from '../plugins/errors.js';
import { requireAuth } from '../plugins/auth.js';
import { canonicalUsername } from './username.js';
import { StreakService } from '../streaks/service.js';
import { MediaService } from '../media/service.js';
import { ImageModerationService } from '../moderation/image-moderation-service.js';

export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;
/** Profile photos are small; cap tighter than the global media limit (KUR-177). */
export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const PROFILE_PHOTO_KIND = 'profile-photo';
const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
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

export function registerUserRoutes(app: FastifyInstance): void {
  const streaks = new StreakService(app.db);

  /** Resolve a stored photo key to a public CDN URL (null when unset/no storage). */
  const photoUrl = (key: string | null): string | null =>
    key && app.storage ? app.storage.publicUrl(key) : null;

  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const result = await app.db.query<MeRow>(`SELECT * FROM users WHERE id = $1`, [req.user!.id]);
    const row = result.rows[0] as MeRow;
    // settle the streak on read so a lapsed day shows as broken (KUR-031)
    const streak = await streaks.get(row.id, row.timezone);
    return { user: { ...toMe(row), streak, profilePhotoUrl: photoUrl(row.profile_photo_key) } };
  });

  // ---- Profile photo (KUR-177): upload → confirm/set → resolve/clear ----

  /** Signed PUT for a profile photo (image types only, tighter size cap). */
  app.post(
    '/me/profile-picture/upload-url',
    {
      schema: {
        body: z.object({
          contentType: z.enum(PROFILE_PHOTO_TYPES),
          contentLength: z.number().int().positive().max(MAX_PROFILE_PHOTO_BYTES),
          sha256Hex: z.string().regex(/^[a-f0-9]{64}$/),
        }),
      },
      preHandler: requireAuth,
    },
    async (req) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const b = req.body as { contentType: string; contentLength: number; sha256Hex: string };
      const media = new MediaService(app.db, app.storage);
      return media.requestUpload({ kind: PROFILE_PHOTO_KIND, ...b });
    },
  );

  /** Confirm an uploaded key and set it as the user's photo. */
  app.post(
    '/me/profile-picture',
    { schema: { body: z.object({ key: z.string().min(1).max(256) }) }, preHandler: requireAuth },
    async (req, reply) => {
      if (!app.storage) throw new AppError('MEDIA_UNAVAILABLE', 503, 'media storage is not configured');
      const { key } = req.body as { key: string };
      if (!key.startsWith(`${PROFILE_PHOTO_KIND}/`)) {
        return reply.code(400).send({ code: 'BAD_KEY', message: 'not a profile-photo key' });
      }
      // the key must have come through the upload pipeline (confirmed or not)
      const known = await app.db.query(`SELECT 1 FROM media_uploads WHERE key = $1`, [key]);
      if ((known.rowCount ?? 0) === 0) {
        return reply.code(400).send({ code: 'UNKNOWN_KEY', message: 'request an upload URL first' });
      }
      // auto-screen before it lands (KUR-181): a non-cleared image is rejected
      // and left unconfirmed, so the media orphan job reclaims it
      const outcome = await new ImageModerationService(app.db).scan(key, 'profile');
      if (outcome.scanStatus !== 'cleared') {
        return reply.code(422).send({ code: 'PHOTO_REJECTED', message: 'this image was rejected by moderation' });
      }
      const media = new MediaService(app.db, app.storage);
      await media.confirmUpload(key);
      const prev = await app.db.query<{ profile_photo_key: string | null }>(
        `SELECT profile_photo_key FROM users WHERE id = $1`,
        [req.user!.id],
      );
      await app.db.query(`UPDATE users SET profile_photo_key = $2 WHERE id = $1`, [req.user!.id, key]);
      await scheduleOrphan(app, prev.rows[0]?.profile_photo_key ?? null, key);
      return { profilePhotoUrl: photoUrl(key) };
    },
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
        const username = canonicalUsername(body.username);
        if (!username) {
          throw new AppError(
            'INVALID_USERNAME',
            400,
            'username must be 3-30 letters, digits or _ (Kurdish letters allowed)',
          );
        }
        const current = await app.db.query<{ username: string; username_changed_at: Date | null }>(
          `SELECT username, username_changed_at FROM users WHERE id = $1`,
          [userId],
        );
        const row = current.rows[0] as { username: string; username_changed_at: Date | null };
        if (username.toLowerCase() !== row.username.toLowerCase()) {
          const cooldownMs = USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 3_600_000;
          if (
            row.username_changed_at &&
            Date.now() - new Date(row.username_changed_at).getTime() < cooldownMs
          ) {
            throw new AppError(
              'USERNAME_CHANGE_COOLDOWN',
              429,
              `username can only be changed once every ${USERNAME_CHANGE_COOLDOWN_DAYS} days`,
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
