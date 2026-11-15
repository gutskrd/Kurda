/**
 * The words the riddles' and proverbs' codes are shown with — a difficulty,
 * a category, where one comes from, a theme, a riddle's state — so the lists,
 * the pages and the round all say each thing the same way. Every code has
 * its own key in all nine catalogues; a code is never shown as it is stored.
 */
import type { LoreTradition, ProverbTheme, RiddleCategory, RiddleDifficulty, RiddleState } from '@kurda/shared';
import type { MessageKey } from '../i18n/en';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

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

/** A riddle's state as its list marks it; a riddle not yet touched is not marked at all. */
export const STATE_KEY: Record<Exclude<RiddleState, 'new'>, MessageKey> = {
  trying: 'lore.state.trying',
  solved: 'lore.state.solved',
  revealed: 'lore.state.revealed',
};

/**
 * Where a riddle or a proverb comes from, in one short line: traditional,
 * a region's own form (and which region), or newly written. A new one is
 * never presented as old.
 */
export function traditionLine(kind: 'riddle' | 'proverb', tradition: LoreTradition, region: string | null, t: Translate): string {
  if (tradition === 'regional' && region) return t(kind === 'riddle' ? 'lore.tradition.riddle.regionalIn' : 'lore.tradition.proverb.regionalIn', { region });
  if (tradition === 'traditional' && region) return t(kind === 'riddle' ? 'lore.tradition.riddle.traditionalIn' : 'lore.tradition.proverb.traditionalIn', { region });
  const key: Record<LoreTradition, MessageKey> =
    kind === 'riddle'
      ? { traditional: 'lore.tradition.riddle.traditional', regional: 'lore.tradition.riddle.regional', new: 'lore.tradition.riddle.new' }
      : { traditional: 'lore.tradition.proverb.traditional', regional: 'lore.tradition.proverb.regional', new: 'lore.tradition.proverb.new' };
  return t(key[tradition]);
}

/** The short tag a list row wears for where it comes from. */
export const TRADITION_TAG_KEY: Record<LoreTradition, MessageKey> = {
  traditional: 'lore.tradition.tag.traditional',
  regional: 'lore.tradition.tag.regional',
  new: 'lore.tradition.tag.new',
};

