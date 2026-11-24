/**
 * The headline and bubble line for an item that says what it asks (`ask`, shared lesson-player.ts). Such items hold only
 * the line in their prompt, and the headline ("What does this mean?") comes from here. Items without an ask are shown as
 * their type always was.
 */
import { CHARACTER_NAMES, GAP, isSoraniDialect, type DeliveredExercise, type NewWord, type PromptToken } from '@kurda/shared';
import type { Translate } from '../i18n/I18nProvider';

/** The headline of an item that says what it asks, or null; `tiles` lets a listening headline say "Tap what you hear". */
export function askHeadline(exercise: DeliveredExercise, t: Translate, how: { tiles: boolean; dialect: string | null | undefined }): string | null {
  switch (exercise.ask) {
    case undefined:
      return null;
    case 'meaning':
      return t('lesson.ask.meaning');
    case 'choose-kurdish':
      return t('lesson.ask.chooseKurdish');
    case 'picture':
      return t('lesson.ask.picture');
    case 'reply':
      return t('lesson.ask.reply');
    case 'missing':
      return t('lesson.ask.missing');
    case 'to-english':
      return t('lesson.ask.toEnglish');
    // The road is in Kurmancî and says so; a Soranî course's item asks for Kurdish.
    case 'to-kurdish':
      return isSoraniDialect(how.dialect) ? t('lesson.translate.ask') : t('lesson.ask.toKurmanji');
    case 'hear':
      return how.tiles ? t('lesson.listen.askTiles') : t('lesson.listen.ask');
    case 'repeat': {
      const speaker = exercise.modelAudioVoice?.speaker;
      return speaker ? t('lesson.ask.repeat', { name: CHARACTER_NAMES[speaker] }) : t('lesson.speak.ask');
    }
  }
}

/** Whether an item's line is English, to be put into Kurdish or matched with it. */
export function lineIsEnglish(exercise: DeliveredExercise): boolean {
  return exercise.ask === 'to-kurdish' || exercise.ask === 'choose-kurdish';
}

/** A piece of an item's line as the bubble shows it: a word, what lies between two, or the missing word's place. */
export interface LineToken {
  text: string;
  /** A word, which a tap explains, as against the space or punctuation between two. */
  word?: true;
  /** The word's meanings, the one it was introduced with first; Kurdish words, for a word of an English line. */
  meanings?: string[];
  /** The word an inflected form comes from. */
  base?: string;
  /** The word has a meaning that would give the answer away, so a tap says it waits. */
  withheld?: true;
  /** A word this item introduces. */
  isNew?: boolean;
  /** The place of a missing-word item's gap. */
  gap?: boolean;
}

/** At most this many meanings of a word, as the server sends. */
const MEANINGS_MAX = 3;

/** A word as the server's tokenizer reads one: letters, marks, digits and ZWNJ, with an inner apostrophe or hyphen. */
const WORD = /[\p{L}\p{M}\p{N}‌]+(?:['’-][\p{L}\p{M}\p{N}‌]+)*/gu;
/** A piece with a letter or digit in it and no space at its ends is a word, or a phrase glossed whole; the rest lies between. */
const WORDISH = /^\S(?:.*\S)?$/u;
const LETTERED = /[\p{L}\p{N}]/u;

/** How words are compared with new words: NFC, lower case, trimmed. */
const wordKey = (word: string): string => word.normalize('NFC').toLowerCase().trim();

/** A line's words and the text between them, without meanings, for a line the server sent no words for. */
function wordsOf(line: string): LineToken[] {
  const out: LineToken[] = [];
  let at = 0;
  for (const m of line.matchAll(WORD)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    out.push({ text: m[0], word: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}

/** A server token as the bubble holds it: every word marked as one, whatever is known of it. */
function fromServer(token: PromptToken): LineToken {
  if (!WORDISH.test(token.text) || !LETTERED.test(token.text)) return { text: token.text };
  return {
    text: token.text,
    word: true,
    ...(token.meanings?.length ? { meanings: token.meanings } : {}),
    ...(token.base ? { base: token.base } : {}),
    ...(token.withheld ? { withheld: true as const } : {}),
  };
}

/** Splits a piece containing the gap into before, the gap, and after. */
function splitAtGap(token: LineToken): LineToken[] {
  if (!token.text.includes(GAP)) return [token];
  return token.text.split(GAP).flatMap((part, i) => [...(i > 0 ? [{ text: GAP, gap: true }] : []), ...(part ? [{ text: part }] : [])]);
}

/**
 * An item's line as the bubble lays it out: every word a tap from what is known of it. The server's words are used when
 * they add up to the line (`promptTokens`, `lineTokens`), else the line's own words, which then say they have no meaning
 * yet. Words the item introduces (`newWords`) are marked new with the meaning the lesson means first, even where that
 * meaning is the answer, since meeting it is the point; a missing-word gap is its own place.
 */
export function lineTokens(line: string, tokens: readonly PromptToken[] | null | undefined, newWords: readonly NewWord[] | undefined): LineToken[] {
  const trusted = !!tokens && tokens.map((token) => token.text).join('') === line;
  const base: LineToken[] = trusted ? tokens.map(fromServer) : wordsOf(line);
  const fresh = new Map((newWords ?? []).map((word) => [wordKey(word.ku), word.en.trim()]));
  return base
    .map((token): LineToken => {
      const meaning = token.word ? fresh.get(wordKey(token.text)) : undefined;
      if (!meaning) return token;
      const others = (token.meanings ?? []).filter((m) => wordKey(m) !== wordKey(meaning));
      return { text: token.text, word: true, meanings: [meaning, ...others].slice(0, MEANINGS_MAX), ...(token.base ? { base: token.base } : {}), isNew: true };
    })
    .flatMap(splitAtGap);
}
