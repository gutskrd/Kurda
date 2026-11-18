/**
 * Pure event-window logic. Whether an event is live is derived from its bounds at read time, so no state can drift.
 * `nextBoundary` gives the instant the active list can next change, which the cache's TTL runs to.
 */

export interface EventDef {
  id: string;
  key: string;
  name: string;
  type: string;
  /** ISO-8601 UTC. */
  startsAt: string;
  endsAt: string;
  /** Higher renders first when events overlap. */
  priority: number;
  theme: string | null;
  quests: unknown[];
  rewards: Record<string, unknown>;
  enabled: boolean;
}

/** [startsAt, endsAt): live at the start instant, over the moment it ends. */
export function isActive(e: Pick<EventDef, 'startsAt' | 'endsAt' | 'enabled'>, now: number): boolean {
  if (!e.enabled) return false;
  return Date.parse(e.startsAt) <= now && Date.parse(e.endsAt) > now;
}

/**
 * The next instant (ms epoch) the active set could change, the soonest future start or end among enabled events,
 * or null when none remain. A start already reached or an end already passed does not count.
 */
export function nextBoundary(events: readonly EventDef[], now: number): number | null {
  let next = Infinity;
  for (const e of events) {
    if (!e.enabled) continue;
    const start = Date.parse(e.startsAt);
    const end = Date.parse(e.endsAt);
    if (start > now && start < next) next = start;
    if (end > now && end < next) next = end;
  }
  return Number.isFinite(next) ? next : null;
}

/** Enabled events live at `now`: highest priority first, then earlier start, then key. */
export function activeEvents(events: readonly EventDef[], now: number): EventDef[] {
  return events
    .filter((e) => isActive(e, now))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
        a.key.localeCompare(b.key),
    );
}

/** Seconds until the next boundary, clamped so a far-off boundary still refreshes. */
export function cacheTtlSeconds(events: readonly EventDef[], now: number, cap = 3600): number {
  const boundary = nextBoundary(events, now);
  if (boundary === null) return cap;
  return Math.min(cap, Math.max(1, Math.ceil((boundary - now) / 1000)));
}
