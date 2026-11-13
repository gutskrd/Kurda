/**
 * Where each message sits in a conversation as it is read, with no React in it.
 *
 * A thread drawn as one bubble per message, each with a face and a name,
 * reads as a wall: nothing says who is still talking, or when anything was
 * said. Conversation comes in bursts, so the messages are placed in
 *
 *   day  →  run (one sender, one burst)  →  message
 *
 * and each message is told four things: whether a day begins above it,
 * whether it is the first or the last of its run (which decides the bubble's
 * corners, its tail, the face at its foot and the name over it), and whether
 * its run is where a moment of the conversation ends, which is where the time
 * is printed.
 *
 * The same rules as the website's `chat/messageGroups.ts`, to the minute. A
 * copy rather than a shared module because the website folds the list into
 * nested sections it can draw as it is, and a phone's list is flat: every
 * message is a row of its own, so each row has to carry its own place.
 */

/** The least a message needs to be placed. */
export interface Threaded {
  id: string;
  senderId: string;
  createdAt: string;
}

/** Where one message sits. */
export interface Place {
  /** the name of the day that begins with this message, to print above it; null when its day has begun */
  day: string | null;
  /** the first of its run: the name goes over it (in a group), and the run stands a little apart from the one before */
  first: boolean;
  /** the last of its run: it wears the tail, and the face sits at its foot */
  last: boolean;
  /** its run ends a moment of the conversation, so the time is printed under this, the run's last message */
  timed: boolean;
}

/** What the two days that have names are called, and the language the others are written in. */
export interface DayWords {
  locale?: string;
  today: string;
  yesterday: string;
  /** the heading over a message whose time will not parse */
  earlier: string;
}

/**
 * A gap longer than this starts a new run even for the same sender: long
 * enough to keep a burst together, short enough that a reply an hour later
 * is seen to be a separate moment.
 */
const RUN_GAP_MS = 5 * 60 * 1000;

/** Longer than this between two runs and the conversation paused there: the run before the pause says when it was. */
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

/** A date in the reader's language; a language the phone has no data for falls back to the phone's own. */
function written(date: Date, locale: string | undefined, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  }
}

/**
 * What a day is called over its messages. The last two have names, because
 * that is how people speak of them; the rest of the week is a weekday, and
 * anything older a date, since "Tuesday" stops meaning one Tuesday after a week.
 */
export function dayLabel(date: Date, now: Date, words: DayWords): string {
  const diff = daysApart(date, now);
  if (diff === 0) return words.today;
  if (diff === 1) return words.yesterday;
  if (diff > 1 && diff < 7) return written(date, words.locale, { weekday: 'long' });
  const sameYear = date.getFullYear() === now.getFullYear();
  return written(date, words.locale, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** The time on the clock, "14:05"; the language decides between twelve hours and twenty-four. */
export function timeLabel(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return written(d, locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Place every message of a thread given oldest first.
 *
 * A message starts a new run when the sender changes, when the day changes,
 * or when more than five minutes have passed. One whose time will not parse
 * never joins a neighbour's run: better a single bubble on its own than a
 * message quietly filed under the wrong day.
 */
export function placeMessages<T extends Threaded>(messages: readonly T[], now: Date, words: DayWords): Map<string, Place> {
  const places = new Map<string, Place>();
  // the start of each run, to find where a run ends and whether the talk paused after it
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
    // the last run of its day always says when; so does one the conversation paused after
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

/** Characters that only join or dress the emoji beside them: the joiner, the picture selector, a skin tone, a keycap's ring. */
function isEmojiGlue(code: number): boolean {
  return code === 0x200d || code === 0xfe0f || code === 0x20e3 || (code >= 0x1f3fb && code <= 0x1f3ff);
}

/** One half of a flag. */
const isFlagHalf = (code: number): boolean => code >= 0x1f1e6 && code <= 0x1f1ff;

/**
 * The blocks emoji are drawn from. Written as ranges rather than asked of the
 * engine as a Unicode property: a property the engine does not know is an
 * error the moment the file is read, on a phone nobody is holding a debugger to.
 */
function isEmojiBase(code: number): boolean {
  return (
    (code >= 0x1f300 && code <= 0x1faff) || // pictographs, faces, hands, transport, the later additions
    (code >= 0x2600 && code <= 0x27bf) || // the sun, the heart, the stars, dingbats
    (code >= 0x2b00 && code <= 0x2bff) || // the star and the large squares
    (code >= 0x1f000 && code <= 0x1f2ff) || // tiles, cards, the enclosed signs
    code === 0x203c ||
    code === 0x2049 ||
    code === 0x00a9 ||
    code === 0x00ae ||
    code === 0x2122 ||
    (code >= 0x2190 && code <= 0x21ff) || // arrows
    (code >= 0x2300 && code <= 0x23ff) || // the watch, the hourglass, the media keys
    (code >= 0x25a0 && code <= 0x25ff) || // the small squares and triangles
    (code >= 0x2900 && code <= 0x297f) ||
    (code >= 0x3030 && code <= 0x303d) ||
    code === 0x3297 ||
    code === 0x3299
  );
}

/**
 * Whether a message is nothing but one to three emoji, which a chat shows
 * large and without a bubble: a heart sent on its own is the whole message,
 * and reads as one at that size.
 */
export function isEmojiOnly(body: string | null | undefined): boolean {
  if (!body) return false;
  const text = body.trim();
  if (text.length === 0 || text.length > 40) return false;
  let count = 0;
  // whether the last character joined two emoji into one (a family, a flag's first half)
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
      // two halves are one flag
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
