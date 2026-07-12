/**
 * Pure admin moderation helpers (KUR-101). Ban/mute state is derived from
 * timestamps so a temp-ban lapses on its own at expiry (no sweep needed), and
 * every action requires a non-empty reason — the audit trail is only useful if
 * it says *why*.
 */

export type ModAction = 'warn' | 'mute' | 'temp_ban' | 'perm_ban' | 'unban' | 'wallet_adjust';

export type BanState = 'active' | 'temp_banned' | 'perm_banned';

export const MAX_REASON_LEN = 500;

/** A ban is permanent when `banned_at` is set with no expiry; temp until it passes. */
export function banState(now: Date, bannedAt: Date | null, bannedUntil: Date | null): BanState {
  if (!bannedAt) return 'active';
  if (bannedUntil === null) return 'perm_banned';
  return bannedUntil.getTime() > now.getTime() ? 'temp_banned' : 'active';
}

/** Whether the account is currently blocked from signing in. */
export function isBanned(now: Date, bannedAt: Date | null, bannedUntil: Date | null): boolean {
  return banState(now, bannedAt, bannedUntil) !== 'active';
}

export function isMuted(now: Date, mutedUntil: Date | null): boolean {
  return mutedUntil !== null && mutedUntil.getTime() > now.getTime();
}

/** Trimmed reason, or null if it's missing/blank/too long — reason is mandatory. */
export function normalizeReason(reason: unknown): string | null {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_REASON_LEN) return null;
  return trimmed;
}

/** A future expiry `hours` from `now` (whole hours ≥ 1), or null if invalid. */
export function expiryFrom(now: Date, hours: number): Date | null {
  if (!Number.isFinite(hours) || hours < 1) return null;
  return new Date(now.getTime() + Math.floor(hours) * 3_600_000);
}
