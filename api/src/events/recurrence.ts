/**
 * Recurring cultural events (KUR-090). Cultural holidays repeat on a fixed
 * calendar day each year (Newroz = March 21). The events table (KUR-089) stores
 * concrete windows, so recurrence is materialized ahead of time: a template
 * declares month/day/duration, and `upcomingOccurrences` expands it into
 * per-year rows keyed `<key>-<year>` — idempotent to re-seed. Windows are UTC so
 * "March 21" is unambiguous regardless of server locale.
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
 * The next `count` occurrences whose window has not already ended at `from` —
 * i.e. the currently-running one (if any) plus future years. Materialize a few
 * years ahead so the event always appears on time even if the seed isn't re-run.
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
