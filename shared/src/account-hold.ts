/**
 * An account held while a person checks whether it belongs to someone who was banned. The person can keep learning, but
 * cannot post, comment, message, upload, write letters or join groups until a moderator decides; the server answers
 * those with 403 `ACCOUNT_HELD`. A shared network alone never holds anyone.
 */

/** The 403 code of an action a held account may not take. */
export const ACCOUNT_HELD = 'ACCOUNT_HELD';

/** Why an account is held: so far only a possible return of a banned person. */
export const ACCOUNT_HOLD_REASONS = ['possible_return'] as const;
export type AccountHoldReason = (typeof ACCOUNT_HOLD_REASONS)[number];

/** `GET /me` carries `accountHold`: null for nearly everyone. */
export interface AccountHold {
  reason: AccountHoldReason;
  since: string;
}

/**
 * What happens to a banned or suspended person's content, chosen by the moderator: kept, hidden from everyone until the
 * ban is lifted or overturned, or removed for good once the appeal window has passed.
 */
export const BAN_CONTENT_CHOICES = ['keep', 'hide', 'remove'] as const;
export type BanContentChoice = (typeof BAN_CONTENT_CHOICES)[number];

/**
 * The paths a suspension's appeal token may reach besides standing and appeals: a copy of one's data and deleting the
 * account, since those rights do not end with a ban.
 */
export const APPEAL_TOKEN_EXTRA_PATHS = ['/me/export', '/me'] as const;
