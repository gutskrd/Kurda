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
  if (length < LETTER_MIN) return 'short';
  if (length > LETTER_MAX) return 'long';
  return null;
}

// ───────────────────────────────────────────────────────────── the birds

/**
 * The colours a pen pal pigeon can be. Each member chooses theirs once, for
 * free, and pays for another after (`LETTER_BIRD_PRICE`); until they choose,
 * it is picked from their id, so it is the same pigeon on every screen and
 * every phone. The apps draw it (art/letters.ts) from its number here.
 * Soft colours, the first the lavender of the owner's reference pigeon; its
 * pale rump, wing, bars, tail and cheek are worked out from the one colour
 * of its head (art/pigeon.ts).
 */
export const LETTER_BIRDS = ['#8784c7', '#6fa8e2', '#e88aa6', '#7dbf8f', '#f0a46c', '#55b7ae', '#e5bf55', '#b183d4'] as const;

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

/** The letters page: your bird, whether it is out, and your pen pals. */
export interface LettersHome {
  /** null when this account can write; otherwise why not */
  refusal: LettersRefusal | null;
  bird: number;
  /** whether the bird was chosen: until it is, the first choice is free (`LETTER_BIRD_PRICE` after) */
  birdChosen: boolean;
  /** the Zêr there is to pay for a new bird with */
  zer: number;
  /** your bird out with a letter, and since when; `visiting` while somebody has called it and is reading your letter */
  out: { since: string; visiting: boolean } | null;
  /** a bird called to your window, waiting for its answer */
  visitor: LetterVisitor | null;
  /** how many birds are out that you could call: the whole number, and the colours of the first few (`SKY_BIRDS_SHOWN`), the next to come first */
  birdsOut: number;
  sky: number[];
  /** birds you may still call today */
  callsLeft: number;
  /** your bird home from somebody's window with their answer, not yet read: the correspondence it opened */
  homecoming: { threadId: string; person: LetterPerson } | null;
  penPals: PenPal[];
  /** whether there is room for another pen pal */
  roomForMore: boolean;
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
