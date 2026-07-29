import type pg from 'pg';
import type { Cache } from '../cache/cache.js';
import { activeEvents, cacheTtlSeconds, type EventDef } from './window.js';

const CACHE_DOMAIN = 'events';
const CACHE_ID = 'active';

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
 * Config-driven events (KUR-089). Definitions are pure data (`upsert`), so
 * launching a holiday needs no deploy. `active` is derived from the window
 * bounds and cached with a TTL that expires exactly at the next boundary, so
 * activation/deactivation happens on time without a per-event scheduled job and
 * the cache invalidates itself. Admin writes also bust the cache immediately so
 * a correction isn't stuck behind the previous TTL.
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

  /** All definitions (admin view), newest window first. */
  async list(): Promise<EventDef[]> {
    const res = await this.pool.query<EventRow>(`SELECT * FROM events ORDER BY starts_at DESC`);
    return res.rows.map(toDef);
  }

  /**
   * Events live right now, highest priority first. Cached until the next
   * boundary. The TTL is computed from the enabled events whose boundary is
   * still ahead, so the cache lapses exactly when the set could change.
   */
  async active(now: Date = new Date()): Promise<EventDef[]> {
    const nowMs = now.getTime();
    const cached = await this.cache?.get<EventDef[]>(CACHE_DOMAIN, CACHE_ID);
    if (cached) return cached;

    // Candidates: enabled events whose window hasn't ended and whose boundary
    // is within the cache horizon — enough to compute both the active set and
    // when it next changes.
    const res = await this.pool.query<EventRow>(
      `SELECT * FROM events WHERE enabled = true AND ends_at > $1 ORDER BY priority DESC, starts_at ASC`,
      [now],
    );
    const upcoming = res.rows.map(toDef);
    const live = activeEvents(upcoming, nowMs);
    const ttl = cacheTtlSeconds(upcoming, nowMs);
    await this.cache?.set(CACHE_DOMAIN, CACHE_ID, live, ttl);
    return live;
  }

  private async invalidate(): Promise<void> {
    await this.cache?.del(CACHE_DOMAIN, CACHE_ID);
  }
}
