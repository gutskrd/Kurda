import { answerKey, letterKey, type PromptToken } from '@kurda/shared';
import { englishKey } from './english-answer.js';
import { gradingKey } from './exercises.js';
import { itemWords, langOf, leaning, lexiconOf, oneWord, varietyOf, type Lang, type Lexicon, type SessionItem, type Variety } from './item-words.js';
import { glossaryKey, roadGlossary, type Glossary, type GlossaryEntry } from './road-glossary.js';

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
 * The language of each prompt word, in order (null where unknown). Arabic-script Kurdish tells by script, and a prompt
 * with a stated language (`promptLang`) is in it. Otherwise a question may quote Kurdish inside English or the reverse,
 * so each stretch between quote marks follows its words' leaning, and a neutral stretch follows the whole prompt.
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

/** What a session's item shows as words: its prompt, and a conversation's lines. */
export interface ItemTokens {
  prompt?: PromptToken[];
  lines?: Array<PromptToken[] | null>;
}

/** The language of an item's prompt by what it asks, where the ask says: a Kurdish line, or an English one to put into Kurdish. */
const ASK_LANG: Readonly<Record<string, Lang>> = {
  meaning: 'ku',
  picture: 'ku',
  missing: 'ku',
  reply: 'ku',
  repeat: 'ku',
  'to-english': 'ku',
  'to-kurdish': 'meaning',
  'choose-kurdish': 'meaning',
};

/** The items whose prompt is a line a learner reads: a listening item's prompt only says what to do. */
const WORDED: ReadonlySet<string> = new Set(['translate', 'multiple_choice', 'conversation', 'speaking', 'writing']);

/** English words too common to point at one Kurdish word on their own; they are matched only by a meaning that is exactly them. */
const ENGLISH_COMMON: ReadonlySet<string> = new Set([
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'am', 'is', 'are', 'be', 'do', 'does', 'not', 'to', 'of', 'and', 'or', 'in', 'on', 'at', 'for', 'from', 'with', 'this',
  'that', 'there', 'here', 'what', 'will', 'would', 'have', 'us',
]);

/** An English word with a plural, -ing or -ed ending taken off, so "eating" meets "I eat" and "apples" meets "apple". */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** An English text as the words a meaning is matched by: contractions spelled out, articles left out (`englishKey`). */
const englishWords = (text: string): string[] => englishKey(gradingKey(text)).split(' ').filter(Boolean);

/**
 * The Kurdish words an English word of a prompt is said with in the item's answer, in their dictionary form: the answer's
 * words whose meanings are exactly that word, or else, for a word that is not one of the commonest, contain it.
 * "eating" in "I’m eating the apple" points at "dixwim" and so gives "xwarin"; "the" points at nothing.
 */
function hintsFor(word: string, answer: ReadonlyArray<{ form: string; entry: GlossaryEntry }>): string[] {
  const out: string[] = [];
  for (const w of englishWords(word)) {
    const exact = answer.filter(({ entry }) => entry.en.some((m) => englishWords(m).join(' ') === w));
    const near = exact.length > 0 || ENGLISH_COMMON.has(w) ? [] : answer.filter(({ entry }) => entry.en.some((m) => englishWords(m).map(stem).includes(stem(w))));
    for (const { form, entry } of exact.length > 0 ? exact : near) out.push(entry.base ?? form.toLowerCase());
  }
  return out;
}

/** Meanings in order, each once, at most three, and never the word itself. */
function distinct(word: string, found: readonly string[]): string[] {
  const meanings: string[] = [];
  const seen = new Set(['', gradingKey(word)]);
  for (const meaning of found) {
    if (meanings.length === MEANINGS_MAX || seen.has(gradingKey(meaning))) continue;
    seen.add(gradingKey(meaning));
    meanings.push(meaning);
  }
  return meanings;
}

/** The line's tokens when any word in it is known or held back; a line knowing nothing is sent as nothing. */
const worthSending = (tokens: PromptToken[]): PromptToken[] | undefined => (tokens.some((t) => t.meanings || t.withheld) ? tokens : undefined);

/**
 * The words of a session's items, each word carrying what it means (`PromptToken`): a translation's, a question's, a
 * spoken or written item's prompt, and a conversation's lines. Two steps: `lookups` lists the Kurdish words the
 * dictionary is asked about in one statement, then `finish` builds tokens from its answers in the same order.
 *
 * A Kurdish word's meanings come from the session itself (a match card and its partner, a one-word translation, a
 * one-word question and answer), then the course's own word list (`roadGlossary`, which knows inflected forms and the
 * little words), then the dictionary for words the list does not have. An English word of a line to put into Kurdish
 * is given the Kurdish words it is said with in the answer, in their dictionary form, never the answer's own forms.
 * A word whose meaning would give the answer away (one of a question's options or a part of one, a translation's whole
 * answer) is marked `withheld` instead.
 */
export function promptTokens(
  items: readonly SessionItem[],
  glossary: Glossary = roadGlossary(),
): {
  lookups: DictionaryLookup[];
  finish: (glosses: ReadonlyArray<readonly string[]>) => ItemTokens[];
} {
  const words = items.map((item) => itemWords(item.type, item.payload, item.dialect));
  const lexicon = lexiconOf(words);
  const listed = (variety: Variety, word: string): GlossaryEntry | undefined => (glossary.dialect === variety ? glossary.words.get(glossaryKey(word)) : undefined);

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

  const payloadOf = (item: SessionItem): Record<string, unknown> => (item.payload && typeof item.payload === 'object' ? (item.payload as Record<string, unknown>) : {});
  const prompts = items.map((item, i) => {
    const payload = payloadOf(item);
    const prompt = payload.prompt;
    if (!WORDED.has(item.type) || typeof prompt !== 'string') return null;
    const asked = typeof payload.ask === 'string' ? ASK_LANG[payload.ask] : undefined;
    // the ask names the language of a Latin-script line; Arabic script tells by itself
    const stated = asked && varietyOf(item.dialect) === 'kurmanji' ? asked : words[i]!.promptLang;
    return { prompt, langs: wordLangs(prompt, stated, item.dialect, lexicon) };
  });
  const lines = items.map((item) => {
    const list = item.type === 'conversation' ? payloadOf(item).lines : undefined;
    return Array.isArray(list) ? list.map((line) => (line && typeof (line as { text?: unknown }).text === 'string' ? (line as { text: string }).text : '')) : null;
  });

  const lookups: DictionaryLookup[] = [];
  const lookupAt = new Map<string, number>();
  const lookUp = (variety: Variety, word: string): void => {
    if (listed(variety, word)) return;
    for (const key of dictionaryKeys(word)) {
      if (lookupAt.has(`${variety}|${key}`)) continue;
      lookupAt.set(`${variety}|${key}`, lookups.length);
      lookups.push({ variety, key });
    }
  };
  items.forEach((item, i) => {
    const variety = varietyOf(item.dialect);
    const p = prompts[i];
    if (p) wordsIn(p.prompt).forEach((word, w) => p.langs[w] === 'ku' && lookUp(variety, word));
    for (const line of lines[i] ?? []) for (const word of wordsIn(line)) if (langOf(word, 'ku', item.dialect)) lookUp(variety, word);
  });

  const finish = (glosses: ReadonlyArray<readonly string[]>): ItemTokens[] => {
    /** A Kurdish word's meanings, from the session, the course's list, then the dictionary, and the word it comes from. */
    const kurdish = (variety: Variety, word: string): { found: string[]; base?: string } => {
      const entry = listed(variety, word);
      const found = [
        ...(own.get(`${variety}|ku|${gradingKey(word)}`) ?? []),
        ...(entry?.en ?? []),
        ...(entry ? [] : dictionaryKeys(word).flatMap((k) => glosses[lookupAt.get(`${variety}|${k}`) ?? -1] ?? [])),
      ];
      return entry?.base ? { found, base: entry.base } : { found };
    };

    return items.map((item, i): ItemTokens => {
      const variety = varietyOf(item.dialect);
      const payload = payloadOf(item);
      const out: ItemTokens = {};

      const p = prompts[i];
      if (p) {
        // what would hand the answer over: a translation's whole answers, a question's options and their parts
        const typed = item.type === 'translate' || item.type === 'writing';
        const options = Array.isArray(payload.options) ? payload.options.filter((o): o is string => typeof o === 'string') : [];
        const accepted = typed ? (words[i]!.accepted.length ? words[i]!.accepted : Array.isArray(payload.accepted) ? payload.accepted.filter((a): a is string => typeof a === 'string') : []) : [];
        const revealing = new Set(typed ? accepted.map(gradingKey) : options.flatMap(partsOf));
        const reveals = (meaning: string) => (typed ? [gradingKey(meaning)] : partsOf(meaning)).some((part) => revealing.has(part));
        // the Kurdish an English line is said as, word by word with what each means, for its words' hints
        const correct = typeof payload.correctIndex === 'number' ? options[payload.correctIndex] : undefined;
        const kurdishAnswer = typed ? accepted[0] : payload.ask === 'choose-kurdish' ? correct : undefined;
        const answer = (kurdishAnswer ? wordsIn(kurdishAnswer) : []).flatMap((form) => {
          const entry = listed(variety, form);
          return entry ? [{ form, entry }] : [];
        });

        let w = 0;
        const tokens = tokenize(p.prompt).map((token): PromptToken => {
          if (!token.word) return { text: token.text };
          const lang = p.langs[w++] ?? null;
          const key = gradingKey(token.text);
          const sides: Lang[] = lang ? [lang] : ['ku', 'meaning'];
          let base: string | undefined;
          const found = sides.flatMap((side) => {
            if (side === 'ku') {
              const k = kurdish(variety, token.text);
              base = k.base;
              return k.found;
            }
            return [...(own.get(`${variety}|meaning|${key}`) ?? []), ...hintsFor(token.text, answer)];
          });
          if (found.some(reveals)) return { text: token.text, withheld: true };
          const meanings = distinct(token.text, found);
          if (meanings.length === 0) return { text: token.text };
          return base ? { text: token.text, meanings, base } : { text: token.text, meanings };
        });
        const sent = worthSending(tokens);
        if (sent) out.prompt = sent;
      }

      const said = lines[i];
      if (said) {
        const lineTokens = said.map((line) => {
          const tokens = tokenize(line).map((token): PromptToken => {
            if (!token.word || !langOf(token.text, 'ku', item.dialect)) return { text: token.text };
            const { found, base } = kurdish(variety, token.text);
            const meanings = distinct(token.text, found);
            if (meanings.length === 0) return { text: token.text };
            return base ? { text: token.text, meanings, base } : { text: token.text, meanings };
          });
          return worthSending(tokens) ?? null;
        });
        if (lineTokens.some((t) => t !== null)) out.lines = lineTokens;
      }
      return out;
    });
  };

  return { lookups, finish };
}
