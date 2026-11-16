/**
 * What an item that says what it asks (`ask`, shared lesson-player.ts) is shown
 * with, apart from how it is drawn: its headline, and its line as the bubble
 * lays it out.
 *
 * Items written in the new style hold the line alone in their prompt and let
 * the headline say what to do with it ("What does this mean?"), so the
 * headline comes from here rather than from the item. An item without an ask
 * is asked as its type always was, and nothing here is used for it.
 */
import { CHARACTER_NAMES, GAP, isSoraniDialect, type DeliveredExercise, type NewWord, type PromptToken } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * The headline of an item that says what it asks; null for one that does not.
 * `tiles` says whether a built answer is being laid from word tiles, which a
 * listening item's headline names ("Tap what you hear").
 */
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
    // the road is in Kurmancî and says so; a Soranî course's item asks for Kurdish, as before
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

/** Whether an item's line is English, the language the learner puts into Kurdish or chooses the Kurdish for. */
export function lineIsEnglish(exercise: DeliveredExercise): boolean {
  return exercise.ask === 'to-kurdish' || exercise.ask === 'choose-kurdish';
}

/** A piece of an item's line as the bubble shows it: a word, what lies between two, or the missing word's place. */
export interface LineToken {
  text: string;
  /** what the word means, the meaning it was brought in with first */
  meanings?: string[];
  /** a word this item brings in for the first time */
  isNew?: boolean;
  /** the place of a missing-word item's gap */
  gap?: boolean;
}

/** At most this many meanings of a word, as the server sends. */
const MEANINGS_MAX = 3;

/** A word as the server's tokenizer reads one: letters, marks, digits and the ZWNJ, with an apostrophe or hyphen inside. */
const WORD = /[\p{L}\p{M}\p{N}‌]+(?:['’-][\p{L}\p{M}\p{N}‌]+)*/gu;

/** What a word and a new word are compared by: the letters, in one case and one composition. */
const wordKey = (word: string): string => word.normalize('NFC').toLowerCase().trim();

/** A line as its words and what lies between them, none with a meaning: for a line the server sent no words for. */
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

/** A piece with the gap in it, as what comes before the gap, the gap, and what comes after. */
function splitAtGap(token: LineToken): LineToken[] {
  if (!token.text.includes(GAP)) return [token];
  return token.text.split(GAP).flatMap((part, i) => [...(i > 0 ? [{ text: GAP, gap: true }] : []), ...(part ? [{ text: part }] : [])]);
}

/**
 * An item's line as the bubble lays it out: the server's words with their
 * meanings when they add up to the line (`promptTokens`), else the line's own
 * words; a word the item brings in (`newWords`) marked new, with the meaning
 * it was brought in with first — the meaning the lesson means, where the
 * dictionary's may lead with another — and the gap of a missing-word item as
 * a place of its own.
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
