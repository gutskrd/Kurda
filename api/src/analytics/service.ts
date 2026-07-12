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

  async ingest(userId: string, events: RawEvent[]): Promise<IngestResult> {
    const result: IngestResult = { accepted: 0, dropped: 0, duplicates: 0 };
    if (events.length === 0) return result;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const event of events) {
        const outcome = validateEvent(event.type, event.payload);
        if (!outcome.ok) {
          result.dropped += 1;
          this.hooks.onDropped?.(outcome.reason);
          continue;
        }
        const res = await client.query(
          `INSERT INTO analytics_events (event_id, user_id, type, payload, client_ts)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           ON CONFLICT (event_id) DO NOTHING
           RETURNING id`,
          [event.eventId, userId, outcome.type, JSON.stringify(outcome.payload), event.clientTs ?? null],
        );
        if (res.rowCount === 0) result.duplicates += 1;
        else result.accepted += 1;
      }
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
