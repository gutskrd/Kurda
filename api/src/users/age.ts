import type { FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { ADULT_AGE, isBelowConsentAge, isMinor, type BirthMonth } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { requireAuth } from '../plugins/auth.js';

/**
 * Minor status, worked out when needed (@kurda/shared `age`), in two forms that must agree: one for a row in hand,
 * one in SQL for filtering many users (search, suggestions, leagues), built from the same constants and treating the
 * birth month itself as "not yet". Two questions differ only for an account with no birth month on record (a provider
 * sign-up that has not answered, or one from before it was asked):
 *
 * - is a minor: known to be 13–17. What a person may do themselves (open a game to strangers, choose the public web)
 *   is refused on this.
 * - is not known to be an adult: a minor, or unknown. What decides whether a stranger may find or reach someone
 *   (search, suggestions, friend lists, boards, friend requests) uses this, since no answer is not "adult". Clients ask
 *   first, and such an account cannot write anything social (`requireBirthMonth`).
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

/** Known to be 18 or over right now: a birth month on record, and not a minor's. */
export function isKnownAdultRow(row: BirthColumns, now: Date = new Date()): boolean {
  const birth = birthMonthOf(row);
  return birth !== null && !isMinor(birth, now);
}

/** Known to be under the age of digital consent (16) right now. */
export function isBelowConsentAgeRow(row: BirthColumns, now: Date = new Date()): boolean {
  const birth = birthMonthOf(row);
  return birth !== null && isBelowConsentAge(birth, now);
}

/** SQL twin of `isMinorRow`: the user behind `alias` is known to be under 18 now. `alias` is always a literal from this codebase. */
export function minorSql(alias: string): string {
  return `(${alias}.birth_year IS NOT NULL AND (
    extract(year FROM now() AT TIME ZONE 'UTC')::int - ${alias}.birth_year
    - CASE WHEN extract(month FROM now() AT TIME ZONE 'UTC')::int <= ${alias}.birth_month THEN 1 ELSE 0 END
  ) < ${ADULT_AGE})`;
}

/** SQL twin of `!isKnownAdultRow`: the user behind `alias` is a minor or has no birth month on record; the test for who strangers may find or reach. */
export function notKnownAdultSql(alias: string): string {
  return `(${alias}.birth_year IS NULL OR ${minorSql(alias)})`;
}

/**
 * SQL: `a` and `b` (uuid columns or placeholders) are friends. Pairs are stored once, so both orders are tried. A NULL
 * on either side (a signed-out reader) is nobody's friend.
 */
export function areFriendsSql(a: string, b: string): string {
  return `EXISTS (
    SELECT 1 FROM friendships fr
     WHERE fr.status = 'accepted'
       AND ((fr.user_lo = ${a} AND fr.user_hi = ${b}) OR (fr.user_lo = ${b} AND fr.user_hi = ${a})))`;
}

/**
 * SQL: the user behind `alias` may be shown to `viewer` (a uuid placeholder or column, NULL when signed out) in a list
 * of people: a known adult, the viewer, or a friend of the viewer. Every list a stranger can read goes through this,
 * so minors and accounts of unknown age are never names a stranger can collect.
 */
export function shownToSql(alias: string, viewer: string): string {
  return `(NOT ${notKnownAdultSql(alias)} OR ${alias}.id = ${viewer} OR ${areFriendsSql(`${alias}.id`, viewer)})`;
}

/**
 * SQL: what `authorIdExpr` wrote may be shown to `viewer`: anyone's, unless the author is a minor, whose writing is for
 * them and their friends. Unlike `shownToSql` this asks "is a minor", or everything written before anyone was asked
 * would vanish; an account that has not answered cannot post anything new anyway.
 */
export function writtenForSql(authorIdExpr: string, viewer: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM users wa
     WHERE wa.id = ${authorIdExpr} AND ${minorSql('wa')}
       AND wa.id IS DISTINCT FROM ${viewer}
       AND NOT ${areFriendsSql('wa.id', viewer)})`;
}

/** Not known to be an adult now (a minor, or no birth month), by id; true for an unknown id too, the safe direction. */
export async function isNotKnownAdultUser(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<boolean> {
  const r = await executor.query<{ shielded: boolean }>(
    `SELECT ${notKnownAdultSql('u')} AS shielded FROM users u WHERE u.id = $1`,
    [userId],
  );
  return r.rows[0]?.shielded ?? true;
}

/** Whether the user has a birth month on record. False for an unknown id. */
export async function hasBirthMonth(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<boolean> {
  const r = await executor.query<{ known: boolean }>(
    `SELECT birth_year IS NOT NULL AS known FROM users WHERE id = $1`,
    [userId],
  );
  return r.rows[0]?.known ?? false;
}

/** The one refusal for an account that has not answered the birth month question. */
export function birthDateRequired(): AppError {
  return new AppError('BIRTH_DATE_REQUIRED', 428, 'answer the one-time birth month question first');
}

/**
 * preHandler: signed in with a birth month on record, on every route that reaches other people. Clients ask first, so
 * only an older app build meets this, and then it is right: the protections for minors cannot be decided without it.
 */
export async function requireBirthMonth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    await requireAuth(req, reply);
    return;
  }
  // Read with the account by the auth middleware on this request; asked here only when something else signed it in.
  const known = req.user.birthMonthKnown ?? (await hasBirthMonth(req.server.db, req.user.id));
  if (!known) throw birthDateRequired();
}
