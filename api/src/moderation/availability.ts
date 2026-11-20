import { AppError } from '../plugins/errors.js';

/**
 * An account that is suspended or banned right now is unavailable to everyone else, whatever was chosen for its
 * content: not found in search, not listed as anyone's friend, off the XP boards and out of the leagues, unreachable
 * by message, and its profile says it isn't available. One predicate, read from the enforced columns the sign-in gate
 * reads, so every surface agrees and nothing costs an extra query.
 */

/** SQL: the account behind `alias` is not suspended or banned now. */
export function availableSql(alias: string): string {
  return `(${alias}.banned_at IS NULL OR ${alias}.banned_until <= now())`;
}

/** SQL: the account behind `alias` is suspended or banned now. */
export function unavailableSql(alias: string): string {
  return `NOT ${availableSql(alias)}`;
}

/** Whether a row's enforced columns say the account is unavailable now. */
export function isUnavailable(row: { banned_at: Date | null; banned_until: Date | null }, now: Date = new Date()): boolean {
  return row.banned_at !== null && (row.banned_until === null || row.banned_until.getTime() > now.getTime());
}

/** The words clients show for such an account, and the error that carries them. */
export const UNAVAILABLE_MESSAGE = 'This account isn’t available';

/** 403 ACCOUNT_UNAVAILABLE: a message or invite to an account that is suspended or banned. */
export function accountUnavailable(status: 403 | 404 = 403): AppError {
  return new AppError('ACCOUNT_UNAVAILABLE', status, UNAVAILABLE_MESSAGE);
}
