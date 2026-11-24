import { describe, expect, it } from 'vitest';
import {
  OPEN_CONTROLS,
  PARENTAL_BEDTIMES,
  PARENT_CODE_ALPHABET,
  formatParentCode,
  inBedtime,
  isParentalBedtime,
  isParentalDailyLimit,
  localDay,
  normalizeParentCode,
  parentalPause,
  safeTimeZone,
} from './parental.js';

const night = { from: '21:00', to: '07:00' };

describe('parentalPause', () => {
  it('leaves the app open with nothing set', () => {
    expect(parentalPause(OPEN_CONTROLS, 500, new Date('2026-11-24T12:00:00Z'), 'Europe/Amsterdam')).toEqual({ paused: null, resumesAt: null });
  });

  it('pauses once the day’s minutes are used, until the teen’s own midnight', () => {
    const at = new Date('2026-11-24T15:00:00Z'); // 16:00 in Amsterdam
    expect(parentalPause({ dailyLimitMinutes: 30, bedtime: null }, 29, at, 'Europe/Amsterdam').paused).toBeNull();
    expect(parentalPause({ dailyLimitMinutes: 30, bedtime: null }, 30, at, 'Europe/Amsterdam')).toEqual({
      paused: 'limit',
      resumesAt: '2026-11-24T23:00:00.000Z',
    });
  });

  it('pauses through the night on both sides of midnight, and says bedtime before a used-up day', () => {
    const late = new Date('2026-11-24T21:30:00Z'); // 22:30 in Amsterdam
    const early = new Date('2026-11-25T05:00:00Z'); // 06:00 in Amsterdam
    expect(parentalPause({ dailyLimitMinutes: 30, bedtime: night }, 45, late, 'Europe/Amsterdam')).toEqual({
      paused: 'bedtime',
      resumesAt: '2026-11-25T06:00:00.000Z',
    });
    expect(parentalPause({ dailyLimitMinutes: null, bedtime: night }, 0, early, 'Europe/Amsterdam').resumesAt).toBe('2026-11-25T06:00:00.000Z');
  });

  it('counts the bedtime in the teen’s zone, not the server’s', () => {
    const at = new Date('2026-11-24T19:00:00Z'); // 22:00 in Istanbul, 20:00 in Amsterdam
    expect(inBedtime(night, at, 'Europe/Istanbul')).toBe(true);
    expect(inBedtime(night, at, 'Europe/Amsterdam')).toBe(false);
  });

  it('ends a bedtime at seven on the day the clocks change', () => {
    // The clocks go back in Amsterdam on 25 October 2026: seven that morning is 06:00 UTC.
    const at = new Date('2026-10-24T22:00:00Z');
    expect(parentalPause({ dailyLimitMinutes: null, bedtime: night }, 0, at, 'Europe/Amsterdam').resumesAt).toBe('2026-10-25T06:00:00.000Z');
  });
});

describe('localDay and time zones', () => {
  it('names the teen’s calendar day', () => {
    expect(localDay(new Date('2026-11-24T23:30:00Z'), 'Europe/Amsterdam')).toBe('2026-11-25');
    expect(localDay(new Date('2026-11-24T23:30:00Z'), 'America/New_York')).toBe('2026-11-24');
  });

  it('falls back to UTC for a zone the runtime does not know', () => {
    expect(safeTimeZone('Mars/Olympus')).toBe('UTC');
    expect(safeTimeZone(null)).toBe('UTC');
    expect(safeTimeZone('Asia/Baghdad')).toBe('Asia/Baghdad');
  });
});

describe('the options', () => {
  it('accepts only the offered limits and bedtimes', () => {
    expect(isParentalDailyLimit(30)).toBe(true);
    expect(isParentalDailyLimit(31)).toBe(false);
    expect(PARENTAL_BEDTIMES.every(isParentalBedtime)).toBe(true);
    expect(isParentalBedtime({ from: '02:00', to: '03:00' })).toBe(false);
  });
});

describe('parent codes', () => {
  it('forgives case, spaces and the dash', () => {
    expect(normalizeParentCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeParentCode(' ABCD EFGH ')).toBe('ABCDEFGH');
    expect(formatParentCode('ABCDEFGH')).toBe('ABCD-EFGH');
  });

  it('refuses a wrong length and the letters left out for looking alike', () => {
    expect(normalizeParentCode('ABCDEFG')).toBeNull();
    expect(normalizeParentCode('ABCDEFG0')).toBeNull();
    expect(normalizeParentCode('ABCDEFGI')).toBeNull();
    expect(PARENT_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });
});
