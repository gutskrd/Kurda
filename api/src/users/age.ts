import type { FastifyReply, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { ADULT_AGE, isBelowConsentAge, isMinor, type BirthMonth } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';
import { requireAuth } from '../plugins/auth.js';

/**
 * Minor status, worked out at the moment it is needed (@kurda/shared `age`).
 *
 * Two forms of the same rule: one for a row already in hand, one for SQL that
 * has to filter many users at once (search, suggestions, leagues). They must
 * agree, which is why the SQL is built from the same constants and makes the
 * same choice in the birth month — it counts as not yet.
 *
 * And two questions, which differ only for an account with no birth month on
 * record (one made through Google or Apple that has not answered yet, or one
 * from before we asked):
 *
 * - *is a minor* — known to be 13–17. What a person may do themselves (start an
 *   open group, choose the public web) is refused on this.
 * - *is not known to be an adult* — a minor, or nobody knows. What decides
 *   whether a stranger may find or reach somebody (search, suggestions, other
 *   people's friend lists, the boards, a friend request) uses this one: an
 *   unanswered question is not an answer of "adult". Every client asks before
 *   anything else, and an account in that state cannot write anything social
 *   (`requireBirthMonth`), so it is a waiting room rather than a place to live.
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

/**
 * SQL twin of `!isKnownAdultRow`: the user behind `alias` is a minor, or has
 * no birth month on record. The test for who strangers may find or reach.
 */
export function notKnownAdultSql(alias: string): string {
  return `(${alias}.birth_year IS NULL OR ${minorSql(alias)})`;
}

/**
 * SQL: `a` and `b` (two uuid expressions — columns or placeholders) are
 * friends. Friendship rows are stored once per pair, so both orders are tried.
 * A NULL on either side (a signed-out reader) is never anybody's friend.
 */
export function areFriendsSql(a: string, b: string): string {
  return `EXISTS (
    SELECT 1 FROM friendships fr
     WHERE fr.status = 'accepted'
       AND ((fr.user_lo = ${a} AND fr.user_hi = ${b}) OR (fr.user_lo = ${b} AND fr.user_hi = ${a})))`;
}

/**
 * SQL: the user behind `alias` may be shown to the viewer `viewer` (a uuid
 * placeholder or column; NULL for a signed-out reader) in a list of people:
 * a known adult, or the viewer themselves, or one of the viewer's friends.
 *
 * Every list of people a stranger can read goes through this, so a minor — or
 * an account whose age nobody knows yet — is never one of the names a stranger
 * can collect, while their friends see them as before.
 */
export function shownToSql(alias: string, viewer: string): string {
  return `(NOT ${notKnownAdultSql(alias)} OR ${alias}.id = ${viewer} OR ${areFriendsSql(`${alias}.id`, viewer)})`;
}

/**
 * SQL: what `authorIdExpr` wrote may be shown to `viewer` — anyone's, unless
 * the author is a minor, whose posts and comments are for themselves and
 * their friends. Unlike `shownToSql` this asks *is a minor* rather than *not
 * known to be an adult*: everything written before anyone was asked would
 * otherwise vanish from the library at once, and an account that has not
 * answered cannot post anything new until it does.
 */
export function writtenForSql(authorIdExpr: string, viewer: string): string {
  return `NOT EXISTS (
    SELECT 1 FROM users wa
     WHERE wa.id = ${authorIdExpr} AND ${minorSql('wa')}
       AND wa.id IS DISTINCT FROM ${viewer}
       AND NOT ${areFriendsSql('wa.id', viewer)})`;
}

/** Known to be 13–17 right now, looked up by id. False for an unknown id. */
export async function isMinorUser(executor: Pick<pg.Pool, 'query'>, userId: string): Promise<boolean> {
  const r = await executor.query<{ minor: boolean }>(
    `SELECT ${minorSql('u')} AS minor FROM users u WHERE u.id = $1`,
    [userId],
  );
  return r.rows[0]?.minor ?? false;
}

/**
 * Not known to be an adult right now (a minor, or no birth month on record),
 * looked up by id. True for an unknown id too: the safe direction to fail in.
 */
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
 * preHandler: signed in, with a birth month on record.
 *
 * On every route that reaches other people (a friend request, a group, a
 * message, a post or a comment). The clients ask the question before anything
 * else, so a real person meets this only from an app build older than the
 * question — and then it is the right answer: whether the protections for
 * minors apply cannot be decided without it.
 */
export async function requireBirthMonth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.user) {
    await requireAuth(req, reply);
    return;
  }
  if (!(await hasBirthMonth(req.server.db, req.user.id))) throw birthDateRequired();
}
