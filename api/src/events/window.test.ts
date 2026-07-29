import { describe, expect, it } from 'vitest';
import {
  activeEvents,
  cacheTtlSeconds,
  isActive,
  MAX_CONCURRENT_RENDER,
  nextBoundary,
  type EventDef,
} from './window.js';

function ev(over: Partial<EventDef>): EventDef {
  return {
    id: over.key ?? 'id',
    key: 'k',
    name: 'Event',
    type: 'holiday',
    startsAt: '2026-03-21T00:00:00.000Z',
    endsAt: '2026-03-22T00:00:00.000Z',
    priority: 0,
    theme: null,
    quests: [],
    rewards: {},
    enabled: true,
    ...over,
  };
}

const T = (iso: string) => Date.parse(iso);

describe('isActive', () => {
  it('is live at the start instant and dead the moment it ends', () => {
    const e = ev({});
    expect(isActive(e, T('2026-03-21T00:00:00.000Z'))).toBe(true);
    expect(isActive(e, T('2026-03-21T12:00:00.000Z'))).toBe(true);
    expect(isActive(e, T('2026-03-20T23:59:59.000Z'))).toBe(false);
    expect(isActive(e, T('2026-03-22T00:00:00.000Z'))).toBe(false);
  });

  it('a disabled event is never active even inside its window', () => {
    expect(isActive(ev({ enabled: false }), T('2026-03-21T12:00:00.000Z'))).toBe(false);
  });
});

describe('activeEvents', () => {
  it('returns only live events, highest priority first', () => {
    const now = T('2026-03-21T12:00:00.000Z');
    const low = ev({ key: 'a', priority: 1 });
    const high = ev({ key: 'b', priority: 5 });
    const past = ev({ key: 'c', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2026-01-02T00:00:00.000Z' });
    expect(activeEvents([low, high, past], now).map((e) => e.key)).toEqual(['b', 'a']);
  });

  it('breaks priority ties by earlier start then key', () => {
    const now = T('2026-03-21T12:00:00.000Z');
    const later = ev({ key: 'z', startsAt: '2026-03-21T06:00:00.000Z' });
    const earlier = ev({ key: 'a', startsAt: '2026-03-21T00:00:00.000Z' });
    expect(activeEvents([later, earlier], now).map((e) => e.key)).toEqual(['a', 'z']);
  });

  it('supports overlapping events (client caps concurrency)', () => {
    const now = T('2026-03-21T12:00:00.000Z');
    const events = [ev({ key: 'a', priority: 3 }), ev({ key: 'b', priority: 2 }), ev({ key: 'c', priority: 1 })];
    const live = activeEvents(events, now);
    expect(live).toHaveLength(3);
    expect(live.slice(0, MAX_CONCURRENT_RENDER).map((e) => e.key)).toEqual(['a', 'b']);
  });
});

describe('nextBoundary', () => {
  it('picks the soonest future start or end', () => {
    const now = T('2026-03-21T12:00:00.000Z');
    // active event ends at 03-22; a future one starts 03-25
    const active = ev({ key: 'a' });
    const future = ev({ key: 'b', startsAt: '2026-03-25T00:00:00.000Z', endsAt: '2026-03-26T00:00:00.000Z' });
    expect(nextBoundary([active, future], now)).toBe(T('2026-03-22T00:00:00.000Z'));
  });

  it('ignores disabled events and returns null when nothing is upcoming', () => {
    const now = T('2026-04-01T00:00:00.000Z');
    const past = ev({ key: 'a' });
    const disabledFuture = ev({ key: 'b', enabled: false, startsAt: '2026-05-01T00:00:00.000Z', endsAt: '2026-05-02T00:00:00.000Z' });
    expect(nextBoundary([past, disabledFuture], now)).toBeNull();
  });
});

describe('cacheTtlSeconds', () => {
  it('is the seconds until the next boundary', () => {
    const now = T('2026-03-21T23:59:30.000Z'); // 30s before the 03-22 end
    expect(cacheTtlSeconds([ev({})], now)).toBe(30);
  });

  it('clamps a far-off boundary to the cap and a passed one to the cap', () => {
    const now = T('2026-03-21T00:00:00.000Z');
    const farStart = ev({ key: 'f', startsAt: '2027-01-01T00:00:00.000Z', endsAt: '2027-01-02T00:00:00.000Z' });
    expect(cacheTtlSeconds([farStart], now, 3600)).toBe(3600);
    expect(cacheTtlSeconds([], now, 3600)).toBe(3600);
  });
});
