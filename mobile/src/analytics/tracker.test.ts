import { describe, expect, it, vi } from 'vitest';
import { FLUSH_SIZE, type TrackedEvent } from './buffer.js';
import { AnalyticsTracker, eventId } from './tracker.js';

describe('eventId', () => {
  it('is uuid-v4 shaped', () => {
    expect(eventId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('AnalyticsTracker', () => {
  it('buffers until the size threshold, then flushes one batch', async () => {
    const sent: TrackedEvent[][] = [];
    const send = vi.fn(async (b: TrackedEvent[]) => {
      sent.push(b);
      return true;
    });
    const tracker = new AnalyticsTracker(send, () => 1000);
    for (let i = 0; i < FLUSH_SIZE - 1; i++) tracker.track('screen_view');
    expect(send).not.toHaveBeenCalled();
    tracker.track('screen_view'); // hits FLUSH_SIZE
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(sent[0]).toHaveLength(FLUSH_SIZE);
  });

  it('flushes on the 30s interval even below the size threshold', async () => {
    let clock = 0;
    const send = vi.fn(async () => true);
    const tracker = new AnalyticsTracker(send, () => clock);
    tracker.track('lesson_start');
    expect(send).not.toHaveBeenCalled();
    clock += 30_000;
    tracker.track('lesson_start'); // interval elapsed → flush
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('requeues a failed batch so nothing is lost offline', async () => {
    let online = false;
    const send = vi.fn(async () => online);
    const tracker = new AnalyticsTracker(send, () => 0);
    tracker.track('purchase');
    await tracker.flush(); // fails → requeued
    expect(tracker.pending).toBe(1);
    online = true;
    await tracker.flush(); // succeeds
    expect(tracker.pending).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
  });
});
