/** The words for a story's facts (level, minutes left, category), shared by cards, the filter and the story page. */
import {
  categoryName,
  categoryNameKey,
  levelHintKey,
  levelNameKey,
  type GameDialect,
  type StoryCategory,
  type StoryDialect,
  type StoryLevel,
  type StoryListItem,
} from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { Translate } from '../i18n/I18nProvider';

/** The stories' variety spelling in the games' terms, which the shared Kurmancî | Soranî switch speaks. */
export const GAME_SPELLING: Record<StoryDialect, GameDialect> = { kurmanci: 'kmr', sorani: 'ckb' };

/** "Beginner": a level's name for readers, never the CEFR letter (see `levelNameKey`). */
export function levelName(level: StoryLevel, t: Translate): string {
  return t(levelNameKey(level));
}

/** "Everyday sentences and short stories": the line under a level's name, and its tooltip on a card. */
export function levelHint(level: StoryLevel, t: Translate): string {
  return t(levelHintKey(level));
}

/**
 * The minutes left for this reader from how far they got: at least one while anything is left, null before starting or
 * once finished (the card then shows the story's own time).
 */
export function minutesLeft(story: Pick<StoryListItem, 'readingMinutes' | 'me'>): number | null {
  const me = story.me;
  if (!me || me.finishedAt || me.share <= 0) return null;
  return Math.max(1, Math.ceil(story.readingMinutes * (1 - Math.min(1, me.share))));
}

/**
 * A category's name in the reader's language: seeded categories from the catalogue (`categoryNameKey`) in all nine
 * languages, since the list names them only in English, Kurmancî and Soranî; later ones from the list, else English.
 */
export function categoryTitle(category: StoryCategory, locale: string, t: Translate): string {
  const key = categoryNameKey(category.slug);
  return key ? t(key) : categoryName(category, locale);
}

/** The same for a category known only by slug; null when neither the catalogue nor the list knows it. */
export function categoryLabel(slug: string, categories: readonly StoryCategory[] | null | undefined, locale: string, t: Translate): string | null {
  const key = categoryNameKey(slug);
  if (key) return t(key);
  const found = categories?.find((c) => c.slug === slug);
  return found ? categoryName(found, locale) : null;
}

/** The categories by slug in the reader's language, for cards. */
export function categoryNames(categories: readonly StoryCategory[] | undefined, locale: string, t: Translate): ReadonlyMap<string, string> {
  return new Map((categories ?? []).map((c) => [c.slug, categoryTitle(c, locale, t)]));
}

/** Whether a story has anything to listen to: every sentence, or some. */
export function narratedKey(story: Pick<StoryListItem, 'audioCoverage'>): MessageKey | null {
  if (story.audioCoverage === 'full') return 'stories.narrated';
  if (story.audioCoverage === 'partial') return 'stories.partlyNarrated';
  return null;
}
