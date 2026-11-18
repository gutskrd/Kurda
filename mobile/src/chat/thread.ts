/**
 * Where each message sits in a conversation, with no React. Conversation comes in bursts, so messages are grouped
 *
 *   day  →  run (one sender, one burst)  →  message
 *
 * and each message learns four things: whether a day begins above it, whether it is the first or last of its run
 * (which decides the bubble's corners, the tail, the face at its foot and the name over it), and whether its run
 * ends a moment of the conversation, where the time is printed.
 *
 * The same rules as the web's `chat/messageGroups.ts`, to the minute. A copy because the web folds the list into
 * nested sections while a phone list is flat, so each row must carry its own place.
 */

/** The least a message needs to be placed. */
export interface Threaded {
  id: string;
  senderId: string;
  createdAt: string;
}

/** Where one message sits. */
export interface Place {
  /** The name of the day that begins with this message, printed above it; null once its day has begun. */
  day: string | null;
  /** The first of its run: the name goes over it (in a group), and the run stands slightly apart from the one before. */
  first: boolean;
  /** The last of its run: it wears the tail, and the face sits at its foot. */
  last: boolean;
  /** Its run ends a moment of the conversation, so the time is printed under this, the run's last message. */
  timed: boolean;
}

/** What the two days that have names are called, and the language the others are written in. */
export interface DayWords {
  locale?: string;
  today: string;
  yesterday: string;
  /** The heading over a message whose time will not parse. */
  earlier: string;
}

/**
 * A gap longer than this starts a new run even for the same sender: long enough to keep a burst together, short
 * enough that a reply an hour later reads as separate.
 */
const RUN_GAP_MS = 5 * 60 * 1000;

/** A gap longer than this between runs is a pause, and the run before it shows its time. */
const MOMENT_GAP_MS = 10 * 60 * 1000;

/** The local calendar day, not UTC: a message at one in the morning belongs to the day it was read on. */
function localDay(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Whole days between two local dates, whatever the time of day. */
function daysApart(a: Date, b: Date): number {
  const at = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bt = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((bt - at) / 86_400_000);
}

/** A date in the reader's language; a language without date data on the phone falls back to the phone's own. */
function written(date: Date, locale: string | undefined, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

/** A day's name over its messages: today and yesterday by name, the rest of the week by weekday, anything older by date. */
export function dayLabel(date: Date, now: Date, words: DayWords): string {
  const diff = daysApart(date, now);
  if (diff === 0) return words.today;
  if (diff === 1) return words.yesterday;
  if (diff > 1 && diff < 7) return written(date, words.locale, { weekday: 'long' });
  const sameYear = date.getFullYear() === now.getFullYear();
  return written(date, words.locale, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * The clock time, "14:05" or "7:46 PM": the language chooses 12 or 24 hours, and the hour is written as the
 * conversation list writes it (messages/list.ts), without a leading zero where the language omits one.
 */
export function timeLabel(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return written(d, locale, { hour: 'numeric', minute: '2-digit' });
}

/**
 * Place every message of a thread given oldest first. A new run starts when the sender or day changes, or after
 * more than five minutes. A message whose time does not parse never joins a neighbour's run, rather than being
 * filed under the wrong day.
 */
export function placeMessages<T extends Threaded>(messages: readonly T[], now: Date, words: DayWords): Map<string, Place> {
  const places = new Map<string, Place>();
  // The start of each run, to find where a run ends and whether the talk paused after it.
  const runs: { from: number; to: number; day: string }[] = [];
  let lastAt: number | null = null;
  let lastDay: string | null = null;

  messages.forEach((message, index) => {
    const at = new Date(message.createdAt);
    const valid = !Number.isNaN(at.getTime());
    const day = valid ? localDay(at) : 'unknown';
    const newDay = day !== lastDay;
    if (newDay) lastAt = null;

    const run = runs[runs.length - 1];
    const before = index > 0 ? messages[index - 1]! : null;
    const continues =
      run !== undefined && !newDay && valid && lastAt !== null && before?.senderId === message.senderId && at.getTime() - lastAt <= RUN_GAP_MS;

    if (continues) run.to = index;
    else runs.push({ from: index, to: index, day });

    places.set(message.id, {
      day: newDay ? (valid ? dayLabel(at, now, words) : words.earlier) : null,
      first: !continues,
      last: false,
      timed: false,
    });
    lastAt = valid ? at.getTime() : null;
    lastDay = day;
  });

  runs.forEach((run, i) => {
    const place = places.get(messages[run.to]!.id)!;
    place.last = true;
    const next = runs[i + 1];
    // The last run of its day always says when; so does one the conversation paused after.
    if (!next || next.day !== run.day) {
      place.timed = true;
      return;
    }
    const ended = new Date(messages[run.to]!.createdAt).getTime();
    const resumed = new Date(messages[next.from]!.createdAt).getTime();
    place.timed = Number.isNaN(ended) || Number.isNaN(resumed) || resumed - ended >= MOMENT_GAP_MS;
  });

  return places;
}

/** Characters that only join or modify adjacent emoji: the joiner, the presentation selector, skin tones, a keycap's ring. */
function isEmojiGlue(code: number): boolean {
  return code === 0x200d || code === 0xfe0f || code === 0x20e3 || (code >= 0x1f3fb && code <= 0x1f3ff);
}

/** One half of a flag. */
const isFlagHalf = (code: number): boolean => code >= 0x1f1e6 && code <= 0x1f1ff;

/** The emoji blocks, as ranges rather than a Unicode property escape: an engine that does not know a property fails when the file loads. */
function isEmojiBase(code: number): boolean {
  return (
    (code >= 0x1f300 && code <= 0x1faff) || // Pictographs, faces, hands, transport, the later additions.
    (code >= 0x2600 && code <= 0x27bf) || // The sun, the heart, the stars, dingbats.
    (code >= 0x2b00 && code <= 0x2bff) || // The star and the large squares.
    (code >= 0x1f000 && code <= 0x1f2ff) || // Tiles, cards, the enclosed signs.
    code === 0x203c ||
    code === 0x2049 ||
    code === 0x00a9 ||
    code === 0x00ae ||
    code === 0x2122 ||
    (code >= 0x2190 && code <= 0x21ff) || // arrows
    (code >= 0x2300 && code <= 0x23ff) || // The watch, the hourglass, the media keys.
    (code >= 0x25a0 && code <= 0x25ff) || // The small squares and triangles.
    (code >= 0x2900 && code <= 0x297f) ||
    (code >= 0x3030 && code <= 0x303d) ||
    code === 0x3297 ||
    code === 0x3299
  );
}

/** Whether a message is only one to three emoji, which a chat shows large without a bubble. */
export function isEmojiOnly(body: string | null | undefined): boolean {
  if (!body) return false;
  const text = body.trim();
  if (text.length === 0 || text.length > 40) return false;
  let count = 0;
  // Whether the last character joined two emoji into one (a family, a flag's first half).
  let joined = false;
  let flagOpen = false;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (/\s/.test(char)) {
      joined = false;
      flagOpen = false;
      continue;
    }
    if (isEmojiGlue(code)) {
      if (count === 0) return false;
      joined = code === 0x200d;
      continue;
    }
    if (isFlagHalf(code)) {
      // Two halves are one flag.
      if (flagOpen) flagOpen = false;
      else {
        flagOpen = true;
        count += 1;
      }
      joined = false;
      continue;
    }
    if (!isEmojiBase(code)) return false;
    if (!joined) count += 1;
    joined = false;
    flagOpen = false;
  }
  return count >= 1 && count <= 3;
}
