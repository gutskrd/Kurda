import type { TextStyle } from 'react-native';
import { isAppLocale, localeDir, type AppLocale } from '@kurda/shared';
import type { Translate } from '../../api/errors';
import type { StoryTextProps } from '../storyText';

/**
 * The toggle label for a question's translation (shared `questionIn`, stories/legend.ts): "Show English" when it
 * shows English, "Translation" when it shows the reader's own language.
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
