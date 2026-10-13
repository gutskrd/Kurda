import { isStoryDialect, isStoryLength, type InviteSummary, type PlayGame } from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { TranslationKey } from '../i18n/translations';
import type { IconName } from '../theme/Icon';
import { DIALECT_NAME, LENGTH_KEY } from '../stories/labels';
import { quoted } from '../stories/storyText';

/** Each online game's name, as the Play tab already calls it. */
export const GAME_NAME_KEY: Record<PlayGame, TranslationKey> = {
  'wordle-battle': 'games.battle.name',
  'rhyme-match': 'games.rhymeMatch.name',
  stories: 'stories.title',
};

export const GAME_ICON: Record<PlayGame, IconName> = {
  'wordle-battle': 'grid',
  'rhyme-match': 'speaker',
  stories: 'story',
};

const DIFFICULTY_KEY: Record<string, TranslationKey> = {
  easy: 'games.difficulty.easy',
  medium: 'games.difficulty.medium',
  hard: 'games.difficulty.hard',
};

/**
 * What an invite or a game card is for, short enough for a banner:
 * "Hard", "Soranî", "“Dayika min” · 5 questions". Each game fills only its
 * own fields of the summary; anything unknown is left out rather than shown raw.
 */
export function summaryParts(summary: InviteSummary, t: Translate): string[] {
  const parts: string[] = [];
  if (summary.difficulty && DIFFICULTY_KEY[summary.difficulty]) parts.push(t(DIFFICULTY_KEY[summary.difficulty]!));
  if (summary.storyTitle) parts.push(quoted(summary.storyTitle, isStoryDialect(summary.dialect) ? summary.dialect : 'kurmanci'));
  else if (summary.length && isStoryLength(summary.length)) parts.push(t(LENGTH_KEY[summary.length]));
  if (summary.dialect && isStoryDialect(summary.dialect)) parts.push(DIALECT_NAME[summary.dialect]);
  if (typeof summary.questionCount === 'number') parts.push(t('stories.questionsCount', { count: summary.questionCount }));
  return parts;
}

/** "Wordle Battle · Hard" */
export function gameLine(game: PlayGame, summary: InviteSummary, t: Translate): string {
  return [t(GAME_NAME_KEY[game]), ...summaryParts(summary, t)].join(' · ');
}
