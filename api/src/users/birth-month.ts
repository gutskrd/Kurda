import type pg from 'pg';
import { z } from 'zod';
import {
  EARLIEST_BIRTH_YEAR,
  isBelowMinimumAge,
  isMinor,
  isPlausibleBirthMonth,
  MIN_SIGNUP_AGE,
  type BirthMonth,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { GdprService } from '../gdpr/service.js';
import { inLeaguesSql, leaveThisWeek } from '../leagues/service.js';

export const birthYearSchema = z.number().int().min(EARLIEST_BIRTH_YEAR).max(9999);
export const birthMonthSchema = z.number().int().min(1).max(12);

export const birthDateBodySchema = z.object({
  birthYear: birthYearSchema,
  birthMonth: birthMonthSchema,
});

function underMinimumAge(details?: Record<string, unknown>): AppError {
  return new AppError(
    'UNDER_MINIMUM_AGE',
    403,
    `accounts are for people aged ${MIN_SIGNUP_AGE} and over`,
    details,
  );
}

/**
 * The gate every sign-up passes: a month that could be real, and an age of at
 * least 13. Throws; returns nothing, so there is no verdict to keep.
 */
export function assertOldEnough(birth: BirthMonth, now: Date = new Date()): void {
  if (!isPlausibleBirthMonth(birth, now)) {
    throw new AppError('INVALID_BIRTH_MONTH', 400, 'that birth month is not possible');
  }
  if (isBelowMinimumAge(birth, now)) throw underMinimumAge();
}

/**
 * The one-time birth month question, for accounts that do not have one: every
 * account made before it was asked, and every Google or Apple sign-up, which
 * hands us an email address and nothing about age.
 *
 * Answered once. Letting it be changed would let anyone undo the protections
 * for minors by typing an older year, so only support can correct it.
 *
 * An answer under 13 closes the account there and then. It is not the
 * fourteen-day deletion a user can cancel by signing in again: an account we
 * now know belongs to a child is not one we may keep.
 */
export class BirthMonthService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly gdpr: Pick<GdprService, 'closeNow'>,
  ) {}

  async set(userId: string, birth: BirthMonth, now: Date = new Date()): Promise<void> {
    if (!isPlausibleBirthMonth(birth, now)) {
      throw new AppError('INVALID_BIRTH_MONTH', 400, 'that birth month is not possible');
    }

    const client = await this.pool.connect();
    let closeAccount = false;
    try {
      await client.query('BEGIN');
      const current = await client.query<{ birth_year: number | null }>(
        `SELECT birth_year FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [userId],
      );
      const row = current.rows[0];
      if (!row) throw new AppError('USER_NOT_FOUND', 404, 'no such user');
      // checked before the age, so a second answer can never close an account
      // that already has a birth month on record
      if (row.birth_year !== null) {
        throw new AppError('BIRTH_DATE_ALREADY_SET', 409, 'your birth month is already on record');
      }

      if (isBelowMinimumAge(birth, now)) {
        closeAccount = true;
      } else {
        await client.query(`UPDATE users SET birth_year = $2, birth_month = $3 WHERE id = $1`, [
          userId,
          birth.year,
          birth.month,
        ]);
        if (isMinor(birth, now)) await applyMinorDefaults(client, userId, now);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }

    if (closeAccount) {
      await this.gdpr.closeNow(userId, 'under_minimum_age');
      throw underMinimumAge({ accountClosed: true });
    }
  }
}

/**
 * What changes on the day we learn an existing account belongs to a minor.
 *
 * Only settings that were never chosen with an age in mind: until now nobody
 * was asked, so whatever an account holds is a default from a time we did not
 * know. From here on the minor's own choices stand (within the limits the
 * routes enforce). Leagues need nothing written — their default is read from
 * age every time — beyond leaving this week's league, joined as an adult.
 *
 * Friend requests other people sent them while we did not know go too: a minor
 * cannot be sent one, so none is theirs to accept. Requests they sent stay.
 */
async function applyMinorDefaults(
  executor: Pick<pg.Pool, 'query'>,
  userId: string,
  now: Date,
): Promise<void> {
  await executor.query(
    `UPDATE users SET profile_visibility = 'friends'
      WHERE id = $1 AND profile_visibility IN ('everyone', 'members')`,
    [userId],
  );
  await executor.query(`UPDATE notification_prefs SET streak = false, updated_at = now() WHERE user_id = $1`, [
    userId,
  ]);
  await executor.query(
    `DELETE FROM friendships
      WHERE status = 'pending' AND requested_by <> $1 AND (user_lo = $1 OR user_hi = $1)`,
    [userId],
  );
  const leagues = await executor.query<{ taking_part: boolean }>(
    `SELECT ${inLeaguesSql('u')} AS taking_part FROM users u WHERE u.id = $1`,
    [userId],
  );
  if (!leagues.rows[0]?.taking_part) await leaveThisWeek(executor, userId, now);
}
