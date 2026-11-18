import { CHAT_GREETINGS, greetingDialect, storySpelling, storyTextDirection, toDialect } from '@kurda/shared';
import { useLocale } from '../i18n/I18nProvider';
import { courseDialect } from '../stories/prefs';

/**
 * The three openers an empty chat offers, in the reader's Kurdish (shared `greetingDialect`): the interface's when it is
 * Kurdish, else the course's as this device knows it. With the language and direction to set on each.
 */
export function useGreetings(): { greetings: readonly string[]; lang: string; dir: 'ltr' | 'rtl' } {
  const dialect = greetingDialect(useLocale(), toDialect(courseDialect()));
  return { greetings: CHAT_GREETINGS[dialect], ...storyTextDirection(storySpelling(dialect)) };
}
