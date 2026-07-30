import { describe, expect, it } from 'vitest';
import { EventBuffer, FLUSH_INTERVAL_MS, FLUSH_SIZE, type TrackedEvent } from './buffer.js';

const ev = (id: string): TrackedEvent => ({ eventId: id, type: 'screen_view', payload: {}, clientTs: '2026-07-12T00:00:00.000Z' });

describe('EventBuffer', () => {
  it('dedupes by event id', () => {
    const b = new EventBuffer();
    b.add(ev('a'));
    b.add(ev('a'));
    b.add(ev('b'));
    expect(b.size).toBe(2);
  });

  it('flushes at the size threshold or after the interval', () => {
    const b = new EventBuffer();
    expect(b.shouldFlush(FLUSH_INTERVAL_MS)).toBe(false); // empty → never
    b.add(ev('a'));
    expect(b.shouldFlush(1000)).toBe(false);
    expect(b.shouldFlush(FLUSH_INTERVAL_MS)).toBe(true); // interval elapsed
    for (let i = 0; i < FLUSH_SIZE; i++) b.add(ev(`e${i}`));
    expect(b.shouldFlush(0)).toBe(true); // full
  });

  it('drain empties the buffer', () => {
    const b = new EventBuffer();
    b.add(ev('a'));
    b.add(ev('b'));
    expect(b.drain().map((e) => e.eventId)).toEqual(['a', 'b']);
    expect(b.size).toBe(0);
    b.add(ev('a')); // id reusable after drain
    expect(b.size).toBe(1);
  });

  it('requeue restores a failed batch at the front, still deduped', () => {
    const b = new EventBuffer();
    b.add(ev('new'));
    b.requeue([ev('failed'), ev('new')]); // 'new' already buffered → not duplicated
    expect(b.drain().map((e) => e.eventId)).toEqual(['failed', 'new']);
  });
});
