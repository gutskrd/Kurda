/**
 * Pure event batching buffer (KUR-105) — no React Native. Accumulates events
 * and signals a flush at 50 events or every 30s, deduping by the client-
 * generated event id so an offline replay can't double-send. On a failed flush
 * the drained batch is requeued, so events survive until they're delivered.
 */

export const FLUSH_SIZE = 50;
export const FLUSH_INTERVAL_MS = 30_000;

export interface TrackedEvent {
  eventId: string;
  type: string;
  payload: Record<string, unknown>;
  clientTs: string;
}

export class EventBuffer {
  private events: TrackedEvent[] = [];
  private ids = new Set<string>();

  get size(): number {
    return this.events.length;
  }

  /** Add an event, ignoring a duplicate id. */
  add(event: TrackedEvent): void {
    if (this.ids.has(event.eventId)) return;
    this.ids.add(event.eventId);
    this.events.push(event);
  }

  /** Flush when the batch is full, or on the interval if anything is buffered. */
  shouldFlush(sinceLastFlushMs: number): boolean {
    if (this.events.length === 0) return false;
    return this.events.length >= FLUSH_SIZE || sinceLastFlushMs >= FLUSH_INTERVAL_MS;
  }

  /** Take everything out for sending; the buffer is left empty. */
  drain(): TrackedEvent[] {
    const out = this.events;
    this.events = [];
    this.ids.clear();
    return out;
  }

  /** Put a failed batch back at the front (still deduped) for the next attempt. */
  requeue(events: TrackedEvent[]): void {
    const pending = events.filter((e) => !this.ids.has(e.eventId));
    for (const e of pending) this.ids.add(e.eventId);
    this.events = [...pending, ...this.events];
  }
}
