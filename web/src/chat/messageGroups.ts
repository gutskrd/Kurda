/**
 * Folds a flat message list into day sections of runs (one sender, one burst), kept pure so the time rules are
 * testable apart from rendering.
 */

/** The minimum a message needs for grouping. */
export interface Groupable {
  id: string;
  senderId: string;
  createdAt: string;
  /** a one-tap thanks ('thanks') is a line of its own rather than part of a run of bubbles */
  kind?: string;
}

/** Consecutive messages from one sender, close together in time; or one event, such as a one-tap thanks, alone. */
interface Run<T> {
  senderId: string;
  messages: T[];
  /** a run of one event, drawn as a quiet line across the thread rather than as a bubble */
  event?: boolean;
}

/** Whether a message is drawn as an event line rather than as something its sender wrote. */
export function isEvent(message: { kind?: string }): boolean {
  return message.kind === 'thanks';
}

/** All the runs that happened on one calendar day. */
interface DaySection<T> {
  /** `YYYY-MM-DD` in local time — the grouping key. */
  day: string;
  /** What to print on the separator: "Today", "Yesterday", a weekday, a date. */
  label: string;
  runs: Run<T>[];
}

/** A gap longer than this starts a new run even for the same sender. */
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

/** The date's locale (undefined means the browser's) and the words for today and yesterday, passed in to stay pure. */
interface DayLabelWords {
  locale?: string;
  today?: string;
  yesterday?: string;
  /** the heading for a message whose timestamp will not parse */
  earlier?: string;
}

/** A day separator relative to `now`: today, yesterday, a weekday within the week, otherwise a date. */
export function dayLabel(date: Date, now = new Date(), words: DayLabelWords = {}): string {
  const { locale, today = 'Today', yesterday = 'Yesterday' } = words;
  const diff = daysApart(date, now);
  if (diff === 0) return today;
  if (diff === 1) return yesterday;
  if (diff > 1 && diff < 7) return date.toLocaleDateString(locale, { weekday: 'long' });
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** A message's clock time, with the locale choosing 12 or 24 hours; undefined uses the browser's locale. */
export function timeLabel(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Folds an oldest-first message list into day sections of runs. A new run starts on a new sender, a new day or a gap
 * over RUN_GAP_MS; an unparseable timestamp never joins a neighbouring run.
 */
export function groupMessages<T extends Groupable>(
  messages: readonly T[],
  now = new Date(),
  words: DayLabelWords = {},
): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  let lastAt: number | null = null;

  for (const message of messages) {
    const at = new Date(message.createdAt);
    const valid = !Number.isNaN(at.getTime());
    const day = valid ? localDay(at) : 'unknown';

    let section = sections[sections.length - 1];
    if (!section || section.day !== day) {
      section = { day, label: valid ? dayLabel(at, now, words) : (words.earlier ?? 'Earlier'), runs: [] };
      sections.push(section);
      lastAt = null; // a new day always starts a new run
    }

    const run = section.runs[section.runs.length - 1];
    const event = isEvent(message);
    const continues =
      run !== undefined &&
      !run.event &&
      !event &&
      valid &&
      lastAt !== null &&
      run.senderId === message.senderId &&
      at.getTime() - lastAt <= RUN_GAP_MS;

    if (continues) run.messages.push(message);
    else section.runs.push({ senderId: message.senderId, messages: [message], ...(event ? { event: true } : {}) });

    lastAt = valid ? at.getTime() : null;
  }

  return sections;
}

/** A gap between runs longer than this is a pause, so the run before it shows its time. */
const MOMENT_GAP_MS = 10 * 60 * 1000;

/** Whether a run ends a moment of the conversation (last of its day or before a pause), and so prints its time. */
export function endsAMoment<T extends Groupable>(runs: readonly Run<T>[], index: number): boolean {
  const next = runs[index + 1];
  if (!next) return true;
  const run = runs[index]!;
  const ended = new Date(run.messages[run.messages.length - 1]!.createdAt).getTime();
  const resumed = new Date(next.messages[0]!.createdAt).getTime();
  if (Number.isNaN(ended) || Number.isNaN(resumed)) return true;
  return resumed - ended >= MOMENT_GAP_MS;
}

/** One emoji, with whatever joins and modifies it (a skin tone, a flag's second half, a family's joiners). */
const EMOJI = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)/gu;

/** Whether a message is only one to three emoji, which the thread shows large and without a bubble. */
export function isEmojiOnly(body: string | null | undefined): boolean {
  if (!body) return false;
  const text = body.trim();
  if (text.length === 0 || text.length > 40) return false;
  const found = text.match(EMOJI);
  if (!found || found.length > 3) return false;
  return text.replace(EMOJI, '').replace(/\s+/g, '').length === 0;
}
