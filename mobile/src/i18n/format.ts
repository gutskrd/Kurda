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
 * Compact countdown for a deadline: the two most significant non-zero units,
 * e.g. "2d 3h", "5h 12m", "3m". Empty string once the deadline has passed.
 */
export function formatCountdown(remainingMs: number): string {
  const { days, hours, minutes, seconds, done } = countdownParts(remainingMs);
  if (done) return '';
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Milliseconds until an ISO instant from `now` (default: real clock). */
export function remainingUntil(iso: string, now: number = Date.now()): number {
  const target = Date.parse(iso);
  return Number.isNaN(target) ? 0 : target - now;
}
