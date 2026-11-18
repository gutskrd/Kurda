/** Labels for the riddle and proverb codes (difficulty, category, tradition, theme, state), shared by every screen. */
import type { LoreTradition, ProverbTheme, RiddleCategory, RiddleDifficulty, RiddleState } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';
import type { Translate } from '../i18n/I18nProvider';

export const DIFFICULTY_KEY: Record<RiddleDifficulty, MessageKey> = {
  easy: 'lore.difficulty.easy',
  medium: 'lore.difficulty.medium',
  hard: 'lore.difficulty.hard',
};

export const CATEGORY_KEY: Record<RiddleCategory, MessageKey> = {
  nature: 'lore.category.nature',
  everyday: 'lore.category.everyday',
  wordplay: 'lore.category.wordplay',
  logic: 'lore.category.logic',
  funny: 'lore.category.funny',
  culture: 'lore.category.culture',
  children: 'lore.category.children',
};

export const THEME_KEY: Record<ProverbTheme, MessageKey> = {
  wisdom: 'lore.theme.wisdom',
  patience: 'lore.theme.patience',
  friendship: 'lore.theme.friendship',
  family: 'lore.theme.family',
  respect: 'lore.theme.respect',
  courage: 'lore.theme.courage',
  knowledge: 'lore.theme.knowledge',
  'life-experience': 'lore.theme.lifeExperience',
  trust: 'lore.theme.trust',
  'hard-work': 'lore.theme.hardWork',
  'human-nature': 'lore.theme.humanNature',
  mistakes: 'lore.theme.mistakes',
};

/** A riddle's state as the list marks it; an untouched riddle is not marked. */
export const STATE_KEY: Record<Exclude<RiddleState, 'new'>, MessageKey> = {
  trying: 'lore.state.trying',
  solved: 'lore.state.solved',
  revealed: 'lore.state.revealed',
};

/** Where a riddle or proverb comes from in one line: traditional, a region's own form, or newly written. */
export function traditionLine(kind: 'riddle' | 'proverb', tradition: LoreTradition, region: string | null, t: Translate): string {
  if (tradition === 'regional' && region) return t(kind === 'riddle' ? 'lore.tradition.riddle.regionalIn' : 'lore.tradition.proverb.regionalIn', { region });
  if (tradition === 'traditional' && region) return t(kind === 'riddle' ? 'lore.tradition.riddle.traditionalIn' : 'lore.tradition.proverb.traditionalIn', { region });
  const key: Record<LoreTradition, MessageKey> =
    kind === 'riddle'
      ? { traditional: 'lore.tradition.riddle.traditional', regional: 'lore.tradition.riddle.regional', new: 'lore.tradition.riddle.new' }
      : { traditional: 'lore.tradition.proverb.traditional', regional: 'lore.tradition.proverb.regional', new: 'lore.tradition.proverb.new' };
  return t(key[tradition]);
}

/** The short origin tag on a list row. */
export const TRADITION_TAG_KEY: Record<LoreTradition, MessageKey> = {
  traditional: 'lore.tradition.tag.traditional',
  regional: 'lore.tradition.tag.regional',
  new: 'lore.tradition.tag.new',
};

