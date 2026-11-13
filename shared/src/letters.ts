/**
 * Letters by bird: writing to another learner in Kurdish.
 *
 * Every member has a bird of their own. To meet somebody new you write a
 * letter and your bird flies out with it; the next person who sends their bird
 * out is the one it reaches, and theirs comes to your window with their
 * letter in the same moment. From then on the two of you are pen pals and
 * write back and forth, a letter each in turn, for as long as you both like.
 * When nobody else has a bird out, yours waits out there until somebody does.
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

/** The shortest letter: a greeting and a line, not a single word. */
export const LETTER_MIN = 12;
/** The longest letter: a page of handwriting. */
export const LETTER_MAX = 1500;
/** Pen pals one person writes to at a time; to meet somebody new past this, one is said goodbye to. */
export const PEN_PALS_MAX = 5;
/** Letters one person sends in a day, all pen pals and new birds together. */
export const LETTERS_PER_DAY = 12;
/** A bird out looking for somebody comes home with its letter after this many days if nobody has sent one out. */
export const BIRD_OUT_DAYS = 14;

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
 * The colours a bird can be: each member's own, picked from their id so it is
 * the same bird on every screen and every phone, without anything stored. The
 * apps draw it (art/letters.ts) from its number here. Soft colours, the first
 * the lavender of the owner's reference bird; its wing, tail and cheek are
 * worked out from the one colour (art/songbird.ts).
 */
export const LETTER_BIRDS = ['#8b86d9', '#6fa8e2', '#e88aa6', '#7dbf8f', '#f0a46c', '#55b7ae', '#e5bf55', '#b183d4'] as const;

/** Somebody's bird: a number into `LETTER_BIRDS`, from their id. */
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

/** Why somebody cannot write letters (yet). */
export type LettersRefusal = 'birth_month' | 'restricted';

/** The letters page: your bird, whether it is out, and your pen pals. */
export interface LettersHome {
  /** null when this account can write; otherwise why not */
  refusal: LettersRefusal | null;
  bird: number;
  /** your bird out with a letter, looking for somebody, and since when */
  out: { since: string } | null;
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

/**
 * What sending a bird out to somebody new comes to: it met another bird at
 * once, and theirs has brought you their letter; or nobody else has a bird
 * out, and yours is waiting out there.
 */
export type BirdOutResult = { kind: 'met'; threadId: string; person: LetterPerson; letter: LetterItem } | { kind: 'waiting'; since: string };
