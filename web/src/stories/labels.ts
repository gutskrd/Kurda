/**
 * The words a story's facts are shown with: a level's plain name and what it
 * means, the minutes left from where a reader got to, a category's name in
 * the reader's language. Shared by the library's cards, its filter and the
 * story page, so none of them says the same thing two ways.
 */
import { categoryName, levelHintKey, levelNameKey, type StoryCategory, type StoryLevel, type StoryListItem } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** "Beginner": what a reader is shown for a level, never the CEFR letter (see `levelNameKey`). */
export function levelName(level: StoryLevel, t: Translate): string {
  return t(levelNameKey(level));
}

/** "Everyday sentences and short stories": the line under a level's name, and its tooltip on a card. */
export function levelHint(level: StoryLevel, t: Translate): string {
  return t(levelHintKey(level));
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
