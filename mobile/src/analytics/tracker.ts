import { EventBuffer, type TrackedEvent } from './buffer.js';

/** Sends a batch; resolves true on success, false to keep it for retry. */
export type EventSender = (events: TrackedEvent[]) => Promise<boolean>;

/** RFC-4122-ish v4 id (event ids only need to be unique + uuid-shaped). */
export function eventId(rand: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (rand() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Batches behavioral events and flushes them at 50 events / 30s (KUR-105).
 * Framework-agnostic and clock-injected so it's fully unit-testable; a thin RN
 * layer calls `track` and drives `flush` on a timer + on app background. A
 * failed send requeues the batch, so nothing is lost offline.
 */
export class AnalyticsTracker {
  private buffer = new EventBuffer();
  private lastFlush: number;
  private inFlight = false;

  constructor(
    private readonly send: EventSender,
    private readonly now: () => number = () => Date.now(),
    private readonly genId: () => string = eventId,
  ) {
    this.lastFlush = now();
  }

  track(type: string, payload: Record<string, unknown> = {}): void {
    this.buffer.add({ eventId: this.genId(), type, payload, clientTs: new Date(this.now()).toISOString() });
    if (this.buffer.shouldFlush(this.now() - this.lastFlush)) void this.flush();
  }

  /** Send whatever is buffered; requeue on failure. Safe to call concurrently. */
  async flush(): Promise<void> {
    if (this.inFlight || this.buffer.size === 0) return;
    this.inFlight = true;
    this.lastFlush = this.now();
    const batch = this.buffer.drain();
    try {
      const ok = await this.send(batch);
      if (!ok) this.buffer.requeue(batch);
    } catch {
      this.buffer.requeue(batch);
    } finally {
      this.inFlight = false;
    }
  }

  get pending(): number {
    return this.buffer.size;
  }
}
