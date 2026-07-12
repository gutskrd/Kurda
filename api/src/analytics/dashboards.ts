/**
 * Pure dashboard math + definitions (KUR-106). Aggregates are precomputed into
 * rollup tables (counts only, no PII), so figures stay correct even after a user
 * is deleted/anonymized. The definitions here are the documented meaning of each
 * metric, kept beside the code that computes them.
 */

/** "Active" = a user with at least one tracked event in the window. */
export const RETENTION_DAYS = [1, 7, 30] as const;

/** Funnels are ordered event-type sequences; a user "reaches" a step by firing it. */
export const FUNNELS: Record<string, string[]> = {
  onboarding: ['screen_view', 'lesson_start', 'lesson_complete'],
  lesson: ['lesson_start', 'lesson_complete'],
};

/** Retained fraction of a cohort in [0,1]; 0 for an empty cohort. */
export function retentionRate(cohortSize: number, retained: number): number {
  if (cohortSize <= 0) return 0;
  return retained / cohortSize;
}

export interface FunnelStep {
  step: string;
  users: number;
}

export interface FunnelStepRate extends FunnelStep {
  /** Share of the first step's users still present (top-of-funnel conversion). */
  rateFromFirst: number;
  /** Share of the previous step's users retained (step-to-step conversion). */
  rateFromPrev: number;
}

/** Annotate funnel step counts with conversion rates. */
export function conversionRates(steps: readonly FunnelStep[]): FunnelStepRate[] {
  const first = steps[0]?.users ?? 0;
  return steps.map((s, i) => {
    const prev = i === 0 ? s.users : steps[i - 1]!.users;
    return {
      ...s,
      rateFromFirst: first > 0 ? s.users / first : 0,
      rateFromPrev: prev > 0 ? s.users / prev : 0,
    };
  });
}

/** The first day of an N-day window ending on `day` (inclusive), as YYYY-MM-DD. */
export function windowStart(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d.toISOString().slice(0, 10);
}

/** `day` shifted back `n` days, as YYYY-MM-DD (used for retention cohorts). */
export function daysBefore(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
