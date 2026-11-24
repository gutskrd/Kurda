import type { Bedtime } from '@kurda/shared';
import { MONTH_KEY } from '../auth/BirthMonthFields';
import type { Translate } from '../i18n/I18nProvider';
import { clockTime, namesDates } from './api';

/** Parental controls' numbers in words: a span of minutes, a count of lessons, a limit and a bedtime. */

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
