/**
 * Pure admin moderation helpers. Ban state derives from timestamps so a temp ban lapses at expiry without a sweep, and
 * every action needs a non-empty reason for the audit trail.
 */

export type BanState = 'active' | 'temp_banned' | 'perm_banned';

export const MAX_REASON_LEN = 500;

/** A ban is permanent when `banned_at` is set with no expiry; temp until it passes. */
export function banState(now: Date, bannedAt: Date | null, bannedUntil: Date | null): BanState {
  if (!bannedAt) return 'active';
  if (bannedUntil === null) return 'perm_banned';
  return bannedUntil.getTime() > now.getTime() ? 'temp_banned' : 'active';
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
