import {
  categoryName,
  lengthMinutes,
  levelHintKey,
  levelNameKey,
  type GameAccess,
  type StoryAudioCoverage,
  type StoryCategory,
  type StoryDialect,
  type StoryGameMode,
  type StoryLength,
  type StoryLevel,
  type StoryTradition,
  type TextDuring,
  type TimerSeconds,
} from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { TranslationKey } from '../i18n/translations';

/**
 * The words the Stories screens put on the shared presets.
 *
 * A variety is called by its own name in every language, the way a language
 * is (the Rhyme Match screen says the same): "Kurmancî" translated into
 * Kurmancî nine times is how one word ends up with nine spellings.
 */
export const DIALECT_NAME: Record<StoryDialect, string> = { kurmanci: 'Kurmancî', sorani: 'Soranî' };

export const LENGTH_KEY: Record<StoryLength, TranslationKey> = {
  short: 'stories.length.short',
  medium: 'stories.length.medium',
  long: 'stories.length.long',
};

export const MODE_KEY: Record<StoryGameMode, TranslationKey> = {
  solo: 'stories.mode.solo',
  duo: 'stories.mode.duo',
  group: 'stories.mode.group',
};

export const TEXT_DURING_KEY: Record<TextDuring, TranslationKey> = {
  visible: 'stories.text.visible',
  hidden: 'stories.text.hidden',
};

export const ACCESS_KEY: Record<GameAccess, TranslationKey> = {
  friends: 'stories.access.friends',
  open: 'stories.access.open',
};

/**
 * A level by its plain name ("Beginner"), never the CEFR letter, which says
 * nothing to someone who never studied a language in a classroom; and the
 * line that says what reading at it is like. The keys and their order are
 * shared with the website (`levelNameKey`).
 */
export function levelName(level: StoryLevel, t: Translate): string {
  return t(levelNameKey(level));
}

export function levelHint(level: StoryLevel, t: Translate): string {
  return t(levelHintKey(level));
}

/** Where a story comes from, which the reader is told: never an original presented as folklore. */
export const TRADITION_KEY: Record<StoryTradition, TranslationKey> = {
  traditional: 'stories.overview.tradition.traditional',
  adapted: 'stories.overview.tradition.adapted',
  original: 'stories.overview.tradition.original',
};

/** The audio badge's word, or null for a story with no recording at all. */
export function narrationLabel(coverage: StoryAudioCoverage, t: Translate): string | null {
  if (coverage === 'full') return t('stories.library.narrated');
  if (coverage === 'partial') return t('stories.library.partlyNarrated');
  return null;
}

/** A category's name in the reader's language, from the library's list; the slug itself for one the list does not know. */
export function categoryLabel(slug: string | null | undefined, categories: readonly StoryCategory[] | undefined, locale: string): string | null {
  if (!slug) return null;
  const found = categories?.find((c) => c.slug === slug);
  return found ? categoryName(found, locale) : slug;
}

export function timerLabel(seconds: TimerSeconds, t: Translate): string {
  return seconds === 0 ? t('stories.timer.off') : t('stories.timer.seconds', { seconds });
}

/** "Short · 1–2 min": a length with the minutes it takes to read in this variety. */
export function lengthWithMinutes(dialect: StoryDialect, length: StoryLength, t: Translate): string {
  const { min, max } = lengthMinutes(dialect, length);
  const minutes = min === max ? t('stories.minutes', { count: min }) : t('stories.minutesRange', { min, max });
  return `${t(LENGTH_KEY[length])} · ${minutes}`;
}
