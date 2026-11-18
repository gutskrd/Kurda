import type pg from 'pg';
import type { Cache } from '../cache/cache.js';
import { activeEvents, cacheTtlSeconds, nextBoundary, type EventDef } from './window.js';

const CACHE_DOMAIN = 'events';
// Renamed whenever the cached shape changes, since old and new servers share Redis during a deploy.
const CACHE_ID = 'active-next';

interface EventRow {
  id: string;
  key: string;
  name: string;
  type: string;
  starts_at: Date;
  ends_at: Date;
  priority: number;
  theme: string | null;
  quests: unknown[];
  rewards: Record<string, unknown>;
  enabled: boolean;
}

/** The events live now, and when that set can next change. */
export interface ActiveEvents {
  events: EventDef[];
  /** The soonest start or end still ahead among enabled events (ISO-8601 UTC), or null when none remain. */
  nextChangeAt: string | null;
}

export interface UpsertEventInput {
  key: string;
  name: string;
  type: string;
  startsAt: string;
  endsAt: string;
  priority?: number;
  theme?: string | null;
  quests?: unknown[];
  rewards?: Record<string, unknown>;
  enabled?: boolean;
}

function toDef(row: EventRow): EventDef {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    type: row.type,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    priority: row.priority,
    theme: row.theme,
    quests: row.quests ?? [],
    rewards: row.rewards ?? {},
    enabled: row.enabled,
  };
}

/**
 * Config-driven events: definitions are data (`upsert`), so launching a holiday needs no deploy. `active` is
 * derived from the window bounds and cached until exactly the next boundary, so events switch on and off on time
 * with no scheduled job; admin writes also clear the cache at once.
 */
export class EventService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly cache?: Cache,
  ) {}

  /** Create or replace a definition by its stable `key`. Busts the active cache. */
  async upsert(input: UpsertEventInput): Promise<EventDef> {
    const res = await this.pool.query<EventRow>(
      `INSERT INTO events (key, name, type, starts_at, ends_at, priority, theme, quests, rewards, enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10)
       ON CONFLICT (key) DO UPDATE SET
         name = EXCLUDED.name, type = EXCLUDED.type,
         starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
         priority = EXCLUDED.priority, theme = EXCLUDED.theme,
         quests = EXCLUDED.quests, rewards = EXCLUDED.rewards,
         enabled = EXCLUDED.enabled, updated_at = now()
       RETURNING *`,
      [
        input.key,
        input.name,
        input.type,
        input.startsAt,
        input.endsAt,
        input.priority ?? 0,
        input.theme ?? null,
        JSON.stringify(input.quests ?? []),
        JSON.stringify(input.rewards ?? {}),
        input.enabled ?? true,
      ],
    );
    await this.invalidate();
    return toDef(res.rows[0]!);
  }

  /** Toggle the kill switch without touching the window. Busts the cache. */
  async setEnabled(key: string, enabled: boolean): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE events SET enabled = $2, updated_at = now() WHERE key = $1`,
      [key, enabled],
    );
    await this.invalidate();
    return (res.rowCount ?? 0) > 0;
  }

  /** One definition by its stable key, or null. */
  async byKey(key: string): Promise<EventDef | null> {
    const res = await this.pool.query<EventRow>(`SELECT * FROM events WHERE key = $1`, [key]);
    return res.rows[0] ? toDef(res.rows[0]) : null;
  }

  /** All definitions (admin view), newest window first. */
  async list(): Promise<EventDef[]> {
    const res = await this.pool.query<EventRow>(`SELECT * FROM events ORDER BY starts_at DESC`);
    return res.rows.map(toDef);
  }

  /**
   * Events live now, highest priority first, and the next boundary among the enabled events still ahead, which is
   * exactly when the set could change. Cached until that boundary.
   */
  async active(now: Date = new Date()): Promise<ActiveEvents> {
    const nowMs = now.getTime();
    const cached = await this.cache?.get<ActiveEvents>(CACHE_DOMAIN, CACHE_ID);
    // The cache's TTL jitter can outlast the boundary; an entry from before it is read again.
    if (cached && (cached.nextChangeAt === null || Date.parse(cached.nextChangeAt) > nowMs)) return cached;

    // Enabled events whose window has not ended and whose boundary is within the cache horizon: enough for both the
    // active set and when it next changes.
    const res = await this.pool.query<EventRow>(
      `SELECT * FROM events WHERE enabled = true AND ends_at > $1 ORDER BY priority DESC, starts_at ASC`,
      [now],
    );
    const upcoming = res.rows.map(toDef);
    const boundary = nextBoundary(upcoming, nowMs);
    const active = { events: activeEvents(upcoming, nowMs), nextChangeAt: boundary === null ? null : new Date(boundary).toISOString() };
    await this.cache?.set(CACHE_DOMAIN, CACHE_ID, active, cacheTtlSeconds(upcoming, nowMs));
    return active;
  }

  private async invalidate(): Promise<void> {
    await this.cache?.del(CACHE_DOMAIN, CACHE_ID);
  }
}
