import type { TextStyle, ViewStyle } from 'react-native';
import { storyTextDirection, type StoryDialect } from '@kurda/shared';

/**
 * How every string from a story is set (title, summary, paragraphs, glosses, questions, options, review). Each
 * carries its own direction and alignment from shared `storyTextDirection`, as on the website, plus on iOS the
 * language VoiceOver reads it in, so Arabic-script Soranî starts at the right edge with its punctuation in place.
 * `storyTextStyle` returns the style and `storyTextProps` the rest, since spreading one helper is clumsy.
 */
export interface StoryTextProps {
  /** iOS: the language VoiceOver reads it in; ignored elsewhere. */
  accessibilityLanguage: string;
}

export function storyTextStyle(dialect: StoryDialect): TextStyle {
  const { dir } = storyTextDirection(dialect);
  return dir === 'rtl' ? { writingDirection: 'rtl', textAlign: 'right' } : { writingDirection: 'ltr', textAlign: 'left' };
}

/** A row of small facts under a story's title, in interface order but on the story text's starting side. */
export function storyRowStyle(dialect: StoryDialect): ViewStyle {
  return { justifyContent: storyTextDirection(dialect).dir === 'rtl' ? 'flex-end' : 'flex-start' };
}

/** A row that leads with a marker (an option's number, a tick or a cross): the marker goes where the text starts. */
export function storyRowDirection(dialect: StoryDialect): 'row' | 'row-reverse' {
  return storyTextDirection(dialect).dir === 'rtl' ? 'row-reverse' : 'row';
}

export function storyTextProps(dialect: StoryDialect): StoryTextProps {
  return { accessibilityLanguage: storyTextDirection(dialect).lang };
}

/** A story's words quoted by the app, in the story language's marks: guillemets in Soranî, curly quotes in Kurmancî. */
export function quoted(text: string, dialect: StoryDialect): string {
  return dialect === 'sorani' ? `«${text}»` : `“${text}”`;
}

/** An English translation in the story screens: left to right and read as English, whatever the interface language. */
export const ENGLISH_TEXT_STYLE: TextStyle = { writingDirection: 'ltr', textAlign: 'left' };
export const ENGLISH_TEXT_PROPS: StoryTextProps = { accessibilityLanguage: 'en' };
