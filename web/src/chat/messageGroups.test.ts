import { describe, it, expect } from 'vitest';
import { dayLabel, groupMessages, timeLabel, endsAMoment, isEmojiOnly } from './messageGroups';

/** Build a message at a local time on a given day. */
const msg = (id: string, senderId: string, iso: string) => ({ id, senderId, createdAt: iso });

/** Local-time ISO for a date, so tests do not depend on the runner's zone. */
function at(y: number, m: number, d: number, hh: number, mm: number): string {
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

describe('groupMessages', () => {
  it('keeps a burst from one sender in a single run', () => {
    const sections = groupMessages(
      [
        msg('1', 'a', at(2026, 9, 4, 10, 0)),
        msg('2', 'a', at(2026, 9, 4, 10, 1)),
        msg('3', 'a', at(2026, 9, 4, 10, 3)),
      ],
      new Date(2026, 8, 4, 12, 0),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.runs).toHaveLength(1);
    expect(sections[0]!.runs[0]!.messages.map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('starts a new run when the sender changes', () => {
    const sections = groupMessages(
      [
        msg('1', 'a', at(2026, 9, 4, 10, 0)),
        msg('2', 'b', at(2026, 9, 4, 10, 1)),
        msg('3', 'a', at(2026, 9, 4, 10, 2)),
      ],
      new Date(2026, 8, 4, 12, 0),
    );
    expect(sections[0]!.runs.map((r) => r.senderId)).toEqual(['a', 'b', 'a']);
  });

  it('starts a new run after a long gap from the same sender', () => {
    // a reply an hour later is a separate moment, not part of the earlier burst
    const sections = groupMessages(
      [msg('1', 'a', at(2026, 9, 4, 10, 0)), msg('2', 'a', at(2026, 9, 4, 11, 0))],
      new Date(2026, 8, 4, 12, 0),
    );
    expect(sections[0]!.runs).toHaveLength(2);
  });

  it('splits at midnight even for an unbroken burst', () => {
    // one minute apart, but on different days — the separator has to come between
    const sections = groupMessages(
      [msg('1', 'a', at(2026, 9, 3, 23, 59)), msg('2', 'a', at(2026, 9, 4, 0, 0))],
      new Date(2026, 8, 4, 12, 0),
    );
    expect(sections).toHaveLength(2);
    expect(sections[0]!.label).toBe('Yesterday');
    expect(sections[1]!.label).toBe('Today');
  });

  it('groups by local day, not UTC', () => {
    // built from local components, so this is 01:00 wherever the test runs —
    // it must file under that local day, not the previous UTC one
    const sections = groupMessages([msg('1', 'a', at(2026, 9, 4, 1, 0))], new Date(2026, 8, 4, 12, 0));
    expect(sections[0]!.label).toBe('Today');
  });

  it('never merges a message whose timestamp will not parse', () => {
    const sections = groupMessages(
      [msg('1', 'a', at(2026, 9, 4, 10, 0)), msg('2', 'a', 'not-a-date'), msg('3', 'a', at(2026, 9, 4, 10, 1))],
      new Date(2026, 8, 4, 12, 0),
    );
    // it gets its own section rather than being filed under the wrong day
    expect(sections.map((s) => s.day)).toEqual(['2026-09-04', 'unknown', '2026-09-04']);
  });

  it('returns nothing for an empty thread', () => {
    expect(groupMessages([])).toEqual([]);
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 8, 4, 12, 0); // Fri 4 Sep 2026

  it('names today and yesterday', () => {
    expect(dayLabel(new Date(2026, 8, 4, 9, 0), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 8, 3, 9, 0), now)).toBe('Yesterday');
  });

  it('uses the weekday inside the past week', () => {
    // Tue 1 Sep 2026 — three days back
    expect(dayLabel(new Date(2026, 8, 1, 9, 0), now)).toBe(
      new Date(2026, 8, 1).toLocaleDateString(undefined, { weekday: 'long' }),
    );
  });

  it('falls back to a date once a weekday stops being useful', () => {
    const label = dayLabel(new Date(2026, 7, 20, 9, 0), now);
    expect(label).not.toMatch(/day$/);
    expect(label).toContain('20');
  });

  it('includes the year only when it differs', () => {
    expect(dayLabel(new Date(2025, 4, 2, 9, 0), now)).toContain('2025');
    expect(dayLabel(new Date(2026, 4, 2, 9, 0), now)).not.toContain('2026');
  });
});

describe('timeLabel', () => {
  it('formats a clock time', () => {
    expect(timeLabel(at(2026, 9, 4, 14, 5))).toMatch(/\d/);
  });

  it('is blank rather than "Invalid Date" for a bad timestamp', () => {
    expect(timeLabel('nonsense')).toBe('');
  });
});

describe('endsAMoment', () => {
  const iso = (h: number, m: number): string => {
    const d = new Date(2026, 4, 20, h, m, 0, 0);
    return d.toISOString();
  };
  const run = (senderId: string, ...times: string[]) => ({ senderId, messages: times.map((createdAt, i) => ({ id: `${senderId}-${createdAt}-${i}`, senderId, createdAt })) });

  it('is the last run of a day, and the last before a pause of ten minutes', () => {
    const runs = [run('a', iso(10, 0)), run('b', iso(10, 1), iso(10, 3)), run('a', iso(10, 12)), run('b', iso(10, 22))];
    // 10:00 → 10:01 no pause; 10:03 → 10:12 nine minutes, still the same moment; 10:12 → 10:22 ten, a pause; and the last
    expect(runs.map((_, i) => endsAMoment(runs, i))).toEqual([false, false, true, true]);
  });

  it('gives a run its time when a timestamp will not parse, rather than guess', () => {
    const runs = [run('a', 'not a date'), run('b', iso(10, 1))];
    expect(endsAMoment(runs, 0)).toBe(true);
  });
});

describe('isEmojiOnly', () => {
  it('is one to three emoji and nothing else', () => {
    for (const body of ['❤️', '😄', '👋🏽', '🙋 😄', '🇳🇱', '👨‍👩‍👧', '👍👍👍']) expect(isEmojiOnly(body), body).toBe(true);
  });

  it('is not words, not words with an emoji, not four emoji, not nothing', () => {
    for (const body of ['spas', 'spas ❤️', '😄😄😄😄', '', '   ', '123', ':)']) expect(isEmojiOnly(body), body).toBe(false);
    expect(isEmojiOnly(null)).toBe(false);
    expect(isEmojiOnly(undefined)).toBe(false);
  });
});
