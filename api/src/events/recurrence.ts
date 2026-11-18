/**
 * Annual cultural events, such as Newroz on 21 March. The events table stores concrete windows, so a template's
 * month, day and duration are expanded ahead of time into per-year rows keyed `<key>-<year>`, which is idempotent
 * to re-seed. Windows are UTC, so the date never depends on the server's locale.
 */

export interface AnnualEventTemplate {
  key: string;
  name: string;
  type: string;
  theme: string;
  /** 1-12. */
  month: number;
  /** 1-31. */
  day: number;
  /** Window length in whole days. */
  durationDays: number;
  priority?: number;
  quests?: unknown[];
  rewards?: Record<string, unknown>;
}

export interface EventOccurrence {
  key: string;
  name: string;
  type: string;
  theme: string;
  startsAt: string;
  endsAt: string;
  priority: number;
  quests: unknown[];
  rewards: Record<string, unknown>;
}

const DAY_MS = 86_400_000;

/** The concrete window for this template in a specific calendar year (UTC). */
export function occurrenceForYear(t: AnnualEventTemplate, year: number): EventOccurrence {
  const start = Date.UTC(year, t.month - 1, t.day, 0, 0, 0, 0);
  const end = start + t.durationDays * DAY_MS;
  return {
    key: `${t.key}-${year}`,
    name: t.name,
    type: t.type,
    theme: t.theme,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    priority: t.priority ?? 0,
    quests: t.quests ?? [],
    rewards: t.rewards ?? {},
  };
}

/**
 * The next `count` occurrences whose window has not ended at `from`: the running one, if any, and future years.
 * Seeding a few years ahead keeps the event on time even if the seed is not re-run.
 */
export function upcomingOccurrences(
  t: AnnualEventTemplate,
  from: Date,
  count: number,
): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  const fromMs = from.getTime();
  let year = from.getUTCFullYear();
  // guard against a pathological template that never produces a future window
  const stopYear = year + count + 5;
  while (out.length < count && year <= stopYear) {
    const occ = occurrenceForYear(t, year);
    if (Date.parse(occ.endsAt) > fromMs) out.push(occ);
    year += 1;
  }
  return out;
}
