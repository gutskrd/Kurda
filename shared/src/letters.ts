/**
 * Letters by bird: writing to another learner in Kurdish.
 *
 * Every member has a bird of their own. To meet somebody new you write a
 * letter, even a single word, and your bird flies out with it, to wait over
 * the country until somebody calls it. Anybody can see how many birds are out
 * there and call one to their window: it comes with its letter, and waits on
 * the sill while it is read. Answer it, and that same bird carries the answer
 * home, and the two of you are pen pals from then on, writing back and forth
 * a letter each in turn for as long as you both like. Or send it on its way,
 * and it flies back out for somebody else. While a bird is visiting, your own
 * bird stays home: one bird on the sill waits for its answer first.
 *
 * Every letter lands at the window once. Each bird that brings one, your own
 * home with an answer or a pen pal's with their next letter, flies in to your
 * window the first time the window is open after it came, however you heard
 * of it, and waits on the sill until the letter is read (`LetterLanding`).
 * Opening the letter first somewhere else does not take its landing away.
 *
 * Here are the rules the server enforces and the apps show before anything is
 * sent: who may write to whom (age bands that never mix), how long a letter
 * is, what may not be in one, and how many birds and pen pals one person has.
 *
 * Who may write to whom. Everybody has an account and is 13 or older (the
 * app's own minimum, age.ts). Letters only ever pass between two people in the
 * same band — 13 to 15, 16 and 17, or adults — and the band is worked out from
 * the birth month at every letter, so somebody who turns 16 or 18 is not left
 * writing across the line: a pair whose bands part can no longer write.
 *
 * What a letter may not hold. A letter is for writing in Kurdish to somebody
 * you only know by their name and their bird; it is not a way to hand out a
 * phone number, an email address, a link or a name on another service, which
 * is how somebody would be drawn off to a place nobody looks after. Those are
 * refused before a letter is sent (`letterProblem`), and the words every other
 * place in the app filters are filtered here too, on the server.
 */
import { ageInYears, type BirthMonth } from './age.js';
import type { LetterDecor, LetterPaper } from './letter-paper.js';

/** The shortest letter: a single word is a letter too, for somebody only starting to write Kurdish. */
export const LETTER_MIN = 1;
/** The longest letter: a page of handwriting. */
export const LETTER_MAX = 1500;
/** Pen pals one person writes to at a time; to meet somebody new past this, one is said goodbye to. */
export const PEN_PALS_MAX = 5;
/** Letters one person sends in a day, all pen pals and new birds together. */
export const LETTERS_PER_DAY = 12;
/** A bird out looking for somebody comes home with its letter after this many days if nobody has called it. */
export const BIRD_OUT_DAYS = 14;
/** Birds one person may call to their window in a day: enough to find somebody, too few to leaf through everybody's letters. */
export const BIRD_CALLS_PER_DAY = 5;
/** How long a called bird waits on the sill for its answer before it flies on to somebody else. */
export const VISIT_HOURS = 24;
/** How many of the birds out an app is told of by colour, for drawing them over the country; the count is always the whole number. */
export const SKY_BIRDS_SHOWN = 6;
/**
 * How many letters still to land the window is told of at once. A letter
 * waits for its answer before the next comes in the same correspondence, so
 * with `PEN_PALS_MAX` correspondences there are hardly ever more than five.
 */
export const LANDINGS_MAX = 10;

// ───────────────────────────────────────────────────────────── who writes to whom

/** The bands letters pass within: never across. */
export const LETTER_AGE_BANDS = ['13-15', '16-17', '18+'] as const;
export type LetterAgeBand = (typeof LETTER_AGE_BANDS)[number];

/**
 * The band somebody writes in, from their birth month; null under 13, who
 * have no account and could not write. The birth month itself counts as the
 * younger age, as everywhere (age.ts).
 */
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
/** A phone number: nine digits or more, however they are spaced (Eastern Arabic and Persian digits too); two years side by side are eight. */
const PHONE = new RegExp(`(?:${DIGIT}[\\s\\-().+]*){9,}`);
/**
 * Something that shows on the page: anything but white space, the formatting
 * marks that take no room (`\p{Cf}`), marks that only sit on another letter
 * (`\p{M}`: a joiner, a variation selector) and the characters made to look
 * like nothing (the Hangul fillers, the blank Braille pattern).
 */
const VISIBLE = /[^\s\p{Cf}\p{M}ᅟᅠ⠀ㅤﾠ]/u;

/**
 * A letter as it is kept: written on lined paper, so its lines are its own.
 * Spaces and tabs within a line become one space and each line is trimmed, as
 * everywhere text is tidied, but a new line stays a new line and an empty line
 * between paragraphs stays (never more than one in a row), so "Hevalê delal,"
 * on a line of its own and the paragraphs after it read the way they were
 * written. Carriage returns from other keyboards become plain new lines.
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
 * What is wrong with a letter as written, or null when it can be sent. The
 * length is counted on the text as it will be sent, trimmed; a letter with a
 * way to be reached or a link in it is refused for that before its length, so
 * the writer is told the thing to take out.
 */
export function letterProblem(text: string): LetterProblem | null {
  const body = text.trim();
  // an email address holds what looks like a web address: it is asked about first
  if (EMAIL.test(body) || HANDLE.test(body) || PHONE.test(body)) return 'contact';
  if (LINK.test(body)) return 'link';
  const length = [...body].length;
  // a letter of nothing but marks nobody sees (a zero-width space, a joiner left by a Soranî keyboard, a direction
  // mark) would arrive as a blank page: it is as empty as one of only spaces, however many characters it counts
  if (length < LETTER_MIN || !VISIBLE.test(body)) return 'short';
  if (length > LETTER_MAX) return 'long';
  return null;
}

// ───────────────────────────────────────────────────────────── the birds

/**
 * The pen pal pigeons there are. Each member chooses theirs once, for free,
 * and pays for another after (`LETTER_BIRD_PRICE`); until they choose, it is
 * picked from their id, so it is the same pigeon on every screen and every
 * phone. The apps draw it (art/letters.ts) from its number here.
 *
 * Three are the owner's reference pigeons, each a kind with its own
 * markings, named (art/pigeon.ts `PIGEON_KINDS`): grey, white and brown. The
 * other five are the grey's markings worn in a soft colour, every shade of it
 * worked out from the one colour. A bird keeps its number for good, as that is
 * what a member's choice is kept as: the three kinds took the places of the
 * three colours nearest them (lavender, orange and yellow), so everyone still
 * has a bird. The order they are offered in is `LETTER_BIRD_ORDER`.
 */
export const LETTER_BIRDS = ['grey', '#6fa8e2', '#e88aa6', '#7dbf8f', 'brown', '#55b7ae', 'white', '#b183d4'] as const;

/** The order the birds are offered in: the three kinds of the reference first (grey, white, brown), then the colours. */
export const LETTER_BIRD_ORDER: readonly number[] = [0, 6, 4, 1, 2, 3, 5, 7];

/**
 * What a new bird costs, in Zêr, once you have one: the first bird you choose
 * is free, and is yours until you choose another.
 */
export const LETTER_BIRD_PRICE = 500;

/** Whether `bird` is one of the birds there are (a number into `LETTER_BIRDS`). */
export function isLetterBird(bird: unknown): bird is number {
  return typeof bird === 'number' && Number.isInteger(bird) && bird >= 0 && bird < LETTER_BIRDS.length;
}

/** Somebody's bird before they choose one: a number into `LETTER_BIRDS`, from their id. */
export function letterBirdOf(userId: string): number {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % LETTER_BIRDS.length;
}

// ───────────────────────────────────────────────────────────── what the API says

/** Somebody you write to: what the letters show of them, their name and their bird, and the id a report or a block is filed against. */
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
  /** its paper, drawing and notes (letter-paper.ts); null for the default paper with nothing on it, and when it was taken down */
  decor: LetterDecor | null;
  removed: boolean;
  sentAt: string;
  readAt: string | null;
}

/** A pen pal, as the list of them shows one. */
export interface PenPal {
  threadId: string;
  person: LetterPerson;
  lastLetterAt: string;
  /** their letter is the last one: it is yours to answer */
  yourTurn: boolean;
  /** their letters not yet opened */
  unread: number;
}

/**
 * A bird called to your window: whose it is, the letter it carries (read as
 * it comes), when it came, and when it flies on if it is not answered.
 */
export interface LetterVisitor {
  person: LetterPerson;
  letter: LetterItem;
  since: string;
  leavesAt: string;
}

/** Why somebody cannot write letters (yet). */
export type LettersRefusal = 'birth_month' | 'restricted';

/**
 * A letter that has come to your window and has not yet landed there, or
 * has landed and not yet been read. Landing and reading are two things: a
 * letter opened first in the correspondence (from a notification, say) still
 * lands at the window once, and a letter that has landed waits on the sill
 * until it is read. `POST /letters/landed` is the window saying it showed one.
 */
export interface LetterLanding {
  letterId: string;
  threadId: string;
  person: LetterPerson;
  /** 'home': your own bird home from their window with their answer; 'window': their bird with a later letter */
  how: 'home' | 'window';
  /** already seen landing at the window: it waits on the sill, with no flight, until it is read */
  landed: boolean;
  /** already opened in the correspondence */
  read: boolean;
  deliveredAt: string;
}

/**
 * Where your own bird is now, for the calm line at the window: at home on
 * your sill; out over the country, waiting for somebody to call it (`sky`);
 * at somebody's window while they read your letter (`window`); or on its way
 * home (`homeward`), with an answer still to land, or by itself (`returned`).
 */
export type LetterFlight = 'home' | 'sky' | 'window' | 'homeward';

/**
 * Why a bird came home by itself with its letter: nobody answered it in
 * `BIRD_OUT_DAYS` (`unanswered`), its writer moved into another age band while
 * it was out (`band`), or its writer's pen pal places filled up meanwhile, so
 * nobody could have called it (`full`).
 */
export type LetterReturnReason = 'unanswered' | 'band' | 'full';

/** The letters page: your bird, whether it is out, and your pen pals. */
export interface LettersHome {
  /** null when this account can write; otherwise why not */
  refusal: LettersRefusal | null;
  bird: number;
  /** whether the bird was chosen: until it is, the first choice is free (`LETTER_BIRD_PRICE` after) */
  birdChosen: boolean;
  /** the Zêr there is to pay for a new bird with */
  zer: number;
  /**
   * Your bird out with a letter, and since when; `visiting` while somebody
   * has called it and is reading your letter. `homeBy` is when it comes home
   * by itself if nobody answers it, and `leavesBy`, while it is visiting, when
   * it flies on from that window unanswered.
   *
   * This and the other fields marked new with landings (`flight`, `returned`,
   * `landings`, `now`) are always sent by this server; they are optional here
   * because a server from before them sent none, and an app reads them so.
   */
  out: { since: string; visiting: boolean; homeBy?: string; leavesBy?: string | null } | null;
  /** where your own bird is now (`LetterFlight`) */
  flight?: LetterFlight;
  /** your bird home by itself with its letter, nobody having answered it, not yet seen at the window (post its id to /letters/landed once shown) */
  returned?: { letterId: string; since: string; why: LetterReturnReason } | null;
  /** a bird called to your window, waiting for its answer */
  visitor: LetterVisitor | null;
  /** how many birds are out that you could call: the whole number, and the colours of the first few (`SKY_BIRDS_SHOWN`), the next to come first */
  birdsOut: number;
  sky: number[];
  /** birds you may still call today */
  callsLeft: number;
  /**
   * Every letter still to land at your window, or landed and not yet read,
   * oldest first (`LANDINGS_MAX` at most). A server from before landings sent
   * none, only `homecoming` and `arrival`.
   */
  landings?: LetterLanding[];
  /**
   * The newest `home` landing, for app builds from before `landings`: your
   * bird home from somebody's window with their answer, not yet landed and
   * read. The correspondence it opened, and the answer.
   */
  homecoming: { threadId: string; person: LetterPerson; letterId?: string } | null;
  /**
   * The newest `window` landing, for app builds from before `landings`: a pen
   * pal's bird come to your window with their next letter, not yet landed and
   * read. Every letter after the first answer is carried by its writer's bird.
   */
  arrival: { threadId: string; person: LetterPerson; letterId?: string } | null;
  penPals: PenPal[];
  /** whether there is room for another pen pal */
  roomForMore: boolean;
  /** the paper you last wrote on, which the composer opens on */
  paper: LetterPaper;
  /** the server's clock when this was read, so a window can time a visitor's `leavesAt` by it rather than by a phone set wrong */
  now?: string;
}

/**
 * The realtime event that tells the apps something changed in someone's
 * letters (a bird came, was called, answered, sent on or called home, a
 * letter landed). It carries nothing: the window reads `GET /letters` again.
 */
export const LETTERS_CHANGED = 'letters_changed';
export interface LettersChangedEvent {
  type: typeof LETTERS_CHANGED;
}

/**
 * A letter's notification, as the bell, a push and the phone's inbox read
 * it: the correspondence it came in (null when that is missing or not an
 * id, so it can only lead to the letters page), whether it is a pen pal's
 * bird at your window or your own bird home with an answer, and the letter.
 * Notifications from before `how` were all of a pen pal's letter.
 */
export interface LetterNotice {
  threadId: string | null;
  how: 'window' | 'home';
  letterId: string | null;
  fromUserId: string | null;
}

const NOTICE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A notification's data read as a letter's (`kind: 'letter'`), or null for any other; ids that are not ids are dropped, never followed. */
export function letterNoticeOf(data: unknown): LetterNotice | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.kind !== 'letter') return null;
  const id = (v: unknown): string | null => (typeof v === 'string' && NOTICE_ID.test(v) ? v : null);
  return { threadId: id(d.threadId), how: d.how === 'home' ? 'home' : 'window', letterId: id(d.letterId), fromUserId: id(d.fromUserId) };
}

/** One correspondence, oldest letter first. */
export interface LetterThread {
  threadId: string;
  person: LetterPerson;
  letters: LetterItem[];
  yourTurn: boolean;
  /** said goodbye to, by either of you, or no longer in the same band: read only */
  closed: boolean;
}

/** Your bird sent out to somebody new: it waits out there, from `since`, until somebody calls it. */
export type BirdOutResult = { kind: 'waiting'; since: string };

/** What answering a visiting bird comes to: the correspondence it opens, with whom, and your answer, which their bird carries home. */
export interface VisitorAnswer {
  threadId: string;
  person: LetterPerson;
  letter: LetterItem;
}
