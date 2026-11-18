/**
 * Pure new-account trust levels and per-level velocity caps. The level follows from account facts (age, verification,
 * clean history), and each level caps high-abuse actions. Write paths compute it per request with the rate limiter's
 * rolling counts; accounts start tight and relax automatically as they age and verify.
 */

export type TrustLevel = 'new' | 'basic' | 'established';

export interface AccountFacts {
  /** how long the account has existed, in ms */
  accountAgeMs: number;
  emailVerified: boolean;
  /** Optional phone verification, which fast-tracks trust. */
  phoneVerified: boolean;
  /** confirmed policy violations on record */
  priorViolations: number;
}

/** An account reaches `basic` once it is verified and past this age. */
export const BASIC_MIN_AGE_MS = 60 * 60 * 1000; // 1 hour
/** `established` by age alone (with email verified). */
export const ESTABLISHED_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** A phone-verified account reaches `established` sooner. */
export const ESTABLISHED_FAST_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

/**
 * The effective trust level. A confirmed violation holds it at `new`; otherwise a verified email with enough age is
 * `established` (sooner with a verified phone), verified past the basic age is `basic`, and anything else `new`.
 */
export function getTrustLevel(facts: AccountFacts): TrustLevel {
  if (facts.priorViolations > 0) return 'new';

  const { emailVerified, phoneVerified, accountAgeMs } = facts;

  const established =
    emailVerified &&
    (accountAgeMs >= ESTABLISHED_MIN_AGE_MS ||
      (phoneVerified && accountAgeMs >= ESTABLISHED_FAST_AGE_MS));
  if (established) return 'established';

  if (emailVerified && accountAgeMs >= BASIC_MIN_AGE_MS) return 'basic';

  return 'new';
}

/** High-abuse actions that carry a per-level velocity cap. */
export type ThrottledAction = 'message' | 'group_create' | 'comment' | 'upload' | 'post';

/** The window the caps are measured over. */
export const VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour

/** Most actions per VELOCITY_WINDOW_MS by level: tight for `new` (a bot's first hour), generous for `established`. Defaults. */
export const VELOCITY_CAPS: Record<TrustLevel, Record<ThrottledAction, number>> = {
  new: { message: 20, group_create: 1, comment: 15, upload: 3, post: 2 },
  basic: { message: 100, group_create: 5, comment: 60, upload: 20, post: 10 },
  established: { message: 500, group_create: 20, comment: 300, upload: 100, post: 50 },
};

export interface ActionAllowance {
  allowed: boolean;
  cap: number;
  remaining: number;
}

/** Whether one more `action` is allowed after `taken` in the current window; a missing cap reads as 0, failing closed. */
export function checkActionAllowed(
  level: TrustLevel,
  action: ThrottledAction,
  recentCount: number,
): ActionAllowance {
  const cap = VELOCITY_CAPS[level][action] ?? 0;
  const remaining = Math.max(0, cap - recentCount);
  return { allowed: recentCount < cap, cap, remaining };
}
