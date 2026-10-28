import { wordSetSounds, type WordSetSounds } from './sounds.js';
import {
  CALENDAR_MONTHS,
  COLOURS,
  KURDISH_MONTHS,
  NUMBERS,
  dayAfter,
  monthAfter,
  wordSet,
  type Dialect,
  type Month,
  type SetWord,
  type WordSetId,
} from './words.js';

/**
 * "Check yourself" for a word set: a round of eight, made the way the
 * alphabet's is (alphabet/practice.ts says why each part is there) —
 * retrieval rather than rereading, the kinds of question mixed, the wrong
 * options the words people really mix up, a miss shown at once and asked
 * again later, and nothing scored or saved.
 *
 * The kinds:
 *  - hear: a word is said; pick it — by its colour or its digits, for those
 *    sets, else by the word written down
 *  - see: a colour, a number or a meaning is shown; pick its word
 *  - read: a word is shown; pick its colour, its digits or what it means
 *  - after: the day after this one — the week goes round, Saturday first
 *  - next: the month after this one, on its own calendar
 *  - newroz: the month Newroz falls in, or the Kurdish month it starts
 */

export type WordQuestionKind = 'hear' | 'see' | 'read' | 'after' | 'next' | 'newroz';

export interface WordQuestion {
  kind: WordQuestionKind;
  set: WordSetId;
  /** the word shown or said: for after and next, the one before the answer; null for newroz */
  prompt: SetWord | null;
  /** what a listening question plays */
  clip: string | null;
  options: SetWord[];
  /** what each option shows: the Kurdish word, or what it means (a swatch, digits, the reader's word) */
  shows: 'word' | 'meaning';
  /** the right option's id */
  answer: string;
  /** the word a miss sends the reader back to: the answer */
  topic: SetWord;
}

export const WORD_ROUND = 8;

const PATTERN: Record<WordSetId, readonly WordQuestionKind[]> = {
  colours: ['hear', 'see', 'read', 'hear', 'see', 'read', 'hear', 'see'],
  numbers: ['hear', 'see', 'read', 'hear', 'see', 'read', 'hear', 'read'],
  days: ['see', 'after', 'hear', 'read', 'after', 'see', 'hear', 'after'],
  months: ['see', 'newroz', 'hear', 'next', 'see', 'read', 'hear', 'next'],
};

/** Colours easily taken for one another, nearest first. */
const NEAR_COLOUR: Record<string, readonly string[]> = {
  red: ['orange', 'pink'], blue: ['purple', 'green'], green: ['blue', 'yellow'], yellow: ['orange', 'green'],
  black: ['grey', 'brown'], white: ['grey', 'pink'], brown: ['orange', 'black'], orange: ['yellow', 'red'],
  purple: ['pink', 'blue'], pink: ['red', 'purple'], grey: ['white', 'black'],
};

type Random = () => number;

/** The synthesised clips alone: what a round asks with before any recordings have arrived. */
const SYNTHESISED = wordSetSounds();

function shuffle<T>(xs: readonly T[], rand: Random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * The words most easily mistaken for `word`, nearest first: the colours
 * beside it; the numbers built on the same digit (heft, hivdeh, heftê), then
 * the nearest in value; the days and months beside it.
 */
function nearOf(word: SetWord): SetWord[] {
  switch (word.set) {
    case 'colours':
      return (NEAR_COLOUR[word.id] ?? []).map((id) => COLOURS.find((c) => c.id === id)!);
    case 'numbers': {
      const v = word.value;
      const digit = v < 10 ? v : v < 20 ? v - 10 : v < 100 ? v / 10 : 1;
      const family = NUMBERS.filter((n) => n.value !== v && [digit, 10 + digit, 10 * digit].includes(n.value));
      const nearest = [...NUMBERS].filter((n) => n.value !== v && !family.includes(n)).sort((a, b) => Math.abs(a.value - v) - Math.abs(b.value - v));
      return [...family, ...nearest];
    }
    case 'days':
      return [1, -1, 2, -2].map((by) => dayAfter(word, by));
    case 'months':
      return [1, -1, 2, -2].map((by) => monthAfter(word, by));
  }
}

/** The answer and two words easy to take for it, none of them `not`. */
function optionsFor(answer: SetWord, rand: Random, not: SetWord | null = null): SetWord[] {
  const near = nearOf(answer).filter((w) => w !== not && w !== answer);
  const rest = shuffle(
    wordSet(answer.set).filter((w) => w !== answer && w !== not && !near.includes(w) && sameCalendar(w, answer)),
    rand,
  );
  return shuffle([answer, ...[...new Set([...near.slice(0, 2), ...rest])].slice(0, 2)], rand);
}

const sameCalendar = (a: SetWord, b: SetWord): boolean => a.set !== 'months' || b.set !== 'months' || a.calendar === b.calendar;

/** A word whose meaning can be shown on its own: every word but a Kurdish month, whose meaning is its dates. */
const hasMeaning = (w: SetWord): boolean => w.set !== 'months' || w.calendar === 'gregorian';

/** What each kind of question asks with: the word itself, or what it means. */
const HEAR_SHOWS: Record<WordSetId, 'word' | 'meaning'> = { colours: 'meaning', numbers: 'meaning', days: 'word', months: 'word' };

function question(kind: WordQuestionKind, w: SetWord, dialect: Dialect, rand: Random, sounds: WordSetSounds): WordQuestion | null {
  const base = { set: w.set, clip: null, topic: w, answer: w.id };
  switch (kind) {
    case 'hear': {
      const clip = sounds.of(w, dialect);
      return clip ? { ...base, kind, prompt: w, clip, options: optionsFor(w, rand), shows: HEAR_SHOWS[w.set] } : null;
    }
    case 'see':
      return hasMeaning(w) ? { ...base, kind, prompt: w, options: optionsFor(w, rand), shows: 'word' } : null;
    case 'read':
      return hasMeaning(w) ? { ...base, kind, prompt: w, options: optionsFor(w, rand), shows: 'meaning' } : null;
    case 'after': {
      if (w.set !== 'days') return null;
      const before = dayAfter(w, -1);
      return { ...base, kind, prompt: before, options: optionsFor(w, rand, before), shows: 'word' };
    }
    case 'next': {
      if (w.set !== 'months') return null;
      const before = monthAfter(w, -1);
      return { ...base, kind, prompt: before, options: optionsFor(w, rand, before), shows: 'word' };
    }
    case 'newroz':
      return w.id === 'mar' || w.id === 'xakelewe' ? { ...base, kind, prompt: null, options: optionsFor(w, rand), shows: 'word' } : null;
  }
}

/**
 * A round of eight for `set`, in `dialect`. `focus` narrows it to the words
 * missed last time (by id). `rand` is injectable so the tests can pin a round
 * down; `sounds` is where each word plays from now (`wordSetSounds`), and a
 * listening question with nothing to hear gives way to one to read.
 */
export function makeWordRound(
  set: WordSetId,
  dialect: Dialect,
  focus: readonly string[] | null = null,
  rand: Random = Math.random,
  sounds: WordSetSounds = SYNTHESISED,
): WordQuestion[] {
  const words = wordSet(set);
  const want = focus && focus.length ? new Set(focus) : null;
  const picked = want ? words.filter((w) => want.has(w.id)) : [];
  const pool = shuffle(picked.length ? picked : words, rand);
  let i = 0;
  const ask = (kind: WordQuestionKind): WordQuestion | null => {
    for (let tries = 0; tries < pool.length; tries++) {
      const q = question(kind, pool[i++ % pool.length]!, dialect, rand, sounds);
      if (q) return q;
    }
    return null;
  };
  // Newroz has one answer on each calendar; a round on other words does not ask it
  const newroz = (): WordQuestion | null => {
    const month = shuffle(NEWROZ_MONTHS.filter((m) => !want || want.has(m.id)), rand)[0];
    return month ? question('newroz', month, dialect, rand, sounds) : null;
  };
  // a kind with nothing to ask of these words gives way to one that has: every set can be seen, and every month followed
  return PATTERN[set]
    .map((kind) => (kind === 'newroz' ? newroz() : ask(kind)) ?? ask('see') ?? ask('next'))
    .filter((q): q is WordQuestion => q !== null);
}

const NEWROZ_MONTHS: readonly Month[] = [CALENDAR_MONTHS[2]!, KURDISH_MONTHS[0]!];

/** The same question again, its options in a new order — for a miss that comes back later in the round. */
export function askWordAgain(q: WordQuestion, rand: Random = Math.random): WordQuestion {
  return { ...q, options: shuffle(q.options, rand) };
}
