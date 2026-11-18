import { foldDiacritics, isArabicScript, isSoraniDialect } from '@kurda/shared';
import { PUNCTUATION, gradingKey } from './exercises.js';
import type { ExerciseType } from './repository.js';

/**
 * An exercise's texts as words, and which language each text is in.
 *
 * Word-bank tiles drawn from the session's other items must be in the answer's language (an English tile among Kurdish
 * ones gives itself away), and prompt words are looked up by their language. Payloads do not record language, so it is
 * inferred. Arabic-script courses (Soranî) tell by script. Latin-script courses (Kurmancî) tell by position in the
 * payload: a match card is Kurdish and its partner the meaning, a listening clip is Kurdish, a translation's answer is
 * Kurdish unless its `say` names other Kurdish (the audio studio's rule, `primaryAudioTarget`), and a question, which
 * may mix the two, by its words (`leaning`).
 */

/** An exercise of a session, as what it delivers beside its payload is worked out from. */
export interface SessionItem {
  type: ExerciseType;
  payload: unknown;
  /** the variety of Kurdish of the item's course */
  dialect: string | null | undefined;
  /** what this session shuffles the item with (`${sessionId}:${exerciseId}`) */
  seed: string;
}

/** Kurdish, or what it means (English). */
export type Lang = 'ku' | 'meaning';

export interface LangText {
  text: string;
  lang: Lang;
}

/** The variety a course's dialect is, as the dictionary files its headwords. */
export type Variety = 'kurmanji' | 'sorani';

export function varietyOf(dialect: string | null | undefined): Variety {
  return isSoraniDialect(dialect) ? 'sorani' : 'kurmanji';
}

const EDGES = new RegExp(`^${PUNCTUATION}+|${PUNCTUATION}+$`, 'gu');

/** A text's words as tiles show them: split at spaces, punctuation trimmed from both ends of each. */
export function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(EDGES, ''))
    .filter((word) => gradingKey(word) !== '');
}

/** What two words are compared by: as grading compares them, a diacritic slip being the same word. */
export function foldedKey(word: string): string {
  return foldDiacritics(gradingKey(word));
}

const LATIN_LETTER = /[A-Za-zÀ-ÖØ-öø-ɏ]/;

/**
 * The language of a text given what its payload position says (`role`, null when it says nothing). In an Arabic-script
 * course the script decides and must agree with `role`; mixed-script or letterless text is in neither. In a
 * Latin-script course `role` decides, and Arabic-script text is in neither.
 */
export function langOf(text: string, role: Lang | null, dialect: string | null | undefined): Lang | null {
  const arabic = isArabicScript(text);
  if (varietyOf(dialect) === 'kurmanji') return arabic ? null : role;
  if (arabic === LATIN_LETTER.test(text)) return null;
  const lang: Lang = arabic ? 'ku' : 'meaning';
  return role === null || role === lang ? lang : null;
}

const KURMANCI_LETTER = /[êîûçşÊÎÛÇŞ]/;

/** Short Kurmancî words that are no English word: what marks Kurmancî written without ê î û ç ş. */
const KURMANCI_WORDS = new Set(['ez', 'tu', 'ew', 'em', 'min', 'te', 'wan', 'ev', 'ji', 'bi', 'li', 'di', 've', 'ser', 'ye', 'im', 'ne', 'na', 'ku', 'spas', 'silav']);

/** Common English words: what marks English. A few are Kurmancî words too (me, in, do, her), and those count for both. */
const ENGLISH_WORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'and', 'or', 'but', 'not', 'no', 'yes',
  'is', 'am', 'are', 'was', 'were', 'be', 'do', 'does', 'did', 'have', 'has', 'what', 'which', 'who', 'where', 'when',
  'why', 'how', 'this', 'that', 'it', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'my', 'your', 'his', 'her', 'our',
  'their', 'there', 'here', 'english', 'kurdish', 'say', 'mean', 'means',
]);

/** Words of a session already known to be Kurdish, or meanings, by `gradingKey`. */
export interface Lexicon {
  ku: ReadonlySet<string>;
  meaning: ReadonlySet<string>;
}

const NO_LEXICON: Lexicon = { ku: new Set(), meaning: new Set() };

/**
 * Which way a Latin-script text's words lean: Kurdish when more look Kurdish (ê î û ç ş, a short Kurmancî word, a word
 * the session places as Kurdish) than English, the meaning when the reverse, null when even.
 */
export function leaning(words: readonly string[], lexicon: Lexicon = NO_LEXICON): Lang | null {
  let ku = 0;
  let en = 0;
  for (const word of words) {
    const key = gradingKey(word);
    if (KURMANCI_LETTER.test(word) || KURMANCI_WORDS.has(key) || lexicon.ku.has(key)) ku++;
    if (ENGLISH_WORDS.has(key) || lexicon.meaning.has(key)) en++;
  }
  return ku === en ? null : ku > en ? 'ku' : 'meaning';
}

/** What a session knows of its words' languages, from the texts its items place. */
export function lexiconOf(items: ReadonlyArray<Pick<ItemWords, 'texts'>>): Lexicon {
  const ku = new Set<string>();
  const meaning = new Set<string>();
  for (const item of items) {
    for (const t of item.texts) for (const word of wordsOf(t.text)) (t.lang === 'ku' ? ku : meaning).add(gradingKey(word));
  }
  return { ku, meaning };
}

/** What an exercise says about its words. */
export interface ItemWords {
  /** the main accepted answer of an item answered by typing it (translate, listening), and its language; null when it cannot be told */
  answer: LangText | null;
  /** every accepted answer of such an item */
  accepted: string[];
  /** its texts whose language is known: words for other items' tiles, and for telling a question's words apart */
  texts: LangText[];
  /** Kurdish it pairs with a meaning: a match pair, a one-word translation, a one-word question and its one-word answer */
  pairs: Array<{ ku: string; meaning: string }>;
  /** the language of the whole prompt, when the item says so (a translation into Kurdish asks in English) */
  promptLang: Lang | null;
}

const same = (a: string, b: string): boolean => gradingKey(a) === gradingKey(b);

/** The one word a text is, or null when it is more than one. */
export function oneWord(text: string | null): string | null {
  const words = text === null ? [] : wordsOf(text);
  return words.length === 1 ? words[0]! : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function strs(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => str(v) !== null) : [];
}

function field(value: unknown, name: string): string | null {
  return value && typeof value === 'object' ? str((value as Record<string, unknown>)[name]) : null;
}

/**
 * The language a translation is answered in. In a Latin-script course the answer is Kurdish unless `say` names Kurdish
 * that is none of the answers (the Kurdish is then the prompt); if the answer leans the other way and the prompt this
 * way, the item reads backwards and is not told.
 */
function translationLang(first: string, prompt: string, say: string | null, accepted: string[], dialect: string | null | undefined): Lang | null {
  if (varietyOf(dialect) === 'sorani') return langOf(first, null, dialect);
  const lang: Lang = say !== null && !accepted.some((a) => same(a, say)) ? 'meaning' : 'ku';
  const answer = leaning(wordsOf(first));
  return answer !== null && answer !== lang && leaning(wordsOf(prompt)) === lang ? null : lang;
}

/** Which of a Latin-script word and its meaning is the Kurdish one, by how each leans; null when they do not tell. */
function kurdishOf(a: string, b: string): string | null {
  const la = leaning([a]);
  const lb = leaning([b]);
  if (la === 'ku' && lb !== 'ku') return a;
  if (lb === 'ku' && la !== 'ku') return b;
  return null;
}

/**
 * Read an exercise payload for its words. Payloads are validated on write, but this reads defensively: delivery must
 * never fail over an extra.
 */
export function itemWords(type: ExerciseType, payload: unknown, dialect: string | null | undefined): ItemWords {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const latin = varietyOf(dialect) === 'kurmanji';
  const out: ItemWords = { answer: null, accepted: [], texts: [], pairs: [], promptLang: null };
  const place = (text: string | null, role: Lang | null): Lang | null => {
    const lang = text === null ? null : langOf(text, role, dialect);
    if (lang) out.texts.push({ text: text!, lang });
    return lang;
  };
  const pair = (ku: string | null, meaning: string | null): void => {
    if (ku !== null && meaning !== null && langOf(ku, 'ku', dialect) && langOf(meaning, 'meaning', dialect)) out.pairs.push({ ku, meaning });
  };
  const say = str(p.say);
  const prompt = str(p.prompt);

  switch (type) {
    case 'match_pairs':
      for (const pr of Array.isArray(p.pairs) ? p.pairs : []) {
        const left = field(pr, 'left');
        const right = field(pr, 'right');
        place(left, 'ku');
        place(right, 'meaning');
        pair(left, right);
      }
      break;
    case 'translate': {
      out.accepted = strs(p.accepted);
      const first = out.accepted[0];
      const lang = first !== undefined && prompt !== null ? translationLang(first, prompt, say, out.accepted, dialect) : null;
      if (!lang || !place(first!, lang)) break;
      out.answer = { text: first!, lang };
      if (lang === 'ku') {
        out.promptLang = 'meaning';
        place(prompt, 'meaning');
      } else {
        place(say, 'ku');
      }
      const asked = oneWord(prompt);
      for (const answer of out.accepted.map(oneWord)) {
        if (asked !== null && answer !== null) pair(lang === 'ku' ? answer : asked, lang === 'ku' ? asked : answer);
      }
      break;
    }
    case 'listening': {
      out.accepted = strs(p.accepted);
      const first = out.accepted[0] ?? null;
      if (place(first, 'ku')) out.answer = { text: first!, lang: 'ku' };
      break;
    }
    case 'writing':
      place(strs(p.accepted)[0] ?? null, 'ku');
      break;
    case 'speaking':
      place(str(p.reference), 'ku');
      break;
    case 'multiple_choice': {
      place(say, 'ku');
      const options = strs(p.options);
      // the options are Kurdish when the Kurdish to hear is one of them, and meanings when the prompt asks about it
      const asks = say !== null && prompt !== null && ` ${wordsOf(prompt).map(gradingKey).join(' ')} `.includes(` ${wordsOf(say).map(gradingKey).join(' ')} `);
      const optionRole: Lang | null = say === null ? null : options.some((o) => same(o, say)) ? 'ku' : asks ? 'meaning' : null;
      if (optionRole || !latin) for (const option of options) place(option, optionRole);
      // a one-word question and its one-word answer are a word and its meaning
      const asked = oneWord(prompt);
      const told = oneWord(typeof p.correctIndex === 'number' ? (options[p.correctIndex] ?? null) : null);
      if (asked === null || told === null) break;
      const ku = !latin ? (langOf(asked, 'ku', dialect) ? asked : told) : optionRole === 'ku' ? told : optionRole === 'meaning' ? asked : kurdishOf(asked, told);
      if (ku !== null) pair(ku, ku === asked ? told : asked);
      break;
    }
    case 'conversation':
      for (const line of Array.isArray(p.lines) ? p.lines : []) {
        place(field(line, 'text'), 'ku');
        place(field(line, 'en'), 'meaning');
      }
      break;
  }
  return out;
}
