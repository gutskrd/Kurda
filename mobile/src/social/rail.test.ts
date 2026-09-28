import { describe, expect, it } from 'vitest';
import { bucket, waitingCount, type RailFriend } from './rail';
import { elapsed, lastSeen } from './time';
import { LOCALES, TRANSLATIONS } from '../i18n/translations';

const friend = (over: Partial<RailFriend> & { userId: string }): RailFriend => ({
  username: over.userId,
  online: false,
  lastSeenAt: null,
  activity: null,
  ...over,
});

const at = (iso: string) => new Date(iso).getTime();
const NOW = at('2026-09-28T12:00:00Z');

describe('bucket', () => {
  it('splits by what each friend is doing', () => {
    const b = bucket([
      friend({ userId: 'playing', online: true, activity: { kind: 'wordle', since: '2026-09-28T11:50:00Z' } }),
      friend({ userId: 'online', online: true }),
      friend({ userId: 'away' }),
    ]);
    expect(b.playing.map((f) => f.userId)).toEqual(['playing']);
    expect(b.online.map((f) => f.userId)).toEqual(['online']);
    expect(b.offline.map((f) => f.userId)).toEqual(['away']);
  });

  /* in a game counts as in a game, whatever the presence flag says */
  it('puts a friend in a game with the players even if they read as offline', () => {
    const b = bucket([friend({ userId: 'x', online: false, activity: { kind: 'race', since: '2026-09-28T11:00:00Z' } })]);
    expect(b.playing.map((f) => f.userId)).toEqual(['x']);
    expect(b.offline).toEqual([]);
  });

  /**
   * The longest-running game first: a match twelve minutes old is closer to
   * being over — and to somebody free to talk — than one that started thirty
   * seconds ago.
   */
  it('orders players by how long they have been in', () => {
    const b = bucket([
      friend({ userId: 'new', activity: { kind: 'q', since: '2026-09-28T11:59:30Z' } }),
      friend({ userId: 'old', activity: { kind: 'q', since: '2026-09-28T11:48:00Z' } }),
      friend({ userId: 'mid', activity: { kind: 'q', since: '2026-09-28T11:55:00Z' } }),
    ]);
    expect(b.playing.map((f) => f.userId)).toEqual(['old', 'mid', 'new']);
  });

  it('orders the offline by who was around most recently', () => {
    const b = bucket([
      friend({ userId: 'ages', lastSeenAt: '2026-09-01T00:00:00Z' }),
      friend({ userId: 'never', lastSeenAt: null }),
      friend({ userId: 'recent', lastSeenAt: '2026-09-28T11:00:00Z' }),
    ]);
    expect(b.offline.map((f) => f.userId)).toEqual(['recent', 'ages', 'never']);
  });

  it('holds up with nobody at all', () => {
    expect(bucket([])).toEqual({ playing: [], online: [], offline: [] });
  });
});

describe('waitingCount', () => {
  /*
   * Unread group messages are deliberately not in it. A badge that counted every
   * message is a number you learn to ignore; these are the two that go stale.
   */
  it('counts what expires, not what accumulates', () => {
    expect(waitingCount({ unread: { requests: 2, challenges: 1, notifications: 40, groups: 99 } })).toBe(3);
    expect(waitingCount({ unread: { requests: 0, challenges: 0, notifications: 12, groups: 7 } })).toBe(0);
  });
});

/** A translator that interpolates for real, so a dropped placeholder shows up. */
const translator = (loc: (typeof LOCALES)[number]) =>
  ((key, vars) =>
    TRANSLATIONS[loc][key].replace(/\{(\w+)\}/g, (whole, name: string) =>
      vars && name in vars ? String(vars[name]) : whole,
    )) as Parameters<typeof elapsed>[1];

describe('elapsed', () => {
  const t = translator('en');

  it('counts up in the units that fit a narrow column', () => {
    expect(elapsed('2026-09-28T11:59:30Z', t, NOW)).toBe('just now');
    expect(elapsed('2026-09-28T11:53:00Z', t, NOW)).toBe('7m');
    expect(elapsed('2026-09-28T11:00:00Z', t, NOW)).toBe('1h');
    expect(elapsed('2026-09-28T10:56:00Z', t, NOW)).toBe('1h 4m');
  });

  it('says nothing about a timestamp it cannot read', () => {
    expect(elapsed('not a date', t, NOW)).toBe('');
  });

  /* a clock that is a little ahead must not produce a negative duration */
  it('never counts backwards', () => {
    expect(elapsed('2026-09-28T12:00:30Z', t, NOW)).toBe('just now');
  });
});

describe('lastSeen', () => {
  const t = translator('en');

  it('says how long ago, in the largest unit that still means something', () => {
    expect(lastSeen('2026-09-28T11:55:00Z', t, NOW)).toBe('5m ago');
    expect(lastSeen('2026-09-28T09:00:00Z', t, NOW)).toBe('3h ago');
    expect(lastSeen('2026-09-26T12:00:00Z', t, NOW)).toBe('2d ago');
  });

  /* past a month the exact number stops meaning anything on a friends list */
  it('stops counting the days after a month', () => {
    expect(lastSeen('2026-07-01T12:00:00Z', t, NOW)).toBe('a while ago');
  });

  it('handles never-seen and unreadable alike', () => {
    expect(lastSeen(null, t, NOW)).toBe('a while ago');
    expect(lastSeen('nonsense', t, NOW)).toBe('a while ago');
  });

  /*
   * Every shape in every language. These are abbreviations — `m` in English,
   * `d` for deqe in Kurmancî, `dk` in Turkish — so a dropped `{count}` is easy
   * to miss and reads as a unit with no number in front of it.
   */
  it('leaves no placeholder unfilled, in any language', () => {
    for (const loc of LOCALES) {
      const tr = translator(loc);
      for (const out of [
        elapsed('2026-09-28T11:53:00Z', tr, NOW),
        elapsed('2026-09-28T10:56:00Z', tr, NOW),
        lastSeen('2026-09-28T11:55:00Z', tr, NOW),
        lastSeen('2026-09-26T12:00:00Z', tr, NOW),
      ]) {
        expect(out, loc).not.toMatch(/[{}]/);
        expect(out.length, loc).toBeGreaterThan(0);
      }
    }
  });
});
