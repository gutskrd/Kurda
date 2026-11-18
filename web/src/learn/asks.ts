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
  /** The word's meanings, the one it was introduced with first. */
  meanings?: string[];
  /** A word this item introduces. */
  isNew?: boolean;
  /** The place of a missing-word item's gap. */
  gap?: boolean;
}

/** At most this many meanings of a word, as the server sends. */
const MEANINGS_MAX = 3;

/** A word as the server's tokenizer reads one: letters, marks, digits and ZWNJ, with an inner apostrophe or hyphen. */
const WORD = /[\p{L}\p{M}\p{N}‌]+(?:['’-][\p{L}\p{M}\p{N}‌]+)*/gu;

/** How words are compared with new words: NFC, lower case, trimmed. */
const wordKey = (word: string): string => word.normalize('NFC').toLowerCase().trim();

/** A line's words and the text between them, without meanings, for a line the server sent no words for. */
function wordsOf(line: string): LineToken[] {
  const out: LineToken[] = [];
  let at = 0;
  for (const m of line.matchAll(WORD)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    out.push({ text: m[0] });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}

/** Splits a piece containing the gap into before, the gap, and after. */
function splitAtGap(token: LineToken): LineToken[] {
  if (!token.text.includes(GAP)) return [token];
  return token.text.split(GAP).flatMap((part, i) => [...(i > 0 ? [{ text: GAP, gap: true }] : []), ...(part ? [{ text: part }] : [])]);
}

/**
 * An item's line as the bubble lays it out: the server's words with meanings when they add up to the line
 * (`promptTokens`), else the line's own words. Words the item introduces (`newWords`) are marked new with the meaning the
 * lesson means first, and a missing-word gap is its own place.
 */
export function lineTokens(line: string, tokens: readonly PromptToken[] | undefined, newWords: readonly NewWord[] | undefined): LineToken[] {
  const trusted = !!tokens && tokens.map((token) => token.text).join('') === line;
  const base: LineToken[] = trusted
    ? tokens.map((token) => (token.meanings?.length ? { text: token.text, meanings: token.meanings } : { text: token.text }))
    : wordsOf(line);
  const fresh = new Map((newWords ?? []).map((word) => [wordKey(word.ku), word.en.trim()]));
  return base
    .map((token): LineToken => {
      const meaning = fresh.get(wordKey(token.text));
      if (!meaning) return token;
      const others = (token.meanings ?? []).filter((m) => wordKey(m) !== wordKey(meaning));
      return { text: token.text, meanings: [meaning, ...others].slice(0, MEANINGS_MAX), isNew: true };
    })
    .flatMap(splitAtGap);
}
