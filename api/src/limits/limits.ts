import type pg from 'pg';
import { LIMIT_REACHED, limitDetails, type LimitKind } from '@kurda/shared';
import { AppError } from '../plugins/errors.js';

type Executor = Pick<pg.Pool, 'query'>;

/**
 * The lock that makes a limit hold: one person's creates of one kind run one at a time, so each count includes the
 * others' rows. Transaction-scoped, so take it inside the transaction that counts and inserts, before the count. Keyed
 * by kind and person, so unrelated limits never wait on each other. Where a transaction locks a person and a row (a
 * group, a friendship), the person comes first everywhere, so two transactions never deadlock.
 */
export async function lockPersonFor(executor: Executor, kind: string, userId: string): Promise<void> {
  await executor.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [`limits:${kind}:${userId}`]);
}

/** Two people's locks for one kind, always in the same order, so a request and its answer cannot deadlock. */
export async function lockPeopleFor(executor: Executor, kind: string, a: string, b: string): Promise<void> {
  const [first, second] = a < b ? [a, b] : [b, a];
  await lockPersonFor(executor, kind, first);
  if (second !== first) await lockPersonFor(executor, kind, second);
}

/**
 * The refusal for a limit with no code of its own: 409 LIMIT_REACHED with `{ limit, max }` (and `theirs` for someone
 * else's) so the apps can word it; `message` is the English for clients that read only that.
 */
export function limitReached(limit: LimitKind, message: string, opts: { theirs?: boolean } = {}): AppError {
  return new AppError(LIMIT_REACHED, 409, message, limitDetails(limit, opts));
}
