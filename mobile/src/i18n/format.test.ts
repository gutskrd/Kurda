import { describe, expect, it } from 'vitest';
import {
  countdownParts,
  formatCountdown,
  interpolate,
  isRTL,
  remainingUntil,
} from './format.js';

describe('isRTL', () => {
  it('is true for the Arabic-script locales (Arabic + Soranî)', () => {
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('ckb')).toBe(true); // Soranî — Arabic script
    expect(isRTL('ku')).toBe(false); // Kurmancî — Latin script
    expect(isRTL('en')).toBe(false);
    expect(isRTL('fr')).toBe(false);
  });
});

describe('interpolate', () => {
  it('replaces named placeholders and leaves unknowns intact', () => {
    expect(interpolate('Ends in {time}', { time: '2d 3h' })).toBe('Ends in 2d 3h');
    expect(interpolate('Hi {name}', {})).toBe('Hi {name}');
    expect(interpolate('no vars')).toBe('no vars');
  });
});

describe('countdownParts', () => {
  it('breaks ms into d/h/m/s', () => {
    const ms = ((2 * 24 + 3) * 60 + 4) * 60_000 + 5_000; // 2d 3h 4m 5s
    expect(countdownParts(ms)).toMatchObject({ days: 2, hours: 3, minutes: 4, seconds: 5, done: false });
  });

  it('clamps negatives to zero and flags done', () => {
    expect(countdownParts(-1000)).toMatchObject({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });
});

describe('formatCountdown', () => {
  it('shows the two most significant units', () => {
    expect(formatCountdown((2 * 24 + 3) * 3_600_000)).toBe('2d 3h');
    expect(formatCountdown((5 * 60 + 12) * 60_000)).toBe('5h 12m');
    expect(formatCountdown(3 * 60_000 + 40_000)).toBe('3m 40s');
    expect(formatCountdown(0)).toBe('');
  });
});

describe('remainingUntil', () => {
  it('is the ms between now and the target', () => {
    const now = Date.parse('2026-03-21T00:00:00.000Z');
    expect(remainingUntil('2026-03-21T01:00:00.000Z', now)).toBe(3_600_000);
    expect(remainingUntil('not-a-date', now)).toBe(0);
  });
});
