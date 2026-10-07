import type pg from 'pg';
import { z } from 'zod';
import {
  EARLIEST_BIRTH_YEAR,
  isBelowConsentAge,
  isBelowMinimumAge,
  isMinor,
  isPlausibleBirthMonth,
  MIN_SIGNUP_AGE,
  type BirthMonth,
} from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import type { GdprService } from '../gdpr/service.js';
import { inLeaguesSql, leaveThisWeek } from '../leagues/service.js';
import { leaveOpenGroups } from '../groups/service.js';
import { groupRoom } from '../groups/chat-service.js';

/** Takes a user's place in a live room back (the realtime gateway's `revoke`). */
export interface RoomRevoker {
  revoke(roomId: string, userId: string): Promise<void>;
}

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
    private readonly rooms?: RoomRevoker,
  ) {}

  async set(userId: string, birth: BirthMonth, now: Date = new Date()): Promise<void> {
    if (!isPlausibleBirthMonth(birth, now)) {
      throw new AppError('INVALID_BIRTH_MONTH', 400, 'that birth month is not possible');
    }

    const client = await this.pool.connect();
    let closeAccount = false;
    let leftGroups: string[] = [];
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
        if (isMinor(birth, now)) leftGroups = await applyMinorDefaults(client, userId, now);
        // analytics consent given before we knew needed a parent's below 16,
        // which POST /me/consent now asks for; until then it is off
        if (isBelowConsentAge(birth, now)) {
          await client.query(`UPDATE users SET analytics_consent = false WHERE id = $1`, [userId]);
        }
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
    // out of the open groups' live chat too, not only their member lists; a
    // missed revoke leaves a socket that the next history read cannot renew
    for (const groupId of leftGroups) {
      await this.rooms?.revoke(groupRoom(groupId), userId).catch(() => undefined);
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
 *
 * And they leave every open group: a minor cannot be in one, and staying would
 * keep them on a roster strangers read, or as the owner of a group whose chat
 * they can no longer open. A group they own is handed on as when an owner's
 * account is deleted (the oldest moderator, else the oldest member, else it is
 * archived). Returns the groups they left, whose live rooms the caller closes
 * once this has committed. Invite-only groups stay: somebody they chose put
 * them there.
 */
async function applyMinorDefaults(
  executor: Pick<pg.Pool, 'query'>,
  userId: string,
  now: Date,
): Promise<string[]> {
  await executor.query(
    `UPDATE users SET profile_visibility = 'friends'
      WHERE id = $1 AND profile_visibility IN ('everyone', 'members')`,
    [userId],
  );
  await executor.query(`UPDATE notification_prefs SET streak = NULL, updated_at = now() WHERE user_id = $1`, [
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
  return leaveOpenGroups(executor, userId);
}
