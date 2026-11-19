/**
 * The week a kept streak is shown in: seven days from the learner's week start, each learned, frozen, today, missed or
 * ahead. The server says which days were learned or frozen (`recent`) and what today is in the learner's timezone; this
 * lays them out alike on both apps.
 */
import { wordIn, wordSet } from './word-sets/words.js';

export type WeekDayState = 'learned' | 'frozen' | 'today' | 'missed' | 'ahead';

export interface WeekDay {
  /** YYYY-MM-DD */
  date: string;
  /** 0 Sunday to 6 Saturday, for its name in the reader's language */
  weekday: number;
  state: WeekDayState;
  /** the learner's today, whatever its state (learned once today's lesson is done) */
  isToday: boolean;
}

/** A day the server says was learned on, or kept by a freeze. */
export interface RecentDay {
  date: string;
  kind: 'learned' | 'frozen';
}

/** The day a week starts on in the reader's language: Saturday where wall calendars start there (Kurdish, Arabic, Persian), Monday elsewhere. */
export function weekStartsOn(language: string): number {
  const lang = language.toLowerCase().split(/[-_]/)[0];
  return lang === 'ku' || lang === 'ckb' || lang === 'kmr' || lang === 'ar' || lang === 'fa' ? 6 : 1;
}

const DAY_MS = 86_400_000;

function toDay(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

function fromDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The first day of the week `today` ('YYYY-MM-DD') falls in, for a week starting on `startsOn` (0 Sunday to 6 Saturday). */
export function firstDayOfWeek(today: string, startsOn: number): string {
  const now = toDay(today);
  return fromDay(now - ((new Date(now).getUTCDay() - startsOn + 7) % 7) * DAY_MS);
}

/** The calendar date `days` after `date` (negative for before). */
export function addDays(date: string, days: number): string {
  return fromDay(toDay(date) + days * DAY_MS);
}

/** The seven days of the week `today` falls in, from `startsOn` (0 Sunday to 6 Saturday); a day both learned and frozen counts as learned. */
export function streakWeek({ today, recent, startsOn }: { today: string; recent: readonly RecentDay[]; startsOn: number }): WeekDay[] {
  const now = toDay(today);
  const first = toDay(firstDayOfWeek(today, startsOn));
  const kinds = new Map<string, RecentDay['kind']>();
  for (const day of recent) if (kinds.get(day.date) !== 'learned') kinds.set(day.date, day.kind);
  return Array.from({ length: 7 }, (_, i) => {
    const ms = first + i * DAY_MS;
    const date = fromDay(ms);
    const kind = kinds.get(date);
    const state: WeekDayState =
      ms > now ? 'ahead' : kind === 'learned' ? 'learned' : ms === now ? 'today' : kind === 'frozen' ? 'frozen' : 'missed';
    return { date, weekday: new Date(ms).getUTCDay(), state, isToday: ms === now };
  });
}

/**
 * A weekday's name in the reader's language (0 Sunday to 6 Saturday), whole or as the one letter a week row heads its
 * column with. Kurdish uses the course's own day names, which browsers and phones may not have.
 */
export function weekdayName(weekday: number, locale: string, width: 'long' | 'narrow' = 'long'): string {
  const dialect = locale === 'ku' ? 'kmr' : locale === 'ckb' ? 'ckb' : null;
  if (dialect) {
    // The course's set starts on Saturday.
    const name = wordIn(wordSet('days')[(weekday + 1) % 7]!, dialect);
    return width === 'long' ? name : ([...name][0] ?? '');
  }
  // 4 January 1970 was a Sunday.
  return new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' }).format(new Date(Date.UTC(1970, 0, 4 + weekday)));
}
