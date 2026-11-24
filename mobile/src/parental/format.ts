/**
 * Parental controls in words: limits, bedtimes, minutes and a week of use, each in the reader's language and clock,
 * and a code as it is typed. Pure, so the phrasing is testable without a screen.
 */
import { PARENT_CODE_LENGTH, type Bedtime } from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { Locale } from '../i18n/translations';
import type { TeenDay } from './api';

/** A wall-clock 'HH:MM' as the reader's language writes a time ("21:00", "9:00 PM"). */
export function formatClock(time: string, locale: Locale): string {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const at = new Date(Date.UTC(2000, 0, 1, h, m));
  const options: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' };
  try {
    return new Intl.DateTimeFormat(locale, options).format(at);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(at);
  }
}

export function bedtimeLabel(bedtime: Bedtime | null, t: Translate, locale: Locale): string {
  if (!bedtime) return t('parental.bedtime.none');
  return t('parental.bedtime.range', { from: formatClock(bedtime.from, locale), to: formatClock(bedtime.to, locale) });
}

/** A date as a day of the year ("14 September 2026"), for since when two accounts have been connected. */
export function formatDate(iso: string, locale: Locale): string {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale, options).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(new Date(iso));
  }
}

/** "30 minutes", or "1 minute". */
export function minutesLabel(count: number, t: Translate): string {
  return count === 1 ? t('parental.minuteOne') : t('parental.minutes', { count });
}

export function limitLabel(minutes: number | null, t: Translate): string {
  return minutes == null ? t('parental.limit.none') : minutesLabel(minutes, t);
}

/** A length of time for a summary: "45 min", "2 h", "1 h 25 min". */
export function durationLabel(minutes: number, t: Translate): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return t('parental.duration.minutes', { minutes: rest });
  if (rest === 0) return t('parental.duration.hours', { hours });
  return t('parental.duration.hoursMinutes', { hours, minutes: rest });
}

export function lessonsLabel(count: number, t: Translate): string {
  return count === 1 ? t('parental.lessonOne') : t('parental.lessons', { count });
}

/** A week in one line, without a table: "1 h 25 min · 9 lessons · 240 XP". */
export function weekSummary(week: readonly TeenDay[], t: Translate): string {
  const minutes = week.reduce((sum, d) => sum + d.minutes, 0);
  const lessons = week.reduce((sum, d) => sum + d.lessons, 0);
  const xp = week.reduce((sum, d) => sum + d.xp, 0);
  return t('parental.week.summary', { time: durationLabel(minutes, t), lessons: lessonsLabel(lessons, t), xp });
}

/** A 'YYYY-MM-DD' day's weekday: narrow ("M") under a bar, long ("Monday") for a screen reader. */
export function weekdayOf(day: string, locale: Locale, width: 'narrow' | 'short' | 'long'): string {
  const [y = 2000, m = 1, d = 1] = day.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  const options: Intl.DateTimeFormatOptions = { weekday: width, timeZone: 'UTC' };
  try {
    return new Intl.DateTimeFormat(locale, options).format(at);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(at);
  }
}

/**
 * What is kept of a code as it is typed or pasted: letters and digits only, in capitals, at most a code long. The
 * dash is the field's to draw, so pasting "abcd-efgh" or "ABCD EFGH" gives the same eight.
 */
export function typedParentCode(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, PARENT_CODE_LENGTH);
}

/** A code part-typed, as the field shows it: the dash appears with the fifth character, so deleting past it feels natural. */
export function shownParentCode(typed: string): string {
  const half = PARENT_CODE_LENGTH / 2;
  return typed.length > half ? `${typed.slice(0, half)}-${typed.slice(half)}` : typed;
}
