import type pg from 'pg';
import { ADULT_AGE, isBelowConsentAge, isMinor, type BirthMonth } from '@kurda/shared';

/**
 * Minor status, worked out at the moment it is needed (@kurda/shared `age`).
 *
 * Two forms of the same rule: one for a row already in hand, one for SQL that
 * has to filter many users at once (search, suggestions, leagues). They must
 * agree, which is why the SQL is built from the same constants and makes the
 * same choice in the birth month — it counts as not yet.
 *
 * An account with no birth month on record is not treated as a minor here.
 * Every client stops at a one-time question until it is answered, so that state
 * lasts from an old account's last visit before this to its next sign-in.
 */

export interface BirthColumns {
  birth_year: number | null;
  birth_month: number | null;
}

export function birthMonthOf(row: BirthColumns): BirthMonth | null {
  if (row.birth_year == null || row.birth_month == null) return null;
  return { year: row.birth_year, month: row.birth_month };
}

/** Known to be 13–17 right now. */
export function isMinorRow(row: BirthColumns, now: Date = new Date()): boolean {
  const birth = birthMonthOf(row);
  return birth !== null && isMinor(birth, now);
}

/** Known to be under the age of digital consent (16) right now. */
export function isBelowConsentAgeRow(row: BirthColumns, now: Date = new Date()): boolean {
  const birth = birthMonthOf(row);
  return birth !== null && isBelowConsentAge(birth, now);
}

/**
 * SQL twin of `isMinorRow`: the user behind `alias` is known to be under 18 at
 * statement time. `alias` is always a literal from this codebase, never input.
 */
export function minorSql(alias: string): string {
  return `(${alias}.birth_year IS NOT NULL AND (
    extract(year FROM now() AT TIME ZONE 'UTC')::int - ${alias}.birth_year
    - CASE WHEN extract(month FROM now() AT TIME ZONE 'UTC')::int <= ${alias}.birth_month THEN 1 ELSE 0 END
  ) < ${ADULT_AGE})`;
}

/** Known to be 13–17 right now, looked up by id. False for an unknown id. */
export async function isMinorUser(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<boolean> {
  const r = await executor.query<{ minor: boolean }>(
    `SELECT ${minorSql('u')} AS minor FROM users u WHERE u.id = $1`,
    [userId],
  );
  return r.rows[0]?.minor ?? false;
}
