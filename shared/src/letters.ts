/**
 * Letters by bird, pen pals writing to each other in Kurdish: the rules the server enforces and the apps show before
 * sending, and the shapes the letters API sends.
 *
 * A member sends their bird out with a letter; somebody calls it to their window and either answers, which makes the two
 * pen pals, or sends it on. Every letter lands at the window once, however its arrival was first seen (`LetterLanding`).
 *
 * Letters pass only within one age band (13 to 15, 16 and 17, adults), worked out from the birth month at every letter, so
 * a pair whose bands part can no longer write. A letter may not carry a phone number, an email address, a link or a handle
 * elsewhere (`letterProblem`), so nobody is drawn off to a place nobody looks after; the server also filters bad words.
 */
import { ageInYears, type BirthMonth } from './age.js';
import type { LetterDecor, LetterPaper } from './letter-paper.js';

/** A single word is a letter too, for somebody only starting to write Kurdish. */
export const LETTER_MIN = 1;
/** About a handwritten page. */
export const LETTER_MAX = 1500;
/** Pen pals one person writes to at a time. */
export const PEN_PALS_MAX = 5;
/** Letters one person sends in a day, all pen pals and new birds together. */
export const LETTERS_PER_DAY = 12;
/** A bird nobody calls comes home with its letter after this many days. */
export const BIRD_OUT_DAYS = 14;
/** Enough to find somebody, too few to leaf through everybody's letters. */
export const BIRD_CALLS_PER_DAY = 5;
/** How long a called bird waits for its answer before it flies on to somebody else. */
export const VISIT_HOURS = 24;
/** How many of the birds out are listed by colour for drawing; the count is always the full number. */
export const SKY_BIRDS_SHOWN = 6;
/** Landings sent at once. A letter waits for its answer before the next in the same correspondence, so five is usual. */
export const LANDINGS_MAX = 10;
/** A correspondence opens on its newest letters, this many, and shows as many earlier ones each time they are asked for. */
export const LETTERS_PAGE = 10;
/** The most letters one read of a correspondence returns when it asks for a page (`limit`). */
export const LETTERS_PAGE_MAX = 100;

// ───────────────────────────────────────────────────────────── who writes to whom

/** The age bands letters pass within, never across. */
export const LETTER_AGE_BANDS = ['13-15', '16-17', '18+'] as const;
export type LetterAgeBand = (typeof LETTER_AGE_BANDS)[number];

/** The band somebody writes in, from their birth month; null under 13. The birth month counts as the younger age (age.ts). */
export function letterAgeBand(birth: BirthMonth, now: Date = new Date()): LetterAgeBand | null {
  const age = ageInYears(birth, now);
  if (age < 13) return null;
  if (age < 16) return '13-15';
  if (age < 18) return '16-17';
  return '18+';
}

// ───────────────────────────────────────────────────────────── what a letter may hold

/** Why a letter cannot be sent as it is. */
export type LetterProblem = 'short' | 'long' | 'link' | 'contact';

const DIGIT = '[0-9\\u0660-\\u0669\\u06F0-\\u06F9]';
/** A web address: a scheme, a www., or a name with a dot and a common ending. */
const LINK = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\.(?:com|net|org|io|me|app|gg|co|uk|de|nl|fr|tr|se|ly|link|site|online|info|xyz|tv|to|be|ru|iq|ir|sy)\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
/** A handle on another service: an @ and a name. */
const HANDLE = /(?:^|[\s(])@[\p{L}\p{N}_.]{2,}/u;
/** Nine digits or more however spaced, Eastern Arabic and Persian digits too; two years side by side are only eight. */
const PHONE = new RegExp(`(?:${DIGIT}[\\s\\-().+]*){9,}`);
/**
 * A character that shows: anything but white space, invisible format marks (`\p{Cf}`), combining marks (`\p{M}`) and the
 * characters made to look blank (the Hangul fillers, the blank Braille pattern).
 */
const VISIBLE = /[^\s\p{Cf}\p{M}ᅟᅠ⠀ㅤﾠ]/u;

/**
 * A letter as stored: spaces and tabs inside a line become one space and lines are trimmed, but line breaks stay, with at
 * most one empty line in a row, so a greeting on its own line keeps it. Carriage returns become plain new lines.
 */
export function letterText(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * What stops a letter from being sent, or null. Length is counted on the trimmed text, and contact details and links are
 * reported first, so the writer is told what to take out.
 */
export function letterProblem(text: string): LetterProblem | null {
  const body = text.trim();
  // An email address contains what looks like a web address, so it is checked first.
  if (EMAIL.test(body) || HANDLE.test(body) || PHONE.test(body)) return 'contact';
  if (LINK.test(body)) return 'link';
  const length = [...body].length;
  // Only invisible marks (a zero-width space, a joiner, a direction mark) would arrive as a blank page, so it is too short.
  if (length < LETTER_MIN || !VISIBLE.test(body)) return 'short';
  if (length > LETTER_MAX) return 'long';
  return null;
}

// ───────────────────────────────────────────────────────────── the birds

/**
 * The pen-pal pigeons, as colours or the reference kinds (art/pigeon.ts `PIGEON_KINDS`); the apps draw them (art/letters.ts).
 * A member's bird is stored as its index here, so indexes never move. The first choice is free (`LETTER_BIRD_PRICE` after);
 * until then the bird is picked from the member's id, so it is the same on every screen.
 */
export const LETTER_BIRDS = ['grey', '#6fa8e2', '#e88aa6', '#7dbf8f', 'brown', '#55b7ae', 'white', '#b183d4'] as const;

/** The order the birds are offered in: the three reference kinds first, then the colours. */
export const LETTER_BIRD_ORDER: readonly number[] = [0, 6, 4, 1, 2, 3, 5, 7];

/** What another bird costs in Zêr; the first one chosen is free. */
export const LETTER_BIRD_PRICE = 500;

/** Whether `bird` is an index into `LETTER_BIRDS`. */
export function isLetterBird(bird: unknown): bird is number {
  return typeof bird === 'number' && Number.isInteger(bird) && bird >= 0 && bird < LETTER_BIRDS.length;
}

/** Somebody's bird before they choose one, from their id. */
export function letterBirdOf(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % LETTER_BIRDS.length;
}

// ───────────────────────────────────────────────────────────── what the API says

/** Somebody you write to: their name, their bird, and the id a report or a block is filed against. */
export interface LetterPerson {
  id: string;
  name: string;
  bird: number;
}

/** One letter in a correspondence. */
export interface LetterItem {
  id: string;
  /** written by the one reading */
  mine: boolean;
  /** empty when moderation has taken it down (`removed`) */
  body: string;
  /** its paper, drawing and notes (letter-paper.ts); null for plain paper and for a letter taken down */
  decor: LetterDecor | null;
  removed: boolean;
  sentAt: string;
  readAt: string | null;
  /** the writer's own copy of a letter whose drawing a person is checking; it is delivered once cleared */
  review?: 'held';
}

/** A pen pal, as the list of them shows one. */
export interface PenPal {
  threadId: string;
  person: LetterPerson;
  lastLetterAt: string;
  /** their letter is the last one, so it is yours to answer */
  yourTurn: boolean;
  /** their letters not yet opened */
  unread: number;
}

/** A bird called to your window: whose it is, its letter, when it came and when it flies on unanswered. */
export interface LetterVisitor {
  person: LetterPerson;
  letter: LetterItem;
  since: string;
  leavesAt: string;
}

/** Why somebody cannot write letters (yet). */
export type LettersRefusal = 'birth_month' | 'restricted';

/**
 * A letter at your window not yet landed, or landed and not yet read. A letter first opened elsewhere still lands once;
 * `POST /letters/landed` records that the window showed it.
 */
export interface LetterLanding {
  letterId: string;
  threadId: string;
  person: LetterPerson;
  /** 'home': your own bird back with their answer; 'window': their bird with a later letter */
  how: 'home' | 'window';
  /** already seen landing: it waits on the sill, with no flight, until read */
  landed: boolean;
  /** already opened in the correspondence */
  read: boolean;
  deliveredAt: string;
}

/** Where your own bird is: on your sill, out waiting to be called, at somebody's window, or on its way home. */
export type LetterFlight = 'home' | 'sky' | 'window' | 'homeward';

/**
 * Why a bird came home by itself: nobody answered within `BIRD_OUT_DAYS`, its writer moved into another age band, or its
 * writer's pen-pal places filled up meanwhile.
 */
export type LetterReturnReason = 'unanswered' | 'band' | 'full';

/** The letters page: your bird, whether it is out, and your pen pals. */
export interface LettersHome {
  /** null when this account can write */
  refusal: LettersRefusal | null;
  bird: number;
  /** whether a bird was ever chosen; until then the first choice is free */
  birdChosen: boolean;
  /** the Zêr available for a new bird */
  zer: number;
  /**
   * Your bird out with a letter, and since when; `visiting` while somebody reads it. `homeBy` is when it comes home
   * unanswered, `leavesBy` when it leaves the window it visits. This server always sends `flight`, `returned`, `landings`
   * and `now`; they are optional only for older servers.
   */
  out: { since: string; visiting: boolean; homeBy?: string; leavesBy?: string | null } | null;
  /** where your own bird is now (`LetterFlight`) */
  flight?: LetterFlight;
  /** your bird home by itself, not yet shown at the window (post its id to /letters/landed once shown) */
  returned?: { letterId: string; since: string; why: LetterReturnReason } | null;
  /** a bird called to your window, waiting for its answer */
  visitor: LetterVisitor | null;
  /** how many birds you could call; `sky` lists the colours of the first few (`SKY_BIRDS_SHOWN`), the next first */
  birdsOut: number;
  sky: number[];
  /** birds you may still call today */
  callsLeft: number;
  /** Letters still to land or not yet read, oldest first, at most `LANDINGS_MAX`. */
  landings?: LetterLanding[];
  /** The newest `home` landing, for app builds from before `landings`. */
  homecoming: { threadId: string; person: LetterPerson; letterId?: string } | null;
  /** The newest `window` landing, for app builds from before `landings`. */
  arrival: { threadId: string; person: LetterPerson; letterId?: string } | null;
  penPals: PenPal[];
  /** whether there is room for another pen pal */
  roomForMore: boolean;
  /** the paper last written on, which the composer opens with */
  paper: LetterPaper;
  /** the server's clock, so a visitor's `leavesAt` is timed by it rather than by a phone set wrong */
  now?: string;
}

/** The realtime event for any change in someone's letters. It carries nothing: the app reads `GET /letters` again. */
export const LETTERS_CHANGED = 'letters_changed';
export interface LettersChangedEvent {
  type: typeof LETTERS_CHANGED;
}

/**
 * A letter's notification as the bell, a push and the phone's inbox read it: the correspondence (null when missing or not
 * an id, so it can only open the letters page), which kind of arrival it is, and the letter. Older notices have no `how`.
 */
export interface LetterNotice {
  threadId: string | null;
  how: 'window' | 'home';
  letterId: string | null;
  fromUserId: string | null;
}

const NOTICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A notification's data read as a letter's (`kind: 'letter'`), or null; ids that are not ids are dropped, never followed. */
export function letterNoticeOf(data: unknown): LetterNotice | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.kind !== 'letter') return null;
  const id = (v: unknown): string | null => (typeof v === 'string' && NOTICE_ID.test(v) ? v : null);
  return { threadId: id(d.threadId), how: d.how === 'home' ? 'home' : 'window', letterId: id(d.letterId), fromUserId: id(d.fromUserId) };
}

/**
 * One correspondence, oldest letter first: every letter, or with `limit` the newest that many, and with `before` the
 * ones before that letter. Asked for a page, it says whether `earlier` letters remain; from a page of earlier letters
 * an app takes only the letters.
 */
export interface LetterThread {
  threadId: string;
  person: LetterPerson;
  letters: LetterItem[];
  yourTurn: boolean;
  /** said goodbye to, or no longer in the same band: read only */
  closed: boolean;
  /** with `limit` or `before`: whether letters before the first of these remain to be shown */
  earlier?: boolean;
}

/** The read of a correspondence an app makes: its newest page, or the page before a letter. */
export function letterThreadPath(threadId: string, before?: string): string {
  const page = before ? `before=${encodeURIComponent(before)}&limit=${LETTERS_PAGE}` : `limit=${LETTERS_PAGE}`;
  return `/letters/threads/${encodeURIComponent(threadId)}?${page}`;
}

/**
 * A fresh read of the newest letters, keeping the earlier ones already shown: they go back before the first fresh letter
 * when it is among those shown. When it is not, so many letters came that the two would not meet, the read stands alone.
 */
export function freshLetters(shown: LetterThread | null, fresh: LetterThread): LetterThread {
  const first = fresh.letters[0];
  const at = shown && first && fresh.earlier !== undefined ? shown.letters.findIndex((l) => l.id === first.id) : -1;
  if (!shown || at <= 0) return fresh;
  return { ...fresh, letters: [...shown.letters.slice(0, at), ...fresh.letters], earlier: shown.earlier };
}

/** Earlier letters put before those shown, with whether more remain before them. */
export function withEarlierLetters(shown: LetterThread, page: LetterThread): LetterThread {
  const have = new Set(shown.letters.map((l) => l.id));
  return { ...shown, letters: [...page.letters.filter((l) => !have.has(l.id)), ...shown.letters], earlier: page.earlier === true };
}

/** Your bird sent out to somebody new: it waits, from `since`, until somebody calls it. */
export type BirdOutResult = { kind: 'waiting'; since: string };

/** Answering a visiting bird: the correspondence it opens, with whom, and your answer, which their bird carries home. */
export interface VisitorAnswer {
  threadId: string;
  person: LetterPerson;
  letter: LetterItem;
}
