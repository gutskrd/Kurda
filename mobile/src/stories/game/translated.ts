import type { TextStyle } from 'react-native';
import { isAppLocale, localeDir, type AppLocale } from '@kurda/shared';
import type { Translate } from '../../api/errors';
import type { StoryTextProps } from '../storyText';

/**
 * The question's own words in the reader's language (shared `questionIn`,
 * stories/legend.ts), and how the switch that shows them is worded: "Show
 * English" where what it shows is the English, "Translation" where it is the
 * reader's own language.
 */
export function translationToggle(lang: AppLocale, shown: boolean, t: Translate): string {
  if (lang === 'en') return shown ? t('stories.question.hideEnglish') : t('stories.question.showEnglish');
  return shown ? t('stories.reader.hideTranslation') : t('stories.reader.translation');
}

/** A translation set in its own language's direction, and read in it. */
export function translatedText(lang: string): { style: TextStyle; props: StoryTextProps } {
  const code: AppLocale = isAppLocale(lang) ? lang : 'en';
  const rtl = localeDir(code) === 'rtl';
  return { style: rtl ? { writingDirection: 'rtl', textAlign: 'right' } : { writingDirection: 'ltr', textAlign: 'left' }, props: { accessibilityLanguage: code } };
}
