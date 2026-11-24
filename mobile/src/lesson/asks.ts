/**
 * What an item asks (`ExerciseAsk`) and how that changes the screen, without React: the headline ("What does this
 * mean?", "Repeat after Hamo"), which lines and options are Kurdish (set in the display face), and the line's words
 * with their meanings, new words first. An item without an ask gets null from `askHeadline` and keeps its
 * exercise's usual headline.
 */
import { CHARACTER_NAMES, GAP, isSoraniDialect, type ExerciseAsk, type NewWord, type PromptToken } from '@kurda/shared';
import type { TranslationKey } from '../i18n/translations';
import type { Exercise } from './types';
import { knownVoice } from '../characters/voice';

/** A headline's key and parameters. */
interface Headline {
  key: TranslationKey;
  params?: Record<string, string>;
}

const PLAIN: Partial<Record<ExerciseAsk, TranslationKey>> = {
  meaning: 'lesson.ask.meaning',
  'choose-kurdish': 'lesson.ask.chooseKurdish',
  picture: 'lesson.ask.picture',
  reply: 'lesson.ask.reply',
  missing: 'lesson.ask.missing',
  'to-english': 'lesson.ask.toEnglish',
};

/**
 * The headline an item's ask gives it, or null to keep the exercise's own. `dialect` is the course's variety ("Write
 * this in Kurmancî"); `tiles` says a listening item is answered from word tiles ("Tap what you hear").
 */
export function askHeadline(exercise: Exercise, { dialect, tiles = false }: { dialect?: string | null; tiles?: boolean } = {}): Headline | null {
  const ask = exercise.ask;
  if (!ask) return null;
  const plain = PLAIN[ask];
  if (plain) return { key: plain };
  switch (ask) {
    case 'to-kurdish':
      return { key: isSoraniDialect(exercise.dialect ?? dialect) ? 'lesson.ask.toSorani' : 'lesson.ask.toKurmanci' };
    case 'hear':
      return { key: tiles ? 'lesson.listen.tapPrompt' : 'lesson.listen.prompt' };
    case 'repeat': {
      // "After someone" only when there is someone to hear: a recording by a character the app can draw.
      const voice = exercise.modelAudioUrl ? knownVoice(exercise.modelAudioVoice) : null;
      return voice ? { key: 'lesson.ask.repeatAfter', params: { name: CHARACTER_NAMES[voice.speaker] } } : { key: 'lesson.speak.prompt' };
    }
    default:
      return null;
  }
}

/** The bubble's line is English for the learner to put into Kurdish, rather than Kurdish to hear and read. */
export function lineIsEnglish(ask: ExerciseAsk | undefined): boolean {
  return ask === 'to-kurdish' || ask === 'choose-kurdish';
}

/** The options are Kurdish, set in the display face like the lesson's other Kurdish. */
export function optionsAreKurdish(ask: ExerciseAsk | undefined): boolean {
  return ask === 'reply' || ask === 'missing' || ask === 'choose-kurdish';
}

/** A word of the line with its meaning, and whether this item introduces it. */
export interface GlossToken extends PromptToken {
  fresh?: boolean;
}

/** A word normalised for comparison: lower case, surrounding punctuation stripped. */
function bare(text: string): string {
  return text
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
}

/** The new word a token is, if any. */
export function freshWord(text: string, newWords: readonly NewWord[] | undefined): NewWord | null {
  if (!newWords || newWords.length === 0) return null;
  const word = bare(text);
  if (!word) return null;
  return newWords.find((w) => bare(w.ku) === word) ?? null;
}

/** A word as the server's tokenizer reads one: letters, marks, digits and ZWNJ, with an inner apostrophe or hyphen. */
const WORD = /[\p{L}\p{M}\p{N}\u200C]+(?:['’-][\p{L}\p{M}\p{N}\u200C]+)*/u;

/** Whether a piece of a line is a word (or a phrase the course glosses whole), rather than the space or punctuation between two. */
export const isWord = (text: string): boolean => /[\p{L}\p{N}]/u.test(text) && !/^\s|\s$/u.test(text);

/** Whether something is known of a word: its meanings, or that they wait for the answer. */
export const explained = (token: GlossToken): boolean => !!token.meanings?.length || !!token.withheld;

/** Splits a line into words and what lies between them, for a line without tokens. */
function tokenize(line: string): PromptToken[] {
  return line
    .split(new RegExp(`(${WORD.source})`, 'u'))
    .filter((part) => part.length > 0)
    .map((text) => ({ text }));
}

/**
 * The line's words with what is known of them. A new word (`newWords`) takes the item's own meaning, which suits the
 * context better than a dictionary's first sense, even where it is the answer, since meeting it is the point; it is
 * marked `fresh` so it can be drawn more strongly. Tokens that do not add up to the line are set aside for the line's
 * own words, so its new words can still be tapped.
 */
export function glossTokens(line: string, tokens: readonly PromptToken[] | null | undefined, newWords: readonly NewWord[] | undefined): GlossToken[] {
  const trusted = !!tokens && tokens.length > 0 && tokens.map((token) => token.text).join('') === line;
  const base: readonly PromptToken[] = trusted ? tokens : tokenize(line);
  if (!newWords || newWords.length === 0) return [...base];
  return base.map((token) => {
    const fresh = freshWord(token.text, newWords);
    if (!fresh) return token;
    const others = (token.meanings ?? []).filter((m) => m.toLowerCase() !== fresh.en.toLowerCase());
    return { text: token.text, meanings: [fresh.en, ...others].slice(0, 3), ...(token.base ? { base: token.base } : {}), fresh: true };
  });
}

/**
 * The words either side of a 'missing' item's gap (`GAP`). A token holding the gap among other characters ("___.")
 * is split there, and its remainders carry no meaning. Null when the line has no single gap.
 */
export function aroundGap(tokens: readonly GlossToken[]): { before: GlossToken[]; after: GlossToken[] } | null {
  const joined = tokens.map((t) => t.text).join('');
  const at = joined.indexOf(GAP);
  if (at < 0 || joined.indexOf(GAP, at + GAP.length) >= 0) return null;
  const before: GlossToken[] = [];
  const after: GlossToken[] = [];
  let start = 0;
  for (const token of tokens) {
    const end = start + token.text.length;
    if (end <= at) before.push(token);
    else if (start >= at + GAP.length) after.push(token);
    else {
      // The token holding the gap: what lies before and after it, as plain text.
      const head = token.text.slice(0, Math.max(0, at - start));
      const tail = token.text.slice(Math.max(0, at + GAP.length - start));
      if (head) before.push({ text: head });
      if (tail) after.push({ text: tail });
    }
    start = end;
  }
  return { before, after };
}
