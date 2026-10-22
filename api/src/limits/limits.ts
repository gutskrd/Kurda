import type pg from 'pg';
import { LIMIT_REACHED, limitDetails, type LimitKind } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * The lock that makes a limit hold: one person's creates of one kind run one
 * after another, so the count each of them reads already has the others'
 * rows in it. Two requests at once used to read the same count, both pass and
 * both insert, which is how a limit of 500 friends let a sender have more.
 *
 * Transaction-scoped (released at COMMIT or ROLLBACK), so it must be taken
 * inside the transaction that counts and inserts, before the count. Keyed by
 * kind as well as person: saving a word never waits for a group being made.
 * Where a transaction locks a person and also a row (a group, a friendship),
 * the person comes first, everywhere, so two of them can never wait on each
 * other.
 */
export async function lockPersonFor(executor: Executor, kind: string, userId: string): Promise<void> {
  await executor.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`limits:${kind}:${userId}`]);
}

/**
 * Two people's locks for one kind, in the same order whoever asks — a friend
 * request and its answer each touch both lists, and taking the two in
 * different orders is how two transactions end up waiting on each other.
 */
export async function lockPeopleFor(executor: Executor, kind: string, a: string, b: string): Promise<void> {
  const [first, second] = a < b ? [a, b] : [b, a];
  await lockPersonFor(executor, kind, first);
  if (second !== first) await lockPersonFor(executor, kind, second);
}

/**
 * The refusal for a limit with no code of its own: 409 LIMIT_REACHED, with
 * `{ limit, max }` (and `theirs` when it is somebody else's) for the apps to
 * say which one in the reader's own words. `message` is the English the API
 * has always answered with, for a client that reads only that.
 */
export function limitReached(limit: LimitKind, message: string, opts: { theirs?: boolean } = {}): AppError {
  return new AppError(LIMIT_REACHED, 409, message, limitDetails(limit, opts));
}
