import type { MaintenanceNotice } from '@kurda/shared';

/** The same notice again: while Hevalo is offline, every request answers with it. */
export function sameNotice(a: MaintenanceNotice | null, b: MaintenanceNotice | null): boolean {
  if (a === null || b === null) return a === b;
  return a.title === b.title && a.message === b.message && a.pictureUrl === b.pictureUrl && a.since === b.since && a.backBy === b.backBy;
}

/** A day on the reader's own calendar, so "today" is theirs and not the server's. */
function dayOf(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

function namesDays(locale: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

/**
 * When Hevalo expects to be back, on the reader's clock: the time alone today ("6:00 PM"), the weekday within the
 * week ("Thursday 6:00 PM"), and the date beyond that.
 */
export function formatBackBy(iso: string, locale: string, now: Date = new Date()): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  // A browser with no day names for this language would print English ones, so a numeric date is used instead.
  const named = namesDays(locale);
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const days = dayOf(when) - dayOf(now);
  const options: Intl.DateTimeFormatOptions =
    days === 0
      ? time
      : named && days > 0 && days < 7
        ? { ...time, weekday: 'long' }
        : { ...time, day: 'numeric', month: named ? 'short' : 'numeric' };
  return new Intl.DateTimeFormat(named ? locale : 'en-GB', options).format(when);
}
