import type { TextStyle } from 'react-native';
import {
  isAppLocale,
  localeDir,
  storySpelling,
  type AppLocale,
  type GameDialect,
  type LoreTradition,
  type ProverbTheme,
  type ProverbTranslation,
  type ProverbView,
  type RiddleCategory,
  type RiddleDifficulty,
  type RiddleState,
} from '@kurda/shared';
import type { Translate } from '../api/errors';
import type { TranslationKey } from '../i18n/translations';
import { storyTextProps, storyTextStyle, type StoryTextProps } from '../stories/storyText';

/**
 * The words the riddle and proverb screens put on the shared lists, and the
 * two small rules every one of those screens follows: which translation a
 * reader is shown, and how a text in a language other than the interface's
 * is set.
 *
 * The two collections keep their Kurmancî names in every language, as the
 * games do (`games/names.ts` in shared): "Metelok" and "Gotinên pêşiyan" are
 * what they are called, and the reader's own word for them stands beside the
 * name rather than in its place.
 */
export const RIDDLES_NAME = 'Metelok';
export const PROVERBS_NAME = 'Gotinên pêşiyan';

export const DIFFICULTY_KEY: Record<RiddleDifficulty, TranslationKey> = {
  easy: 'lore.difficulty.easy',
  medium: 'lore.difficulty.medium',
  hard: 'lore.difficulty.hard',
};

export const CATEGORY_KEY: Record<RiddleCategory, TranslationKey> = {
  nature: 'lore.category.nature',
  everyday: 'lore.category.everyday',
  wordplay: 'lore.category.wordplay',
  logic: 'lore.category.logic',
  funny: 'lore.category.funny',
  culture: 'lore.category.culture',
  children: 'lore.category.children',
};

export const THEME_KEY: Record<ProverbTheme, TranslationKey> = {
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

export const STATE_KEY: Record<RiddleState, TranslationKey> = {
  new: 'lore.state.new',
  trying: 'lore.state.trying',
  solved: 'lore.state.solved',
  revealed: 'lore.state.revealed',
};

/** The localized name beside the Kurmancî one, or nothing where the two are the same word (a Kurmancî interface). */
export function besideName(kurmanci: string, localized: string): string | null {
  return localized.trim().toLocaleLowerCase() === kurmanci.toLocaleLowerCase() ? null : localized;
}

/**
 * Where a riddle or a proverb comes from, in a short mark for a list ("Traditional", the region's
 * name, "Newly written"): a new one is never shown as old, and a regional one names its region.
 */
export function traditionMark(tradition: LoreTradition, region: string | null, t: Translate): string {
  if (tradition === 'regional') return region ?? t('lore.tradition.regional');
  return t(tradition === 'new' ? 'lore.tradition.new' : 'lore.tradition.traditional');
}

/** The same, said as a sentence on a riddle's answer or a proverb's page. */
export function traditionLine(kind: 'riddle' | 'proverb', tradition: LoreTradition, region: string | null, t: Translate): string {
  if (tradition === 'regional' && region) return t(kind === 'riddle' ? 'lore.riddle.from.regional' : 'lore.proverb.from.regional', { region });
  if (tradition === 'new') return t(kind === 'riddle' ? 'lore.riddle.from.new' : 'lore.proverb.from.new');
  return t(kind === 'riddle' ? 'lore.riddle.from.traditional' : 'lore.proverb.from.traditional');
}

/**
 * What a row says in the reader's language: their own translation, else the
 * English one, else nothing — never an empty block. `lang` is the language
 * it turned out to be, so it can be set and read in that language.
 */
export function inReaderLanguage<T>(translations: Partial<Record<AppLocale, T>>, locale: string): { value: T; lang: AppLocale } | null {
  const own = isAppLocale(locale) ? translations[locale] : undefined;
  if (own !== undefined && own !== null) return { value: own, lang: locale as AppLocale };
  const en = translations.en;
  return en !== undefined && en !== null ? { value: en, lang: 'en' } : null;
}

/** A proverb's translation for this reader, by the same rule. */
export function proverbTranslation(proverb: Pick<ProverbView, 'translations'>, locale: string): { value: ProverbTranslation; lang: AppLocale } | null {
  return inReaderLanguage(proverb.translations, locale);
}

/**
 * How a text in a given app language is set: its direction and its
 * alignment, and on iOS the language VoiceOver reads it in. A Soranî reader
 * shown the English translation (nothing in Soranî yet) gets it left to
 * right, and an English reader a Soranî riddle right to left.
 */
export function textIn(lang: AppLocale): { style: TextStyle; props: StoryTextProps } {
  const rtl = localeDir(lang) === 'rtl';
  return { style: rtl ? { writingDirection: 'rtl', textAlign: 'right' } : { writingDirection: 'ltr', textAlign: 'left' }, props: { accessibilityLanguage: lang } };
}

/** How a riddle's or a proverb's own Kurdish is set: the story screens' rule, for its variety. */
export function kurdishIn(dialect: GameDialect): { style: TextStyle; props: StoryTextProps } {
  const spelling = storySpelling(dialect);
  return { style: storyTextStyle(spelling), props: storyTextProps(spelling) };
}

/** Centred, as a riddle's question and a proverb are set on their own pages, but still read in their own direction. */
export function centred(style: TextStyle): TextStyle {
  return { ...style, textAlign: 'center' };
}

/** The variety a riddle or a proverb is in, read off its slug (`kmr-…`, `ckb-…`): its page can be set before it arrives. */
export function dialectOfSlug(slug: string): GameDialect {
  return slug.startsWith('ckb-') ? 'ckb' : 'kmr';
}

/** Which variety the collections open on: Soranî in a Soranî interface, else the learner's own Kurdish. */
export function defaultLoreDialect(locale: string, course: GameDialect): GameDialect {
  return locale === 'ckb' ? 'ckb' : course;
}
