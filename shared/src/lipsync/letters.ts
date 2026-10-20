/**
 * Kurdish text as a sequence of sounds, each with the mouth shape it is said
 * with and how long it lasts relative to the others.
 *
 * Both scripts are read: Kurmancî in the Latin (Hawar) alphabet, where every
 * vowel is written, and Soranî in the Arabic script, where the short i is not
 * and و and ی are each a vowel or a consonant depending on their neighbours.
 * The result does not try to be a pronunciation: it only has to say which
 * shape the mouth makes, in what order, and roughly for how long, which is all
 * a drawn mouth can show.
 *
 * Words are numbered, so an aligner knows where one ends and the next begins,
 * and punctuation becomes a pause: a comma short, a full stop or a question
 * mark longer. Characters that say nothing (quotes, symbols, emoji, invisible
 * formatting) are left out.
 */
import { foldLetter } from '../kurdish-text.js';
import { isInvisibleChar } from '../lesson-audio.js';
import type { Viseme } from './visemes.js';

export type LipsyncScript = 'latin' | 'arabic';

export type SoundKind = 'vowel' | 'consonant' | 'pause';

export interface Sound {
  viseme: Viseme;
  kind: SoundKind;
  /**
   * How long the sound lasts, relative to the others: a long vowel about
   * twice a stop. Only ratios matter; the aligner spreads them over the time
   * there is.
   */
  weight: number;
  /** which word it is in, from 0; a pause carries the number of the word it follows */
  word: number;
  /** the letters it was read from; empty for a vowel the script leaves unwritten */
  letters: string;
  /** a pause only: what the punctuation asks for */
  pause?: 'short' | 'long';
}

/*
 * Weights. A long vowel (a, ê, î, o, û) is held about twice as long as a stop
 * (b, t, k) — the stop is a closure and a release, the vowel is the syllable —
 * and the continuous consonants (f, s, ş, x, the nasals) come between. The
 * short vowels (e, u, and i, which is barely there in fast speech) are shorter
 * than the long ones; the vowel Soranî leaves unwritten is the shortest.
 */
const LONG_VOWEL = 1.6;
const MID_VOWEL = 1.5;
const VOWEL = 1.05;
const SHORT_VOWEL = 0.8;
const UNWRITTEN_VOWEL = 0.55;
const GLIDE = 0.6;
const STOP = 0.7;
const NASAL = 0.85;
const LIQUID = 0.75;
const TAP = 0.55;
const TRILL = 0.85;
const FRICATIVE = 1;
const AFFRICATE = 0.9;
const BREATH = 0.7;

/** A comma, a semicolon or a dash: a breath between parts of a sentence. */
export const SHORT_PAUSE_WEIGHT = 2.5;
/** A full stop, a question or an exclamation: the end of a sentence. */
export const LONG_PAUSE_WEIGHT = 4.5;

/** A doubled letter is one sound, held longer. */
const DOUBLED = 1.5;

/*
 * How loud a consonant is, for deciding where a Soranî word hides an i: a
 * syllable rises in loudness to its vowel and falls after it, so two
 * consonants can end one only when the second is quieter than the first
 * (dest, kurd, germ), never the other way about.
 */
const SONORITY_STOP = 1;
const SONORITY_FRICATIVE = 2;
const SONORITY_NASAL = 3;
const SONORITY_LIQUID = 4;
const SONORITY_GLIDE = 5;

interface Letter {
  viseme: Viseme;
  weight: number;
  kind: 'vowel' | 'consonant';
  sonority: number;
}

const vowel = (viseme: Viseme, weight: number): Letter => ({ viseme, weight, kind: 'vowel', sonority: 6 });
const consonant = (viseme: Viseme, weight: number, sonority: number): Letter => ({
  viseme,
  weight,
  kind: 'consonant',
  sonority,
});

/**
 * The Hawar alphabet. A vowel shows its own shape; b, m, p press the lips; f
 * and v tuck the lip under the teeth; l, n, t, d show the tongue at the teeth;
 * w rounds the lips as u does. Every other consonant is said with the teeth
 * nearly together, which is the one shape `etc`.
 */
const LATIN: Record<string, Letter> = {
  a: vowel('a', LONG_VOWEL),
  e: vowel('e', VOWEL),
  ê: vowel('e', MID_VOWEL),
  i: vowel('i', SHORT_VOWEL),
  î: vowel('i', MID_VOWEL),
  o: vowel('o', MID_VOWEL),
  u: vowel('u', VOWEL),
  û: vowel('u', LONG_VOWEL),
  w: consonant('u', GLIDE, SONORITY_GLIDE),
  b: consonant('mbp', STOP, SONORITY_STOP),
  p: consonant('mbp', STOP, SONORITY_STOP),
  m: consonant('mbp', NASAL, SONORITY_NASAL),
  f: consonant('fv', FRICATIVE, SONORITY_FRICATIVE),
  v: consonant('fv', FRICATIVE, SONORITY_FRICATIVE),
  l: consonant('l', LIQUID, SONORITY_LIQUID),
  n: consonant('l', NASAL, SONORITY_NASAL),
  t: consonant('l', STOP, SONORITY_STOP),
  d: consonant('l', STOP, SONORITY_STOP),
  c: consonant('etc', AFFRICATE, SONORITY_STOP),
  ç: consonant('etc', AFFRICATE, SONORITY_STOP),
  g: consonant('etc', STOP, SONORITY_STOP),
  h: consonant('etc', BREATH, SONORITY_FRICATIVE),
  ḧ: consonant('etc', BREATH, SONORITY_FRICATIVE),
  j: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  k: consonant('etc', STOP, SONORITY_STOP),
  q: consonant('etc', STOP, SONORITY_STOP),
  r: consonant('etc', TAP, SONORITY_LIQUID),
  s: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ş: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  x: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ẍ: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  y: consonant('etc', GLIDE, SONORITY_GLIDE),
  z: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
};

/**
 * Two letters for one sound, as Kurdish is typed on a keyboard without ş, ç,
 * x's dotted partner or j: "sh" for ş, "ch" for ç, "kh" for x, "gh" for ẍ,
 * "zh" for j. Each is one sound, so it gets one sound's time. (Hawar's own xw
 * is two sounds, x and a rounding of the lips, and is read as two.)
 */
const LATIN_DIGRAPHS: Record<string, string> = { sh: 'ş', ch: 'ç', kh: 'x', gh: 'ẍ', zh: 'j' };

/**
 * The Soranî alphabet, less و and ی (which depend on their neighbours, see
 * `soraniWord`) and the ambiguous ه. The Arabic letters that only loanwords
 * use are read as Kurdish says them: ط as t, ض and ظ as z, ص and ث as s.
 */
const ARABIC: Record<string, Letter> = {
  ا: vowel('a', LONG_VOWEL),
  ە: vowel('e', VOWEL),
  ێ: vowel('e', MID_VOWEL),
  ۆ: vowel('o', MID_VOWEL),
  ب: consonant('mbp', STOP, SONORITY_STOP),
  پ: consonant('mbp', STOP, SONORITY_STOP),
  م: consonant('mbp', NASAL, SONORITY_NASAL),
  ف: consonant('fv', FRICATIVE, SONORITY_FRICATIVE),
  ڤ: consonant('fv', FRICATIVE, SONORITY_FRICATIVE),
  ل: consonant('l', LIQUID, SONORITY_LIQUID),
  ڵ: consonant('l', TRILL, SONORITY_LIQUID),
  ن: consonant('l', NASAL, SONORITY_NASAL),
  ت: consonant('l', STOP, SONORITY_STOP),
  د: consonant('l', STOP, SONORITY_STOP),
  ط: consonant('l', STOP, SONORITY_STOP),
  ج: consonant('etc', AFFRICATE, SONORITY_STOP),
  چ: consonant('etc', AFFRICATE, SONORITY_STOP),
  ح: consonant('etc', BREATH, SONORITY_FRICATIVE),
  خ: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ر: consonant('etc', TAP, SONORITY_LIQUID),
  ڕ: consonant('etc', TRILL, SONORITY_LIQUID),
  ز: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ژ: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  س: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ش: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ع: consonant('etc', BREATH, SONORITY_FRICATIVE),
  غ: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ق: consonant('etc', STOP, SONORITY_STOP),
  ک: consonant('etc', STOP, SONORITY_STOP),
  گ: consonant('etc', STOP, SONORITY_STOP),
  ھ: consonant('etc', BREATH, SONORITY_FRICATIVE),
  ص: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ض: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ظ: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ث: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
  ذ: consonant('etc', FRICATIVE, SONORITY_FRICATIVE),
};

const W_VOWEL = vowel('u', VOWEL);
const W_LONG = vowel('u', LONG_VOWEL);
const W_GLIDE = consonant('u', GLIDE, SONORITY_GLIDE);
const Y_VOWEL = vowel('i', MID_VOWEL);
const Y_GLIDE = consonant('etc', GLIDE, SONORITY_GLIDE);
const H_CONSONANT = ARABIC['ھ']!;
const E_VOWEL = ARABIC['ە']!;
const I_UNWRITTEN = vowel('i', UNWRITTEN_VOWEL);

/**
 * Arabic-script letters typed on another keyboard, read as the Kurdish letter
 * they stand for. `foldLetter` covers kaf and yeh; the alefs with a hamza or a
 * madda are the vowel a, and ؤ the و it sits on. (ه is decided per word.)
 */
const ARABIC_VARIANTS: Record<string, string> = { أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا', ؤ: 'و', ة: 'ە' };

/** Arabic short-vowel marks, rare in Kurdish but read when they are written. */
const FATHA = 'َ';
const DAMMA = 'ُ';
const KASRA = 'ِ';
const SHADDA = 'ّ';
const SUKUN = 'ْ';
const SUPERSCRIPT_ALEF = 'ٰ';
const MARK_VOWELS: Record<string, Letter> = {
  [FATHA]: vowel('e', VOWEL),
  [DAMMA]: vowel('u', VOWEL),
  [KASRA]: vowel('i', SHORT_VOWEL),
  [SUPERSCRIPT_ALEF]: vowel('a', LONG_VOWEL),
};

const ZWNJ = '‌';
/**
 * The seat of a hamza, which starts every Soranî word that starts with a
 * vowel, and the hamza alone: neither has a mouth shape of its own.
 */
const GLOTTAL = new Set(['ئ', 'ء']);

/** Digits are said as their names, so the mouth moves while a number is read out. */
const DIGIT_NAMES: Record<LipsyncScript, readonly string[]> = {
  latin: ['sifir', 'yek', 'du', 'sê', 'çar', 'pênc', 'şeş', 'heft', 'heşt', 'neh'],
  arabic: ['سفر', 'یەک', 'دوو', 'سێ', 'چوار', 'پێنج', 'شەش', 'حەوت', 'ھەشت', 'نۆ'],
};

const SHORT_PAUSES = new Set([',', '،', ';', '؛', ':', '–', '—', '(', ')', '[', ']', '{', '}', '٬']);
const LONG_PAUSES = new Set(['.', '!', '?', '؟', '۔', '…', '‼', '⁇', '⁈', '⁉']);
/** Punctuation that sits inside a number (2.5, 10:30, 1,000): no pause there. */
const NUMBER_PUNCTUATION = new Set(['.', ',', ':', '٫', '٬', '،']);
/** An apostrophe between two letters keeps them in one word (Kurdistan'ê). */
const APOSTROPHES = new Set(["'", '’', 'ʼ', '`', '´']);

const LETTER = /\p{L}/u;
const MARK = /\p{M}/u;
const DIGIT = /\p{Nd}/u;
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN_SCRIPT = /[A-Za-zÀ-ɏḀ-ỿ]/;

/** Which script a text is mostly written in: the one with more of its letters. */
export function detectScript(text: string): LipsyncScript {
  let arabic = 0;
  let latin = 0;
  for (const ch of text) {
    if (ARABIC_SCRIPT.test(ch)) arabic += 1;
    else if (LATIN_SCRIPT.test(ch)) latin += 1;
  }
  return arabic > latin ? 'arabic' : 'latin';
}

/** One letter of a Kurmancî word, by its own form or, failing that, its base letter (é → e, ğ → g). */
function latinLetter(ch: string): Letter | undefined {
  return LATIN[ch] ?? LATIN[ch.normalize('NFD')[0] ?? ''];
}

function kurmanciWord(chars: string[], word: number, out: Sound[]): void {
  let last: { sound: Sound; key: string } | null = null;
  for (let i = 0; i < chars.length; i++) {
    // a Turkish keyboard's dotless ı is Hawar's i
    let key = foldLetter(chars[i]!);
    let written = chars[i]!;
    const digraph = LATIN_DIGRAPHS[key + (chars[i + 1] ?? '')];
    if (digraph) {
      written += chars[i + 1]!;
      key = digraph;
      i += 1;
    }
    const letter = latinLetter(key);
    if (!letter) continue; // a combining mark, an apostrophe, a letter of no alphabet here
    if (last && last.key === key) {
      // a doubled letter (rr, ll, aa) is one sound, said longer
      last.sound.weight = Math.max(last.sound.weight * DOUBLED, letter.kind === 'vowel' ? LONG_VOWEL : 0);
      last.sound.letters += written;
      continue;
    }
    const sound: Sound = { viseme: letter.viseme, kind: letter.kind, weight: letter.weight, word, letters: written };
    out.push(sound);
    last = { sound, key };
  }
}

/** A letter of a Soranî word, part way through being read. */
interface Unit {
  letters: string;
  /** a letter whose reading is settled, or the letter that decides later (و, ی, ه) */
  letter: Letter | 'و' | 'ی' | 'ه' | 'glottal';
  /** the next letter's vowel is written as a mark, or a sukun says there is none: no i goes after it */
  closed?: boolean;
}

function isVowelUnit(unit: Unit | undefined): boolean {
  return unit !== undefined && typeof unit.letter === 'object' && unit.letter.kind === 'vowel';
}

/**
 * Where a Soranî word leaves out an i, and the word with it put back.
 *
 * The Arabic script as Soranî uses it writes every vowel but one: the short i
 * (as in dil, min, sipas) is left for the reader to supply. Left out here as
 * well, a word like من or سپاس would be a run of consonants with the mouth
 * never opening, which looks wrong at once. So it goes back where Kurdish
 * syllables need it: a word never starts with two consonants (سپاس is sipas,
 * من is min), a syllable ends in at most two, and two only when the second is
 * quieter than the first (dest, kurd, germ, but bizanim and destim). This is
 * a reading for the mouth, not a spelling: an i in the wrong place of a long
 * cluster still opens the mouth about when the speaker did.
 */
function withUnwrittenVowels(units: Array<Letter & { letters: string; closed?: boolean }>): Array<Letter & { letters: string }> {
  const out: Array<Letter & { letters: string }> = [];
  const i = (): Letter & { letters: string } => ({ ...I_UNWRITTEN, letters: '' });
  let at = 0;
  while (at < units.length) {
    if (units[at]!.kind === 'vowel') {
      out.push(units[at]!);
      at += 1;
      continue;
    }
    let end = at;
    while (end < units.length && units[end]!.kind === 'consonant') end += 1;
    const run = units.slice(at, end);
    const vowelBefore = at > 0;
    const vowelAfter = end < units.length;
    out.push(...clusterWithVowels(run, vowelBefore, vowelAfter, i));
    at = end;
  }
  return out;
}

function clusterWithVowels<T extends Letter & { letters: string; closed?: boolean }>(
  run: T[],
  vowelBefore: boolean,
  vowelAfter: boolean,
  i: () => Letter & { letters: string },
): Array<Letter & { letters: string }> {
  if (run.length === 0) return [];
  // a written sukun or vowel mark says what follows that consonant: nothing to supply
  const open = (c: T): boolean => !c.closed;
  if (!vowelBefore) {
    // no word starts with two consonants: an i after the first. The one
    // exception is a consonant and the glide w, which Kurdish starts words
    // with (خوا xwa, کوێ kwê): the lips round straight into the vowel
    if (run.length === 1) return run;
    const [first, second, ...rest] = run;
    const tail = clusterWithVowels([second!, ...rest], true, vowelAfter, i);
    return open(first!) && second!.viseme !== 'u' ? [first!, i(), ...tail] : [first!, ...tail];
  }
  if (vowelAfter) {
    // between vowels: up to two close the syllable before and one opens the next;
    // any more each need an i of their own
    if (run.length <= 3) return run;
    const out: Array<Letter & { letters: string }> = [run[0]!, run[1]!];
    for (let k = 2; k < run.length - 1; k++) {
      out.push(run[k]!);
      if (open(run[k]!)) out.push(i());
    }
    out.push(run[run.length - 1]!);
    return out;
  }
  // at the end of the word: two may close it only if they fall in loudness
  if (run.length === 1) return run;
  if (run.length === 2 && run[0]!.sonority > run[1]!.sonority) return run;
  const last = run[run.length - 1]!;
  const before = run.slice(0, -1);
  const lead = clusterWithVowels(before, true, true, i);
  return open(before[before.length - 1]!) ? [...lead, i(), last] : [...lead, last];
}

function soraniWord(chars: string[], word: number, out: Sound[]): void {
  // first pass: letters, with the variants folded and the marks applied
  const units: Unit[] = [];
  for (let at = 0; at < chars.length; at++) {
    const raw = chars[at]!;
    if (raw === ZWNJ) {
      // ه followed by a non-joiner is how a Persian keyboard types ە
      const prev = units[units.length - 1];
      if (prev && prev.letter === 'ه') prev.letter = E_VOWEL;
      continue;
    }
    if (raw === SHADDA) {
      const prev = units[units.length - 1];
      if (prev && typeof prev.letter === 'object') prev.letter = { ...prev.letter, weight: prev.letter.weight * DOUBLED };
      continue;
    }
    if (raw === SUKUN) {
      const prev = units[units.length - 1];
      if (prev) prev.closed = true;
      continue;
    }
    const markVowel = MARK_VOWELS[raw];
    if (markVowel) {
      const prev = units[units.length - 1];
      if (prev) prev.closed = true;
      units.push({ letters: raw, letter: markVowel });
      continue;
    }
    const ch = ARABIC_VARIANTS[raw] ?? (raw === 'ه' ? raw : foldLetter(raw));
    if (GLOTTAL.has(ch)) units.push({ letters: raw, letter: 'glottal' });
    else if (ch === 'و' || ch === 'ی' || ch === 'ه') units.push({ letters: raw, letter: ch });
    else if (ARABIC[ch]) units.push({ letters: raw, letter: ARABIC[ch]! });
    // anything else (another mark, a letter of no alphabet here) says nothing
  }

  // second pass: ه, then وو, then و and ی by their neighbours
  for (let at = 0; at < units.length; at++) {
    const unit = units[at]!;
    if (unit.letter !== 'ه') continue;
    // at the end of a word ه is the vowel ە as most keyboards type it; elsewhere it is h
    const last = at === units.length - 1 && at > 0;
    unit.letter = last ? E_VOWEL : H_CONSONANT;
  }
  for (let at = 0; at < units.length - 1; at++) {
    if (units[at]!.letter === 'و' && units[at + 1]!.letter === 'و') {
      units.splice(at, 2, { letters: 'وو', letter: W_LONG });
    }
  }
  for (let at = 0; at < units.length; at++) {
    const unit = units[at]!;
    if (unit.letter !== 'و' && unit.letter !== 'ی') continue;
    const prev = units[at - 1];
    const next = units[at + 1];
    // after the hamza seat it is the vowel the seat carries (ئیش, ئوو)
    const afterGlottal = prev !== undefined && prev.letter === 'glottal';
    // beside a vowel it is the glide: چاو is çaw, یەک is yek, نییە is nîye
    const glide = !afterGlottal && (isVowelUnit(prev) || isVowelUnit(next));
    if (unit.letter === 'و') unit.letter = glide ? W_GLIDE : W_VOWEL;
    else unit.letter = glide ? Y_GLIDE : Y_VOWEL;
  }

  // the hamza seat leaves no sound of its own
  const settled = units.flatMap((u) =>
    typeof u.letter === 'object' ? [{ ...u.letter, letters: u.letters, closed: u.closed }] : [],
  );
  for (const sound of withUnwrittenVowels(settled)) {
    out.push({ viseme: sound.viseme, kind: sound.kind, weight: sound.weight, word, letters: sound.letters });
  }
}

type Token = { kind: 'word'; chars: string[] } | { kind: 'pause'; long: boolean; letters: string };

function tokens(text: string): Token[] {
  const chars = Array.from(text.normalize('NFC').toLowerCase());
  const out: Token[] = [];
  let word: string[] = [];
  const flush = (): void => {
    if (word.length > 0) out.push({ kind: 'word', chars: word });
    word = [];
  };
  for (let at = 0; at < chars.length; at++) {
    const ch = chars[at]!;
    if (isInvisibleChar(ch)) continue;
    if (LETTER.test(ch) || MARK.test(ch) || DIGIT.test(ch) || ch === ZWNJ) {
      word.push(ch);
      continue;
    }
    const prev = chars[at - 1] ?? '';
    const next = chars[at + 1] ?? '';
    if (APOSTROPHES.has(ch) && word.length > 0 && LETTER.test(next)) continue;
    if (NUMBER_PUNCTUATION.has(ch) && DIGIT.test(prev) && DIGIT.test(next)) {
      flush();
      continue;
    }
    const long = LONG_PAUSES.has(ch);
    if (long || SHORT_PAUSES.has(ch)) {
      flush();
      const last = out[out.length - 1];
      // "?!", "..." and ", —" are one pause, as long as the longest of them
      if (last && last.kind === 'pause') {
        last.long ||= long;
        last.letters += ch;
      } else {
        out.push({ kind: 'pause', long, letters: ch });
      }
      continue;
    }
    // a space, a hyphen, a quotation mark, a symbol: the word ends, nothing is said
    flush();
  }
  flush();
  return out;
}

/** A word's letters and its digits, apart: "2ê" is two words, du and ê. */
function parts(chars: string[]): Array<{ digit: number } | { letters: string[] }> {
  const out: Array<{ digit: number } | { letters: string[] }> = [];
  let letters: string[] = [];
  for (const ch of chars) {
    if (DIGIT.test(ch)) {
      if (letters.length > 0) out.push({ letters });
      letters = [];
      const code = ch.codePointAt(0)!;
      // ASCII, Arabic-Indic (٠) and the Persian forms (۰) Soranî keyboards type
      const digit =
        code >= 0x06f0 && code <= 0x06f9 ? code - 0x06f0 : code >= 0x0660 && code <= 0x0669 ? code - 0x0660 : Number(ch);
      if (Number.isInteger(digit) && digit >= 0 && digit <= 9) out.push({ digit });
    } else {
      letters.push(ch);
    }
  }
  if (letters.length > 0) out.push({ letters });
  return out;
}

/**
 * The sounds of a Kurdish text, in order.
 *
 * `script` says which script the text is in; without it, the one most of its
 * letters are in. A word in the other script (a name, a loanword) is still
 * read by its own letters' rules, so no letter goes unread. Digits are said as
 * their names in the text's language: a number read out moves the mouth for
 * about as long as it takes to say.
 *
 * Pauses come only between words: one before the first word or after the last
 * would be silence the recording's own edges already are.
 */
export function textToSounds(text: string, options: { script?: LipsyncScript } = {}): Sound[] {
  const script = options.script ?? detectScript(text);
  const out: Sound[] = [];
  let word = -1;
  let pending: Token & { kind: 'pause' } = { kind: 'pause', long: false, letters: '' };
  let pendingPause = false;

  const readWord = (chars: string[], arabic: boolean): void => {
    const before = out.length;
    // a pause waits until a word follows it, so none is left trailing
    if (pendingPause && word >= 0) {
      out.push({
        viseme: 'rest',
        kind: 'pause',
        weight: pending.long ? LONG_PAUSE_WEIGHT : SHORT_PAUSE_WEIGHT,
        word,
        letters: pending.letters,
        pause: pending.long ? 'long' : 'short',
      });
    }
    const at = out.length;
    if (arabic) soraniWord(chars, word + 1, out);
    else kurmanciWord(chars, word + 1, out);
    if (out.length === at) {
      out.length = before; // nothing said: the pause stays pending for the next word
      return;
    }
    pendingPause = false;
    word += 1;
  };

  for (const token of tokens(text)) {
    if (token.kind === 'pause') {
      if (pendingPause) {
        pending = { kind: 'pause', long: pending.long || token.long, letters: pending.letters + token.letters };
      } else {
        pending = token;
        pendingPause = true;
      }
      continue;
    }
    for (const part of parts(token.chars)) {
      if ('digit' in part) {
        const name = DIGIT_NAMES[script][part.digit]!;
        readWord(Array.from(name), script === 'arabic');
      } else {
        readWord(part.letters, part.letters.some((ch) => ARABIC_SCRIPT.test(ch)));
      }
    }
  }
  return out;
}
