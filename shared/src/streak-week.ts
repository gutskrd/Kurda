/**
 * The week a kept streak is shown in: seven days, from the day the learner's
 * week starts on to the last, each marked by what happened on it — learned, kept
 * by a freeze, today, missed, or still ahead. The server says which days were
 * learned or frozen (`recent`) and what today is in the learner's own timezone;
 * this lays them out, the same on the phone and the website.
 */

export type WeekDayState = 'learned' | 'frozen' | 'today' | 'missed' | 'ahead';

export interface WeekDay {
  /** YYYY-MM-DD */
  date: string;
  /** 0 = Sunday … 6 = Saturday, for its name in the reader's language */
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

/**
 * The day a week starts on in the reader's language: Saturday where the
 * calendar on the wall starts there (Kurdish, Arabic, Persian), Monday
 * elsewhere — as the days of the week are taught.
 */
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

/**
 * The seven days of the week `today` falls in, starting on `startsOn`
 * (0 = Sunday … 6 = Saturday). A day both learned and frozen counts as learned.
 */
export function streakWeek({ today, recent, startsOn }: { today: string; recent: readonly RecentDay[]; startsOn: number }): WeekDay[] {
  const now = toDay(today);
  const intoWeek = (new Date(now).getUTCDay() - startsOn + 7) % 7;
  const first = now - intoWeek * DAY_MS;
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
