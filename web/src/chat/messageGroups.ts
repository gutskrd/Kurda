/**
 * Grouping a flat message list into what a chat should actually show.
 *
 * A thread rendered as one bubble per message repeats the sender's name on every
 * line, gives no sense of when anything happened, and reads as a wall. Real
 * conversation arrives in bursts, so messages are folded into:
 *
 *   day section  →  run (one sender, one burst)  →  messages
 *
 * Kept pure and separate from rendering so the rules are testable on their own —
 * the edge cases (midnight, a burst spanning it, a reply to yourself an hour
 * later) are all about time arithmetic, not markup.
 */

/** The minimum a message needs for grouping. */
export interface Groupable {
  id: string;
  senderId: string;
  createdAt: string;
}

/** Consecutive messages from one sender, close together in time. */
export interface Run<T> {
  senderId: string;
  messages: T[];
}

/** All the runs that happened on one calendar day. */
export interface DaySection<T> {
  /** `YYYY-MM-DD` in local time — the grouping key. */
  day: string;
  /** What to print on the separator: "Today", "Yesterday", a weekday, a date. */
  label: string;
  runs: Run<T>[];
}

/**
 * A gap longer than this starts a new run even for the same sender. Five minutes
 * is long enough to keep a burst of typing together and short enough that a reply
 * an hour later is visibly a separate moment.
 */
const RUN_GAP_MS = 5 * 60 * 1000;

/** Local calendar day, not UTC — a message at 01:00 belongs to the day you saw it. */
function localDay(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days between two local dates, ignoring the time of day. */
function daysApart(a: Date, b: Date): number {
  const at = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bt = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bt - at) / 86_400_000);
}

/**
 * What a day separator should read, relative to `now`.
 *
 * Recent days get a name because that is how people refer to them; anything
 * older gets a date, since "Tuesday" stops being useful past a week.
 */
export function dayLabel(date: Date, now = new Date()): string {
  const diff = daysApart(date, now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' });
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Clock time on a message, e.g. "14:05" — locale decides 12h vs 24h. */
export function timeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Fold an ascending (oldest-first) message list into day sections of runs.
 *
 * A message starts a new run when the sender changes, when the day changes, or
 * when more than RUN_GAP_MS has passed. An unparseable timestamp never merges
 * into a neighbouring run — better a stray single bubble than a message silently
 * filed under the wrong day.
 */
export function groupMessages<T extends Groupable>(messages: readonly T[], now = new Date()): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  let lastAt: number | null = null;

  for (const message of messages) {
    const at = new Date(message.createdAt);
    const valid = !Number.isNaN(at.getTime());
    const day = valid ? localDay(at) : 'unknown';

    let section = sections[sections.length - 1];
    if (!section || section.day !== day) {
      section = { day, label: valid ? dayLabel(at, now) : 'Earlier', runs: [] };
      sections.push(section);
      lastAt = null; // a new day always starts a new run
    }

    const run = section.runs[section.runs.length - 1];
    const continues =
      run !== undefined &&
      valid &&
      lastAt !== null &&
      run.senderId === message.senderId &&
      at.getTime() - lastAt <= RUN_GAP_MS;

    if (continues) run.messages.push(message);
    else section.runs.push({ senderId: message.senderId, messages: [message] });

    lastAt = valid ? at.getTime() : null;
  }

  return sections;
}
