/**
 * Phone (SMS) OTP verification — pure state logic (KUR-297). The send/verify
 * lifecycle with attempt limits, code expiry, and resend cooldown/caps, as a
 * set of pure functions with the clock injected (`now`). The SMS provider
 * (send), the code hashing, and persistence live in the service layer; this
 * module never sends, hashes, or stores — callers pass in the code *hash* and
 * the current time, so every branch is deterministically unit-testable.
 *
 * Optional feature: a verified phone raises trust (#295) and lowers risk
 * (#296); it is never required for normal use.
 */

/** How long a sent code stays valid. */
export const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** Failed verify attempts allowed against a single code before it's locked. */
export const MAX_ATTEMPTS = 5;
/** Codes that may be sent within one verification session. */
export const MAX_SENDS = 5;
/** Minimum gap between sends. */
export const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

export interface VerificationState {
  /** hash of the currently-active code (caller hashes; we never see the code) */
  codeHash: string;
  /** ms epoch when the current code expires */
  expiresAt: number;
  /** failed attempts against the current code */
  attempts: number;
  /** codes sent this session (incl. the first) */
  sends: number;
  /** ms epoch of the last send */
  lastSentAt: number;
}

/** Begin a verification session — the first code has just been sent. */
export function startVerification(codeHash: string, now: number): VerificationState {
  return { codeHash, expiresAt: now + CODE_TTL_MS, attempts: 0, sends: 1, lastSentAt: now };
}

export type ResendCheck =
  | { allowed: true }
  | { allowed: false; reason: 'cooldown'; retryAfterMs: number }
  | { allowed: false; reason: 'max-sends' };

/** Whether another code may be sent right now. */
export function canResend(state: VerificationState, now: number): ResendCheck {
  if (state.sends >= MAX_SENDS) return { allowed: false, reason: 'max-sends' };
  const elapsed = now - state.lastSentAt;
  if (elapsed < RESEND_COOLDOWN_MS) {
    return { allowed: false, reason: 'cooldown', retryAfterMs: RESEND_COOLDOWN_MS - elapsed };
  }
  return { allowed: true };
}

export type ResendResult =
  | { ok: true; state: VerificationState }
  | { ok: false; reason: 'cooldown' | 'max-sends'; retryAfterMs?: number };

/**
 * Send a fresh code. Respects the resend cooldown and the per-session send cap.
 * A new code resets the expiry and the attempt counter (the old code is void).
 */
export function resend(
  state: VerificationState,
  newCodeHash: string,
  now: number,
): ResendResult {
  const check = canResend(state, now);
  if (!check.allowed) {
    return check.reason === 'cooldown'
      ? { ok: false, reason: 'cooldown', retryAfterMs: check.retryAfterMs }
      : { ok: false, reason: 'max-sends' };
  }
  return {
    ok: true,
    state: {
      codeHash: newCodeHash,
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      sends: state.sends + 1,
      lastSentAt: now,
    },
  };
}

/** Attempts left before the current code is locked. */
export function remainingAttempts(state: VerificationState): number {
  return Math.max(0, MAX_ATTEMPTS - state.attempts);
}

export type VerifyResult =
  | { ok: true; state: VerificationState }
  | {
      ok: false;
      reason: 'too-many-attempts' | 'expired' | 'mismatch';
      state: VerificationState;
    };

/**
 * Verify a submitted code (already hashed by the caller the same way the stored
 * hash was produced). Checks run in a fixed order: a code that has exhausted
 * its attempts is locked (resend required); then expiry; then the match. A
 * mismatch consumes an attempt.
 */
export function verifyCode(
  state: VerificationState,
  submittedHash: string,
  now: number,
): VerifyResult {
  if (state.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too-many-attempts', state };
  }
  if (now > state.expiresAt) {
    return { ok: false, reason: 'expired', state };
  }
  if (submittedHash === state.codeHash) {
    return { ok: true, state };
  }
  return {
    ok: false,
    reason: 'mismatch',
    state: { ...state, attempts: state.attempts + 1 },
  };
}
