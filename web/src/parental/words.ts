import type { Bedtime, BirthMonth } from '@kurda/shared';
import { MONTH_KEY } from '../auth/BirthMonthFields';
import type { Translate } from '../i18n/I18nProvider';
import { clockTime, namesDates } from './api';

/** Parental controls' numbers in words: a span of minutes, a count of lessons, a limit, a bedtime and a birth month. */

/** "45 min", "1 h", "1 h 25 min". */
export function durationText(t: Translate, minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return t('parental.min', { count: m });
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? t('parental.hours', { count: hours }) : t('parental.hoursMin', { hours, minutes: rest });
}

/** "1 lesson", "3 lessons". */
export function lessonsText(t: Translate, count: number): string {
  return count === 1 ? t('parental.lessonOne') : t('parental.lessons', { count });
}

/** A day's learning in one line: "12 min · 2 lessons". */
export function dayText(t: Translate, minutes: number, lessons: number): string {
  return `${durationText(t, minutes)} · ${lessonsText(t, lessons)}`;
}

/** A daily limit as chosen: "30 minutes", or no limit at all. */
export function limitText(t: Translate, minutes: number | null): string {
  return minutes == null ? t('parental.limit.none') : t('parental.limit.minutes', { count: minutes });
}

/** A bedtime in the reader's clock ("21:00–07:00", "9:00 PM–7:00 AM"), or none. */
export function bedtimeText(t: Translate, bedtime: Bedtime | null, locale: string): string {
  return bedtime ? `${clockTime(bedtime.from, locale)}–${clockTime(bedtime.to, locale)}` : t('parental.bedtime.none');
}

/** A calendar day ("2 September 2026"), with the app's own month names where the browser has none for the language. */
export function calendarDay(t: Translate, iso: string, locale: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso.slice(0, 10);
  if (namesDates(locale)) return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(at);
  const month = MONTH_KEY[at.getMonth()];
  return month ? `${at.getDate()} ${t(month)} ${at.getFullYear()}` : iso.slice(0, 10);
}

/** A month's name on its own ("March"), for a choice of months; the app's own where the browser has none for the language. */
export function monthName(t: Translate, month: number, locale: string): string {
  if (namesDates(locale)) return new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(Date.UTC(2000, month - 1, 15));
  const key = MONTH_KEY[month - 1];
  return key ? t(key) : String(month);
}

/** A birth month as the reader writes one ("March 2011"). */
export function monthYear(t: Translate, birth: BirthMonth, locale: string): string {
  const at = Date.UTC(birth.year, birth.month - 1, 15);
  if (namesDates(locale)) return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(at);
  return `${monthName(t, birth.month, locale)} ${birth.year}`;
}
