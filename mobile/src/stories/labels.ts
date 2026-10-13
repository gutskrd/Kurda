import {
  lengthMinutes,
  type GameAccess,
  type StoryDialect,
  type StoryGameMode,
  type StoryLength,
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

export function timerLabel(seconds: TimerSeconds, t: Translate): string {
  return seconds === 0 ? t('stories.timer.off') : t('stories.timer.seconds', { seconds });
}

/** "Short · 1–2 min": a length with the minutes it takes to read in this variety. */
export function lengthWithMinutes(dialect: StoryDialect, length: StoryLength, t: Translate): string {
  const { min, max } = lengthMinutes(dialect, length);
  const minutes = min === max ? t('stories.minutes', { count: min }) : t('stories.minutesRange', { min, max });
  return `${t(LENGTH_KEY[length])} · ${minutes}`;
}
