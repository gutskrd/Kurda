import { isStoryDialect, isStoryLength, type InviteSummary, type PlayGame } from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/Icon';
import { LENGTH_KEY } from '../stories/labels';
import { quoted } from '../stories/storyText';
import { dialectNameKey } from '../i18n/dialectName';

/** Each online game's name, as the Play tab already calls it. */
export const GAME_NAME_KEY: Record<PlayGame, TranslationKey> = {
  'wordle-battle': 'games.battle.name',
  'rhyme-match': 'games.rhymeMatch.name',
  stories: 'stories.title',
  'last-letter': 'games.lastLetter.name',
  impostor: 'games.impostor.name',
  'who-am-i': 'games.whoAmI.name',
};

export const GAME_ICON: Record<PlayGame, IconName> = {
  'wordle-battle': 'grid',
  'rhyme-match': 'speaker',
  stories: 'story',
  'last-letter': 'link',
  impostor: 'people',
  'who-am-i': 'question',
};

export type Difficulty = 'easy' | 'medium' | 'hard';

/** A word battle's difficulty, by name. */
export const DIFFICULTY_KEY: Record<Difficulty, TranslationKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

/**
 * What an invite or game card is for, short enough for a banner: "Hard", "Soranî", "“Dayika min” · 5 questions".
 * Unknown values are left out rather than shown raw.
 */
export function summaryParts(summary: InviteSummary, t: Translate): string[] {
  const parts: string[] = [];
  const difficulty = summary.difficulty ? (DIFFICULTY_KEY as Record<string, TranslationKey | undefined>)[summary.difficulty] : undefined;
  if (difficulty) parts.push(t(difficulty));
  if (summary.storyTitle) parts.push(quoted(summary.storyTitle, isStoryDialect(summary.dialect) ? summary.dialect : 'kurmanci'));
  else if (summary.length && isStoryLength(summary.length)) parts.push(t(LENGTH_KEY[summary.length]));
  if (summary.dialect && isStoryDialect(summary.dialect)) parts.push(t(dialectNameKey(summary.dialect)));
  if (typeof summary.questionCount === 'number') parts.push(t('stories.questionsCount', { count: summary.questionCount }));
  return parts;
}
