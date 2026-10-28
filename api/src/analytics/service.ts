import type pg from 'pg';
import { validateEvent } from './registry.js';

export interface RawEvent {
  /** Client-generated id — the dedupe key across retries/offline replay. */
  eventId: string;
  type: string;
  payload: unknown;
  /** When the device recorded it (ISO); server records received_at itself. */
  clientTs?: string | null;
}

export interface IngestResult {
  accepted: number;
  dropped: number;
  duplicates: number;
}

export interface AnalyticsHooks {
  /** Called for each dropped event so a metric can count unknown/invalid ones. */
  onDropped?: (reason: 'unknown_type' | 'invalid_payload') => void;
}

/**
 * Server-side event ingest (KUR-105). Validates each event against the schema
 * registry, drops unknown/malformed ones (counted via `onDropped`), and inserts
 * the rest deduped by the client's `event_id` — so an offline batch replayed
 * after reconnect never double-counts. Everything lands in the day-partitioned
 * `analytics_events` store.
 */
export class AnalyticsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly hooks: AnalyticsHooks = {},
  ) {}

  /** Whether the person has agreed to analytics (`users.analytics_consent`, off by default). */
  async hasConsent(userId: string): Promise<boolean> {
    const res = await this.pool.query<{ analytics_consent: boolean }>(
      `SELECT analytics_consent FROM users WHERE id = $1`,
      [userId],
    );
    return res.rows[0]?.analytics_consent === true;
  }

  async ingest(userId: string, events: RawEvent[]): Promise<IngestResult> {
    const result: IngestResult = { accepted: 0, dropped: 0, duplicates: 0 };
    if (events.length === 0) return result;

    const valid: Array<{ eventId: string; type: string; payload: string; clientTs: string | null }> = [];
    for (const event of events) {
      const outcome = validateEvent(event.type, event.payload);
      if (!outcome.ok) {
        result.dropped += 1;
        this.hooks.onDropped?.(outcome.reason);
        continue;
      }
      valid.push({ eventId: event.eventId, type: outcome.type, payload: JSON.stringify(outcome.payload), clientTs: event.clientTs ?? null });
    }
    if (valid.length === 0) return result;

    // The whole batch in one statement, which is all or nothing on its own. An
    // event id already stored, or repeated within the batch, inserts once.
    const res = await this.pool.query(
      `INSERT INTO analytics_events (event_id, user_id, type, payload, client_ts)
       SELECT e.event_id, $1::uuid, e.type, e.payload::jsonb, e.client_ts
         FROM unnest($2::text[], $3::text[], $4::text[], $5::timestamptz[]) WITH ORDINALITY AS e(event_id, type, payload, client_ts, n)
        ORDER BY e.n
       ON CONFLICT (event_id) DO NOTHING
       RETURNING id`,
      [userId, valid.map((e) => e.eventId), valid.map((e) => e.type), valid.map((e) => e.payload), valid.map((e) => e.clientTs)],
    );
    result.accepted = res.rowCount ?? 0;
    result.duplicates = valid.length - result.accepted;
    return result;
  }
}
