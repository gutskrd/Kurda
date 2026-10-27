import { describe, expect, it } from 'vitest';
import {
  countdownParts,
  formatCompact,
  formatCountdown,
  formatExpectedAt,
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
  const words = { 'time.daysHours': '{days}d {hours}h', 'time.hoursMinutes': '{hours}h {minutes}m', 'time.minutes': '{count}m' };
  const t = (key: keyof typeof words, vars: Record<string, number>) => interpolate(words[key], vars);
  it('shows the two largest units, in the words it is given', () => {
    expect(formatCountdown((2 * 24 + 3) * 3_600_000, t)).toBe('2d 3h');
    expect(formatCountdown((5 * 60 + 12) * 60_000, t)).toBe('5h 12m');
    expect(formatCountdown(3 * 60_000 + 40_000, t)).toBe('3m');
    // the last minute is a minute, not seconds counting down
    expect(formatCountdown(20_000, t)).toBe('1m');
    expect(formatCountdown(0, t)).toBe('');
  });
});

describe('remainingUntil', () => {
  it('is the ms between now and the target', () => {
    const now = Date.parse('2026-03-21T00:00:00.000Z');
    expect(remainingUntil('2026-03-21T01:00:00.000Z', now)).toBe(3_600_000);
    expect(remainingUntil('not-a-date', now)).toBe(0);
  });
});

describe('formatCompact', () => {
  it('leaves values under 1000 as plain numbers', () => {
    expect(formatCompact(500, 'en')).toBe('500');
    expect(formatCompact(0, 'en')).toBe('0');
  });

  it('compacts thousands and millions', () => {
    expect(formatCompact(1234, 'en')).toBe('1.2K');
    expect(formatCompact(12000, 'en')).toBe('12K');
    expect(formatCompact(1_500_000, 'en')).toBe('1.5M');
  });

  it('handles negatives', () => {
    expect(formatCompact(-2500, 'en')).toBe('-2.5K');
  });
});

describe('formatExpectedAt', () => {
  // a Monday morning in Berlin; the times are asked for in that zone, as a phone there would
  const now = new Date('2026-10-26T08:00:00.000Z');
  const zone = 'Europe/Berlin';
  // newer ICU puts a narrow no-break space before AM/PM; the words are what is checked here
  const said = (iso: string, locale: 'en' | 'de', timeZone = zone): string => formatExpectedAt(iso, locale, now, timeZone).replace(/\s/g, ' ');

  it('is the time alone when it is today', () => {
    expect(said('2026-10-26T13:30:00.000Z', 'en')).toBe('2:30 PM');
    expect(said('2026-10-26T13:30:00.000Z', 'de')).toBe('14:30');
  });

  it('names the weekday within the coming week, in the reader’s language', () => {
    expect(said('2026-10-28T13:30:00.000Z', 'en')).toMatch(/^Wednesday,? 2:30 PM$/);
    expect(said('2026-10-28T13:30:00.000Z', 'de')).toMatch(/^Mittwoch.*14:30$/);
  });

  it('goes by the reader’s own day, not the server’s', () => {
    // 23:30 in Berlin is still Monday there, and already Tuesday in Baghdad
    expect(said('2026-10-26T22:30:00.000Z', 'en')).toBe('11:30 PM');
    expect(said('2026-10-26T22:30:00.000Z', 'en', 'Asia/Baghdad')).toMatch(/^Tuesday,? 1:30 AM$/);
  });

  it('adds the date when a weekday alone would name the wrong one', () => {
    expect(said('2026-11-04T13:30:00.000Z', 'en')).toMatch(/Nov.*4.*2:30 PM/);
  });

  it('hands back what it could not read', () => {
    expect(formatExpectedAt('not-a-date', 'en', now)).toBe('not-a-date');
  });
});
