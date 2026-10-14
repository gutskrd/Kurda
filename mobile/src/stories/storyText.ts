import type { TextStyle, ViewStyle } from 'react-native';
import { storyTextDirection, type StoryDialect } from '@kurda/shared';

/**
 * How every string that comes from a story is set: title, summary,
 * paragraphs, gloss terms, questions, options, explanations, review.
 *
 * The phone has no app-wide right-to-left layout (the interface stays laid
 * out left to right in every language), so a Soranî story written in Arabic
 * script would otherwise start at the left edge with its punctuation on the
 * wrong end. Each story string therefore carries its own direction and
 * alignment, from the shared `storyTextDirection` the browser uses too, and
 * on iOS the language VoiceOver should read it in.
 *
 * One helper, spread onto the Text: `<Text {...storyText(dialect)} style={[…, storyText(dialect).style]}>`
 * is clumsy, so `storyTextStyle` returns the style and `storyTextProps` the rest.
 */
export interface StoryTextProps {
  /** iOS: the voice VoiceOver reads it in (ignored elsewhere) */
  accessibilityLanguage: string;
}

export function storyTextStyle(dialect: StoryDialect): TextStyle {
  const { dir } = storyTextDirection(dialect);
  return dir === 'rtl' ? { writingDirection: 'rtl', textAlign: 'right' } : { writingDirection: 'ltr', textAlign: 'left' };
}

/**
 * A row of small facts under a story's title (its level, length, minutes),
 * kept in the interface's own order but on the side the story's text starts
 * from, so a Soranî title and its facts line up on the right.
 */
export function storyRowStyle(dialect: StoryDialect): ViewStyle {
  return { justifyContent: storyTextDirection(dialect).dir === 'rtl' ? 'flex-end' : 'flex-start' };
}

/**
 * A row that leads with a marker (an option's number, a tick or a cross) and
 * then a story's words: the marker goes where the text starts, so in Soranî
 * it sits at the right, beside the first word, not a row's width away.
 */
export function storyRowDirection(dialect: StoryDialect): 'row' | 'row-reverse' {
  return storyTextDirection(dialect).dir === 'rtl' ? 'row-reverse' : 'row';
}

export function storyTextProps(dialect: StoryDialect): StoryTextProps {
  return { accessibilityLanguage: storyTextDirection(dialect).lang };
}

/**
 * A story's words quoted by the app (the evidence in the review, a title in
 * an invite): in the marks the story's own language uses — guillemets in
 * Soranî, as its texts write them, curly quotes in Kurmancî.
 */
export function quoted(text: string, dialect: StoryDialect): string {
  return dialect === 'sorani' ? `«${text}»` : `“${text}”`;
}

/** An English translation inside the story screens: left to right, read in English, in any interface language. */
export const ENGLISH_TEXT_STYLE: TextStyle = { writingDirection: 'ltr', textAlign: 'left' };
export const ENGLISH_TEXT_PROPS: StoryTextProps = { accessibilityLanguage: 'en' };
