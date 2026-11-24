import type { Bedtime, ParentalControls, SupervisionState } from '@kurda/shared';

/**
 * The parental-controls API as the website reads it (`/me/parental`, `/me/usage`), and the small sums both sides of a
 * link show: minutes as hours, a week's totals, a bedtime in the reader's clock.
 */

/** Someone on the other end of a link: enough to show a face and a name, nothing more. */
export interface PersonRef {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

/** A parent as their teen sees them, with the day they connected; the first parent alone may loosen a control. */
export interface ParentLink extends PersonRef {
  since: string;
  first?: boolean;
}

/** A teen on their parent's list, with today's learning so far. */
export interface TeenSummary {
  teen: PersonRef;
  since: string;
  today: { minutes: number; lessons: number };
}

/** Why an account has neither side of parental controls: a visitor, an age not on record, an unconfirmed address, or a limited account. */
export type ParentalNoneReason = 'guest' | 'birth_month' | 'email' | 'standing';

/** `GET /me/parental`: which side of parental controls this account is on, and what that side sees. */
export interface ParentalOverview {
  role: 'teen' | 'parent' | 'none';
  reason?: ParentalNoneReason;
  parents?: ParentLink[];
  supervision?: SupervisionState | null;
  teens?: TeenSummary[];
}

/** One day of a teen's learning, in the teen's own time zone. */
export interface TeenDay {
  day: string;
  minutes: number;
  lessons: number;
  xp: number;
}

/**
 * `GET /me/parental/teens/:teenId`: a parent's view of one teen, never what they say or to whom. Only the first parent
 * connected may loosen a control (`canLoosen`); any parent may tighten one.
 */
export interface TeenDetail {
  teen: PersonRef;
  since: string;
  controls: ParentalControls;
  week: TeenDay[];
  streak: number;
  parents: Array<PersonRef & { first?: boolean }>;
  canLoosen?: boolean;
  /** The teen's time zone, which their day and bedtime are counted in. */
  timeZone?: string;
}

/** `POST /me/parental/code`: a new code for a teen to enter, the last one void. */
export interface ParentCode {
  code: string;
  expiresAt: string;
}

export const PARENTAL_PATH = '/me/parental';
export const teenPath = (teenId: string): string => `${PARENTAL_PATH}/teens/${encodeURIComponent(teenId)}`;

/** A person's name as shown: the name they chose, else their username. */
export const personName = (p: Pick<PersonRef, 'displayName' | 'username'>): string => p.displayName?.trim() || p.username;

/** The overview's role, or none for an answer this build cannot read (an older server, a test stub). */
export function roleOf(overview: ParentalOverview | null | undefined): ParentalOverview['role'] | null {
  const role = overview?.role;
  return role === 'teen' || role === 'parent' || role === 'none' ? role : null;
}

/** Totals for a week of days. */
export function weekTotals(week: readonly TeenDay[]): { minutes: number; lessons: number; xp: number } {
  return week.reduce((sum, d) => ({ minutes: sum.minutes + d.minutes, lessons: sum.lessons + d.lessons, xp: sum.xp + d.xp }), { minutes: 0, lessons: 0, xp: 0 });
}

/** Whether the browser writes dates and times in this language; for one it does not (Kurdish, often) it would print English. */
export function namesDates(locale: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

/** The language to write a time in: the reader's, or the 24-hour clock where the browser has no words for theirs. */
const clockLocale = (locale: string): string => (namesDates(locale) ? locale : 'en-GB');

/** An 'HH:MM' wall-clock time as the reader writes times ("21:00", "9:00 PM"). */
export function clockTime(time: string, locale: string): string {
  const [h, m] = time.split(':').map(Number);
  // Read back in UTC, a time on a fixed day keeps its hours whatever zone the browser is in.
  const at = new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0));
  try {
    return new Intl.DateTimeFormat(clockLocale(locale), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(at);
  } catch {
    return time;
  }
}

/** An instant as the wall clock reads it where the teen is. */
export function clockAt(iso: string, timeZone: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(clockLocale(locale), { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(11, 16);
  }
}

/** The parent marked first, or the longest connected where the answer does not mark one (a list comes oldest first). */
export function firstParent<T extends PersonRef & { first?: boolean; since?: string }>(parents: readonly T[]): T | null {
  const marked = parents.find((p) => p.first === true);
  if (marked) return marked;
  const dated = parents.filter((p) => typeof p.since === 'string');
  if (dated.length === parents.length && dated.length > 0) return [...dated].sort((a, b) => a.since!.localeCompare(b.since!))[0]!;
  return parents[0] ?? null;
}

/** Minutes a bedtime covers, across midnight. */
const bedtimeLength = (b: Bedtime): number => {
  const at = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (at(b.to) - at(b.from) + 1440) % 1440;
};

/** Whether moving a daily limit from `was` to `next` loosens it: lifted, or raised. */
export function loosensLimit(was: number | null, next: number | null): boolean {
  if (next === null) return was !== null;
  return was !== null && next > was;
}

/** Whether moving a bedtime from `was` to `next` loosens it: taken away, or made shorter. */
export function loosensBedtime(was: Bedtime | null, next: Bedtime | null): boolean {
  if (!next) return was !== null;
  return was !== null && bedtimeLength(next) < bedtimeLength(was);
}

/** A time zone as a place ("America/New_York" reads "New York"); UTC as it is. */
export function zonePlace(timeZone: string): string {
  const place = timeZone.split('/').pop() ?? timeZone;
  return place.replace(/_/g, ' ');
}
