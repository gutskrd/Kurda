import { describe, it, expect } from 'vitest';
import { badgeLabel, elapsed, lastSeen } from './time';

const NOW = new Date('2026-09-06T12:00:00.000Z').getTime();
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('elapsed', () => {
  it('counts a game up in the units that fit a narrow column', () => {
    expect(elapsed(ago(20_000), NOW)).toBe('just now');
    expect(elapsed(ago(7 * MIN), NOW)).toBe('7m');
    expect(elapsed(ago(HOUR), NOW)).toBe('1h');
    expect(elapsed(ago(HOUR + 4 * MIN), NOW)).toBe('1h 4m');
  });

  it('never counts backwards when a clock is a little ahead', () => {
    // the server's now and the browser's now are not the same clock
    expect(elapsed(new Date(NOW + 5_000).toISOString(), NOW)).toBe('just now');
  });

  it('says nothing rather than NaN for a broken timestamp', () => {
    expect(elapsed('not a date', NOW)).toBe('');
  });
});

describe('lastSeen', () => {
  it('gets vaguer as it gets older, which is how people think about it', () => {
    expect(lastSeen(ago(30_000), NOW)).toBe('just now');
    expect(lastSeen(ago(5 * MIN), NOW)).toBe('5m ago');
    expect(lastSeen(ago(3 * HOUR), NOW)).toBe('3h ago');
    expect(lastSeen(ago(2 * 24 * HOUR), NOW)).toBe('2d ago');
    // past a month the exact number stops meaning anything
    expect(lastSeen(ago(90 * 24 * HOUR), NOW)).toBe('a while ago');
  });

  it('handles someone who has never been seen', () => {
    expect(lastSeen(null, NOW)).toBe('a while ago');
  });
});

describe('badgeLabel', () => {
  it('caps so a badge cannot stretch the button it sits on', () => {
    expect(badgeLabel(3)).toBe('3');
    expect(badgeLabel(99)).toBe('99');
    expect(badgeLabel(100)).toBe('99+');
  });
});
