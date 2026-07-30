/**
 * Pure event-window logic (KUR-089). Activation is derived from the window
 * bounds at read time — no per-event state flip — so there is nothing to drift
 * out of sync. `nextBoundary` drives boundary-exact cache expiry: the active
 * list is valid until the next start/end among *all* events, so caching it with
 * a TTL to that instant makes the cache invalidate itself exactly on time.
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

/** Clients render at most this many concurrent events (highest priority first). */
export const MAX_CONCURRENT_RENDER = 2;

/** [startsAt, endsAt): live at the start instant, over the moment it ends. */
export function isActive(e: Pick<EventDef, 'startsAt' | 'endsAt' | 'enabled'>, now: number): boolean {
  if (!e.enabled) return false;
  return Date.parse(e.startsAt) <= now && Date.parse(e.endsAt) > now;
}

/**
 * The next instant (ms epoch) at which the active set could change — the
 * soonest future start or end across enabled events — or null if none remain
 * (all events are in the past). A start already reached or an end already
 * passed is not a future boundary.
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

/**
 * Enabled events live at `now`, ordered for rendering: highest priority first,
 * ties broken by earlier start then key for stable output.
 */
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
