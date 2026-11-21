/**
 * Pure locale-aware formatting, with no React Native. Numbers and dates go through Intl (Hermes ships it), so
 * separators and date order follow the user's language. Event windows are stored in UTC and shown in the device's
 * time zone.
 */
import { compactCount } from '@kurda/shared';
import { RTL_LOCALES, type Locale } from './translations.js';

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

/** Interpolate `{name}` placeholders from a vars map. */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

export function formatNumber(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

/** Large counts shortened for tight spots (5230 → "5.2K", 1_240_000 → "1.2M"), as the website writes them. */
export function formatCompact(value: number, locale: Locale): string {
  return compactCount(value, locale);
}

/**
 * A day named in full in the reader's language ("Thursday, 12 November"), in the device's time zone or an
 * explicit one, for saying which day something lasts through without a clock time or countdown.
 */
export function formatDay(date: Date, locale: Locale, timeZone?: string): string {
  const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', ...(timeZone ? { timeZone } : {}) };
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    // A locale the device has no data for falls back to its own.
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

/**
 * When something is expected, in the reader's language and time zone (or an explicit one): the time alone today,
 * the weekday and time within the coming week, and the date as well beyond that, where a weekday alone would be
 * ambiguous.
 */
export function formatExpectedAt(iso: string, locale: Locale, now: Date = new Date(), timeZone?: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const zone = timeZone ? { timeZone } : {};
  const dayOf = (d: Date): string => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...zone }).format(d);
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const options: Intl.DateTimeFormatOptions =
    dayOf(at) === dayOf(now)
      ? time
      : at.getTime() - now.getTime() < 6 * 86_400_000
        ? { weekday: 'long', ...time }
        : { weekday: 'short', day: 'numeric', month: 'short', ...time };
  try {
    return new Intl.DateTimeFormat(locale, { ...options, ...zone }).format(at);
  } catch {
    // A locale the device has no data for falls back to its own.
    return new Intl.DateTimeFormat(undefined, { ...options, ...zone }).format(at);
  }
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

/** Break a millisecond remainder into d/h/m/s; clamps at zero (`done`). */
export function countdownParts(remainingMs: number): CountdownParts {
  const clamped = Math.max(0, remainingMs);
  const totalSeconds = Math.floor(clamped / 1000);
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    done: clamped === 0,
  };
}

/**
 * A compact countdown to a deadline in the reader's words: the two largest relevant units ("2d 3h", "5h 12m"),
 * down to whole minutes, ending at "1m" rather than ticking seconds. Empty once the deadline has passed.
 */
export function formatCountdown(
  remainingMs: number,
  t: (key: 'time.daysHours' | 'time.hoursMinutes' | 'time.minutes', vars: Record<string, number>) => string,
): string {
  const { days, hours, minutes, done } = countdownParts(remainingMs);
  if (done) return '';
  if (days > 0) return t('time.daysHours', { days, hours });
  if (hours > 0) return t('time.hoursMinutes', { hours, minutes });
  return t('time.minutes', { count: Math.max(1, minutes) });
}

/** Milliseconds from `now` (default: the real clock) until an ISO instant. */
export function remainingUntil(iso: string, now: number = Date.now()): number {
  const target = Date.parse(iso);
  return Number.isNaN(target) ? 0 : target - now;
}
