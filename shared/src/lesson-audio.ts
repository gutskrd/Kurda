/**
 * What a lesson needs to be heard: which Kurdish texts in an exercise want a
 * native recording, and the key a recording of one is filed under.
 *
 * One list for the three places that need it: the admin's audio studio shows
 * what is still to record, the API attaches recordings to the exercises it
 * delivers, and both have to agree on which text is which. The same sentence
 * recorded once serves every exercise that uses it, so "Spas." in one lesson
 * and "spas" in another are one recording, not two.
 */
import { normalizeKurdish } from './kurdish-text.js';

/** The longest recording worth keeping: one sentence, said at a learner's pace. */
export const LESSON_AUDIO_MAX_SECONDS = 15;

/** The longest text that can be recorded; the same bound as an exercise's `say`. */
export const LESSON_AUDIO_TEXT_MAX = 300;

/**
 * Characters that change nothing about what is said: bidi marks that ride in
 * on a copy and paste, zero-width spaces, the soft hyphen, and the Arabic
 * tatweel, which only stretches a letter. The zero-width non-joiner stays — in
 * older Soranî spelling it decides whether ه is the consonant or the vowel.
 */
const INVISIBLE = /[­ـ​‎‏‪-‮⁠⁦-⁩﻿]/g;

/**
 * Letters that are one letter in Kurdish typed two ways: the Arabic kaf and yeh
 * beside the Kurdish ones, and a Turkish keyboard's ı and İ, which Hawar does
 * not have. The same table, and the same reasons, as the dictionary's alphabet
 * (web/scripts/ferheng-alphabet.ts), including its choice of ه → ھ.
 */
const VARIANTS: Record<string, string> = {
  'ك': 'ک',
  'ي': 'ی',
  'ى': 'ی',
  'ه': 'ھ',
  'ۀ': 'ە',
  'ı': 'i',
  'İ': 'I',
};
const VARIANT_CHARS = new RegExp(`[${Object.keys(VARIANTS).join('')}]`, 'g');

/** Quotation marks around the whole text, which nobody says aloud. */
const EDGE_QUOTES = /^["“”«»„]+|["“”«»„]+$/g;
/** Sentence punctuation at the end, Latin and Arabic-script alike. */
const TRAILING_PUNCTUATION = /[\s.!?…؟۔,،;؛:]+$/;

/**
 * The key a recording of `text` is filed under.
 *
 * NFC with whitespace collapsed (`normalizeKurdish`), lower case, the letter
 * variants above folded, invisible characters dropped, surrounding quotes and
 * trailing sentence punctuation removed. Diacritics are kept: sêv and sev are
 * different words and are said differently.
 *
 * Empty when there is nothing left to say ("?", "  ").
 */
export function lessonAudioKey(text: string): string {
  let key = normalizeKurdish(
    text
      .normalize('NFC')
      .replace(INVISIBLE, '')
      .replace(VARIANT_CHARS, (ch) => VARIANTS[ch] ?? ch),
  ).toLowerCase();
  // quotes and punctuation can wrap each other ("Spas!".), so strip until nothing changes
  for (let before = ''; before !== key; ) {
    before = key;
    key = key.replace(EDGE_QUOTES, '').replace(TRAILING_PUNCTUATION, '').trim();
  }
  return key;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A string that leaves something to say once keyed. */
function sayable(v: unknown): v is string {
  return typeof v === 'string' && lessonAudioKey(v) !== '';
}

function firstOf(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : undefined;
}

/**
 * The Kurdish texts an exercise wants recorded, as they are written in its
 * payload (so a client can look one up by the text it shows), one per key.
 *
 *   any type                     `say`, when the author set one — always first
 *   translate, writing           the first accepted answer
 *   listening                    the first accepted transcription: the clip itself
 *   speaking                     the reference, the model to imitate
 *   match_pairs                  every left-hand card
 *   multiple_choice              only `say`: its Kurdish may be in the prompt or
 *                                among the options, and only the author knows which
 *
 * Translate and writing are authored English → Kurdish; an item going the
 * other way should name its Kurdish with `say`. Anything malformed yields
 * nothing rather than throwing: this runs over stored content.
 */
export function lessonAudioTargets(type: string, payload: unknown): string[] {
  const p = isRecord(payload) ? payload : {};
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (v: unknown): void => {
    if (!sayable(v)) return;
    const key = lessonAudioKey(v);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };

  add(p.say);
  switch (type) {
    case 'translate':
    case 'writing':
    case 'listening':
      add(firstOf(p.accepted));
      break;
    case 'speaking':
      add(p.reference);
      break;
    case 'match_pairs':
      if (Array.isArray(p.pairs)) for (const pair of p.pairs) add(isRecord(pair) ? pair.left : undefined);
      break;
  }
  return out;
}

/**
 * The one text a learner should hear as the model for an exercise: `say` when
 * set, else the first accepted answer (translate, writing, listening) or the
 * reference (speaking). Match-pairs has none — each card has its own — and so
 * has a multiple-choice item without `say`.
 */
export function primaryAudioTarget(type: string, payload: unknown): string | null {
  const p = isRecord(payload) ? payload : {};
  if (sayable(p.say)) return p.say;
  switch (type) {
    case 'translate':
    case 'writing':
    case 'listening': {
      const first = firstOf(p.accepted);
      return sayable(first) ? first : null;
    }
    case 'speaking':
      return sayable(p.reference) ? p.reference : null;
    default:
      return null;
  }
}
