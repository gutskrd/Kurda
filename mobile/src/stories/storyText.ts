import type { TextStyle } from 'react-native';
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

export function storyTextProps(dialect: StoryDialect): StoryTextProps {
  return { accessibilityLanguage: storyTextDirection(dialect).lang };
}

/** An English translation inside the story screens: left to right, read in English, in any interface language. */
export const ENGLISH_TEXT_STYLE: TextStyle = { writingDirection: 'ltr', textAlign: 'left' };
export const ENGLISH_TEXT_PROPS: StoryTextProps = { accessibilityLanguage: 'en' };
