import { answerKey, letterKey, type PromptToken } from '@kurda/shared';
import { gradingKey } from './exercises.js';
import { itemWords, langOf, leaning, lexiconOf, oneWord, varietyOf, type Lang, type Lexicon, type SessionItem, type Variety } from './item-words.js';

/** At most this many meanings of a word. */
export const MEANINGS_MAX = 3;

/** A letter, a mark, a digit or the ZWNJ (which sits inside a Soranî word); an apostrophe or hyphen between two of them is inside the word too. */
const WORD = /[\p{L}\p{M}\p{N}‌]+(?:['’-][\p{L}\p{M}\p{N}‌]+)*/gu;

/** A prompt as its words and what lies between them, in order: their texts joined are the prompt. */
export function tokenize(prompt: string): Array<{ text: string; word: boolean }> {
  const out: Array<{ text: string; word: boolean }> = [];
  let at = 0;
  for (const m of prompt.matchAll(WORD)) {
    if (m.index > at) out.push({ text: prompt.slice(at, m.index), word: false });
    out.push({ text: m[0], word: true });
    at = m.index + m[0].length;
  }
  if (at < prompt.length) out.push({ text: prompt.slice(at), word: false });
  return out;
}

const QUOTE = /["“”«»„]/;

const wordsIn = (text: string): string[] => tokenize(text).flatMap((t) => (t.word ? [t.text] : []));

/**
 * The language of each word of a prompt, in order; null where it cannot be
 * told. Arabic-script Kurdish tells by script, and a prompt the item says is
 * in one language (`promptLang`) is in it. Otherwise a question may hold
 * Kurdish in quotes inside English, or English inside Kurdish, so each stretch
 * between quote marks goes the way its words lean, and one that leans no way
 * goes the way the whole prompt does.
 */
export function wordLangs(prompt: string, promptLang: Lang | null, dialect: string | null | undefined, lexicon: Lexicon): Array<Lang | null> {
  if (varietyOf(dialect) === 'sorani') return wordsIn(prompt).map((word) => langOf(word, null, dialect));
  if (promptLang) return wordsIn(prompt).map(() => promptLang);
  const whole = leaning(wordsIn(prompt), lexicon);
  return prompt.split(QUOTE).flatMap((part) => {
    const words = wordsIn(part);
    const lang = leaning(words, lexicon) ?? whole;
    return words.map(() => lang);
  });
}

/** What a Kurdish word is looked up by in the dictionary: its letters, diacritics kept (`headword_normalized`), and again with an Arabic or Persian keyboard's letters read as Kurdish. */
export function dictionaryKeys(word: string): string[] {
  return [...new Set([letterKey(word), letterKey(answerKey(word))])].filter((key) => key !== '');
}

/** A Kurdish word to look up in the dictionary: its key, in its variety's headwords. */
export interface DictionaryLookup {
  variety: Variety;
  key: string;
}

/** A text's pieces as an answer could be named: the whole, and what lies between slashes, commas, semicolons and brackets ("girl/daughter", "Agir (fire)"). */
function partsOf(text: string): string[] {
  return [text, ...text.split(/[/,;()]/)].map(gradingKey).filter((key) => key !== '');
}

/**
 * The prompts of a session's translate, multiple-choice and conversation items
 * as words, each word the course knows carrying its meanings (`PromptToken`),
 * in two steps: what to look up in the dictionary (`lookups`, every Kurdish word
 * once, for one statement), then the tokens with what it found (`finish`, given
 * each lookup's meanings in the same order). An item none of whose words has a
 * meaning gets none (undefined).
 *
 * A word's meanings come first from the session itself — a match card and its
 * partner, either way round; a one-word translation; a one-word question and its
 * one-word answer — and then, for a Kurdish word, from the dictionary. Never one
 * that hands the item's answer over: a word meaning one of a multiple-choice
 * item's options (or a part of one) has no meanings there, nor one meaning a
 * translation's whole answer.
 */
export function promptTokens(items: readonly SessionItem[]): {
  lookups: DictionaryLookup[];
  finish: (glosses: ReadonlyArray<readonly string[]>) => Array<PromptToken[] | undefined>;
} {
  const words = items.map((item) => itemWords(item.type, item.payload, item.dialect));
  const lexicon = lexiconOf(words);

  // the session's own pairs, by variety, the language of the word, and its key: a side of one word is looked up by it
  const own = new Map<string, string[]>();
  const add = (variety: Variety, lang: Lang, word: string | null, meaning: string) => {
    if (word === null) return;
    const at = `${variety}|${lang}|${gradingKey(word)}`;
    own.set(at, [...(own.get(at) ?? []), meaning.trim()]);
  };
  items.forEach((item, i) => {
    for (const { ku, meaning } of words[i]!.pairs) {
      add(varietyOf(item.dialect), 'ku', oneWord(ku), meaning);
      add(varietyOf(item.dialect), 'meaning', oneWord(meaning), ku);
    }
  });

  const prompts = items.map((item, i) => {
    const prompt = (item.payload as { prompt?: unknown } | null)?.prompt;
    if (!['translate', 'multiple_choice', 'conversation'].includes(item.type) || typeof prompt !== 'string') return null;
    return { prompt, langs: wordLangs(prompt, words[i]!.promptLang, item.dialect, lexicon) };
  });

  const lookups: DictionaryLookup[] = [];
  const lookupAt = new Map<string, number>();
  prompts.forEach((p, i) => {
    if (!p) return;
    const variety = varietyOf(items[i]!.dialect);
    wordsIn(p.prompt).forEach((word, w) => {
      if (p.langs[w] !== 'ku') return;
      for (const key of dictionaryKeys(word)) {
        if (lookupAt.has(`${variety}|${key}`)) continue;
        lookupAt.set(`${variety}|${key}`, lookups.length);
        lookups.push({ variety, key });
      }
    });
  });

  const finish = (glosses: ReadonlyArray<readonly string[]>): Array<PromptToken[] | undefined> =>
    prompts.map((p, i) => {
      if (!p) return undefined;
      const item = items[i]!;
      const variety = varietyOf(item.dialect);
      // what would hand the answer over: a translation's whole answers, a question's options and their parts
      const translation = item.type === 'translate';
      const options = (item.payload as { options?: unknown }).options;
      const answers = translation ? words[i]!.accepted.map(gradingKey) : (Array.isArray(options) ? options : []).filter((o) => typeof o === 'string').flatMap(partsOf);
      const revealing = new Set(answers);
      const reveals = (meaning: string) => (translation ? [gradingKey(meaning)] : partsOf(meaning)).some((part) => revealing.has(part));

      let known = false;
      let w = 0;
      const tokens = tokenize(p.prompt).map((token): PromptToken => {
        if (!token.word) return { text: token.text };
        const lang = p.langs[w++] ?? null;
        const key = gradingKey(token.text);
        const sides: Lang[] = lang ? [lang] : ['ku', 'meaning'];
        const found = [
          ...sides.flatMap((side) => own.get(`${variety}|${side}|${key}`) ?? []),
          ...(lang === 'ku' ? dictionaryKeys(token.text).flatMap((k) => glosses[lookupAt.get(`${variety}|${k}`) ?? -1] ?? []) : []),
        ];
        if (found.some(reveals)) return { text: token.text };
        // each meaning once, as it first came, and never the word itself
        const meanings: string[] = [];
        const seen = new Set(['', key]);
        for (const meaning of found) {
          if (meanings.length === MEANINGS_MAX || seen.has(gradingKey(meaning))) continue;
          seen.add(gradingKey(meaning));
          meanings.push(meaning);
        }
        if (meanings.length === 0) return { text: token.text };
        known = true;
        return { text: token.text, meanings };
      });
      return known ? tokens : undefined;
    });

  return { lookups, finish };
}
