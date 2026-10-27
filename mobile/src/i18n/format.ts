/**
 * Pure locale-aware formatting (KUR-093) — no React Native. Numbers and dates
 * go through Intl (Hermes ships it), so grouping separators and date order
 * follow the user's language. Event windows are stored UTC and rendered in the
 * device's local timezone here, with a live countdown for the diaspora.
 */
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

/**
 * Compact large numbers for tight spots (leaderboards, counters): 1234 → "1.2K",
 * 1_500_000 → "1.5M". Values under 1000 render normally. Falls back to the plain
 * number if the runtime lacks compact Intl support.
 */
export function formatCompact(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  } catch {
    return formatNumber(value, locale);
  }
}

/** Localized date+time in the device's local timezone (or an explicit tz). */
export function formatDateTime(iso: string, locale: Locale, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

/**
 * When something is expected, in the reader's own language and time zone (or
 * an explicit one): the time alone when it is today, the weekday and the time
 * within the coming week, and the date as well when it is further off than
 * that, where a weekday alone would name the wrong one.
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
    // a locale the device has no data for falls back to its own
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
 * Compact countdown for a deadline, in the reader's words: the two largest
 * units that matter — "2d 3h", "5h 12m" — down to whole minutes, with the last
 * one shown as "1m" rather than seconds ticking away. Empty once the deadline
 * has passed.
 *
 * It was English abbreviations in every language, and counted seconds, which
 * says hurry more than when.
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

/** Milliseconds until an ISO instant from `now` (default: real clock). */
export function remainingUntil(iso: string, now: number = Date.now()): number {
  const target = Date.parse(iso);
  return Number.isNaN(target) ? 0 : target - now;
}
