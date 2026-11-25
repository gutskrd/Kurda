/**
 * Which Kurdish texts in an exercise want a native recording, and the key a recording is filed under. The audio studio
 * and the API's delivery must agree on which text is which. One recording serves every place a sentence is said, so
 * "Spas, Hamo!", "spas hamo" and "Hamo: Spas, Hamo." share it: the key is what is said, not how it is written.
 */
import { normalizeKurdish } from './kurdish-text.js';
import { isRecord } from './sanitize.js';

/** The longest recording worth keeping: one sentence at a learner's pace. */
export const LESSON_AUDIO_MAX_SECONDS = 15;

/** The longest text that can be recorded; the same bound as an exercise's `say`. */
export const LESSON_AUDIO_TEXT_MAX = 300;

/**
 * Characters that change nothing said: bidi marks from copy and paste (LRM, RLM, the Arabic letter mark, embeddings,
 * isolates), zero-width spaces, the soft hyphen and tatweel. The zero-width non-joiner stays, since in older Soranî
 * spelling it decides whether ه is the consonant or the vowel.
 */
const INVISIBLE = /[\u00AD\u061C\u0640\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;

/**
 * Letters Kurdish types two ways: the Arabic kaf and yeh beside the Kurdish ones, and a Turkish keyboard's ı and İ. The
 * same table as the dictionary's alphabet (web/scripts/ferheng-alphabet.ts), including ه → ھ.
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

/** One character with the variants folded, for matching across keyboards without changing length, so callers keep their indices. */
export function foldVariantChar(ch: string): string {
  return VARIANTS[ch] ?? ch;
}

/** Whether a character is one of the invisible ones above. */
export function isInvisibleChar(ch: string): boolean {
  INVISIBLE.lastIndex = 0;
  return INVISIBLE.test(ch);
}

/** Quotation marks around the whole text, which nobody says aloud. */
const EDGE_QUOTES = /^["“”«»„]+|["“”«»„]+$/g;
/** Sentence punctuation at the end, Latin and Arabic-script alike. */
const TRAILING_PUNCTUATION = /[\s.!?…؟۔,،;؛:]+$/;
/** A character's name written in front of their line as a label ("Hamo: …"), which nobody reads aloud. */
const SPEAKER_LABEL = /^(?:hamo|xezo|hevalo)\s*:\s*(?=\S)/u;
/**
 * Punctuation and quotes inside a sentence, Latin and Arabic-script alike: they shape how it is written, not which
 * words are said, so "Spas, Hamo" and "Spas Hamo" are one recording.
 */
const INNER_MARKS = /[\s"“”«»„‘’'`.!?…,;:·()[\]{}/—–\-؟۔،؛]+/gu;

/**
 * The key a recording of `text` is filed under: `normalizeKurdish`, lower case, variants folded, invisible characters
 * dropped, a character's name label in front dropped, and every quote and punctuation mark read as a word break.
 * Diacritics stay: sêv and sev are said differently. Empty when nothing is left to say ("?", "  ").
 */
export function lessonAudioKey(text: string): string {
  let key = normalizeKurdish(
    text
      .normalize('NFC')
      .replace(INVISIBLE, '')
      .replace(VARIANT_CHARS, (ch) => VARIANTS[ch] ?? ch),
  ).toLowerCase();
  // Quotes and punctuation can wrap each other ("Spas!".), so strip until nothing changes.
  for (let before = ''; before !== key; ) {
    before = key;
    key = key.replace(EDGE_QUOTES, '').replace(TRAILING_PUNCTUATION, '').trim();
  }
  return key.replace(SPEAKER_LABEL, '').replace(INNER_MARKS, ' ').trim();
}

/**
 * Whether a string leaves something to say once keyed and fits one recording. A text past LESSON_AUDIO_TEXT_MAX could
 * never be saved, so it is not asked for at all rather than listed as missing for ever.
 */
function sayable(v: unknown): v is string {
  return typeof v === 'string' && normalizeKurdish(v).length <= LESSON_AUDIO_TEXT_MAX && lessonAudioKey(v) !== '';
}

function firstOf(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : undefined;
}

/**
 * The Kurdish texts an exercise wants recorded, as written in its payload so a client can look one up by the text it
 * shows, one per key:
 *
 *   any type                     `say`, when set, always first
 *   translate                    the first accepted answer, only without `say`
 *   writing                      the first accepted answer, except a missing-word item with `say`, whose answer is only
 *                                the gap's word
 *   listening                    the first accepted transcription: the clip itself
 *   speaking                     the reference to imitate
 *   match_pairs                  every left-hand card
 *   multiple_choice              only `say`, since only the author knows whether its Kurdish is in the prompt or options
 *
 * A translation into Kurdish is heard by its first answer; one from Kurdish names its Kurdish with `say` and has English
 * answers, so it wants `say` alone. Malformed payloads yield nothing rather than throwing, since this runs over stored
 * content.
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
      if (!sayable(p.say)) add(firstOf(p.accepted));
      break;
    case 'writing':
      // A missing-word item's answer is only the gap's word; the whole line, its `say`, is what is heard.
      if (!(p.ask === 'missing' && sayable(p.say))) add(firstOf(p.accepted));
      break;
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

/** a letter, a mark, a digit, or the ZWNJ that sits inside a Soranî word */
const WORD = String.raw`[\p{L}\p{M}\p{N}\u200c]`;

/**
 * Whether `text` appears as whole words in what `prompt` shows, both keyed like recordings. The API plays a multiple-choice
 * or translate item's model before the answer only when its Kurdish is on screen like this (lessonaudio/delivery.ts), and
 * the road's check asks the same of every item with `say`.
 */
export function shownInPrompt(prompt: unknown, text: string): boolean {
  if (typeof prompt !== 'string') return false;
  const key = lessonAudioKey(text);
  if (key === '') return false;
  const escaped = key.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return new RegExp(`(?<!${WORD})${escaped}(?!${WORD})`, 'u').test(lessonAudioKey(prompt));
}

/**
 * The one text a learner hears as an exercise's model: `say` when set, else the first accepted answer (translate,
 * writing, listening) or the reference (speaking). Match-pairs and multiple choice without `say` have none. It is always
 * the first of `lessonAudioTargets` when there is one.
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
