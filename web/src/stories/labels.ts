/**
 * The words a story's facts are shown with: a CEFR letter with the word it
 * stands for, the minutes left from where a reader got to, a category's name
 * in the reader's language. Shared by the library's cards and the story page,
 * so the two never say the same thing two ways.
 */
import { categoryName, type CefrLevel, type StoryCategory, type StoryListItem } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** The word each CEFR letter stands for, as a learner would say it. */
export const CEFR_WORD_KEY: Readonly<Record<CefrLevel, MessageKey>> = {
  A1: 'stories.cefr.A1',
  A2: 'stories.cefr.A2',
  B1: 'stories.cefr.B1',
  B2: 'stories.cefr.B2',
  C1: 'stories.cefr.C1',
};

/** "A2 · Elementary". */
export function cefrLabel(cefr: CefrLevel, t: Translate): string {
  return t('stories.cefr.full', { cefr, word: t(CEFR_WORD_KEY[cefr]) });
}

/**
 * How many minutes of a story are left for this reader, from how far through
 * it they got: never less than one while anything is left, and null before
 * they started or once they finished — a card then shows the story's own time.
 */
export function minutesLeft(story: Pick<StoryListItem, 'readingMinutes' | 'me'>): number | null {
  const me = story.me;
  if (!me || me.finishedAt || me.share <= 0) return null;
  return Math.max(1, Math.ceil(story.readingMinutes * (1 - Math.min(1, me.share))));
}

/** The categories by slug, each in the reader's language, for a card to name its own. */
export function categoryNames(categories: readonly StoryCategory[] | undefined, locale: string): ReadonlyMap<string, string> {
  return new Map((categories ?? []).map((c) => [c.slug, categoryName(c, locale)]));
}

/** Whether a story has anything to listen to: every sentence, or some. */
export function narratedKey(story: Pick<StoryListItem, 'audioCoverage'>): MessageKey | null {
  if (story.audioCoverage === 'full') return 'stories.narrated';
  if (story.audioCoverage === 'partial') return 'stories.partlyNarrated';
  return null;
}
