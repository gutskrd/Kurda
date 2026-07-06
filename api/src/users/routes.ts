import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { normalizeKurdish } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { requireAuth } from '../plugins/auth.js';
import { canonicalUsername } from './username.js';

export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

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

export const patchMeBodySchema = z
  .object({
    displayName: z.string().min(1).max(60).optional(),
    bio: z.string().max(1_000).optional(),
    locale: z.enum(['en', 'ku', 'de', 'tr', 'ar']).optional(),
    timezone: timezoneSchema.optional(),
    username: z.string().min(3).max(30).optional(),
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
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function registerUserRoutes(app: FastifyInstance): void {
  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const result = await app.db.query<MeRow>(`SELECT * FROM users WHERE id = $1`, [req.user!.id]);
    return { user: toMe(result.rows[0] as MeRow) };
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

      if (body.displayName !== undefined) add('display_name', normalizeKurdish(body.displayName));
      if (body.bio !== undefined) add('bio', sanitizeBio(body.bio));
      if (body.locale !== undefined) add('locale', body.locale);
      if (body.timezone !== undefined) add('timezone', body.timezone);

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
