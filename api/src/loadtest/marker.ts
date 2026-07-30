/**
 * Load-test user marking (KUR-118 edge case). Load-test traffic registers users
 * under a reserved, RFC-invalid email domain so they can never collide with real
 * users and are trivially identifiable. Analytics (KUR-105/106) and leaderboards
 * exclude them, so a load run never pollutes product metrics or rankings.
 */

/** Reserved domain for synthetic load-test accounts (`.invalid` never resolves). */
export const LOADTEST_EMAIL_DOMAIN = 'loadtest.kurda.invalid';

/** True for a synthetic load-test account — exclude from analytics/leaderboards. */
export function isLoadTestUser(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().trim().endsWith(`@${LOADTEST_EMAIL_DOMAIN}`);
}

/** A deterministic load-test email for VU `n` (used by the k6 scenarios). */
export function loadTestEmail(n: number): string {
  return `vu-${n}@${LOADTEST_EMAIL_DOMAIN}`;
}
