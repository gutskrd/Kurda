import { describe, expect, it, vi } from 'vitest';
import { ENGLISH_TEXT_PROPS, ENGLISH_TEXT_STYLE, quoted, storyRowDirection, storyRowStyle, storyTextProps, storyTextStyle } from './storyText';

vi.mock('react-native', () => ({}));

describe('story text direction', () => {
  it('sets a Soranî story right to left and read as Soranî, in any interface language', () => {
    expect(storyTextStyle('sorani')).toEqual({ writingDirection: 'rtl', textAlign: 'right' });
    expect(storyTextProps('sorani')).toEqual({ accessibilityLanguage: 'ckb' });
  });

  it('sets a Kurmancî story left to right and read as Kurmancî', () => {
    expect(storyTextStyle('kurmanci')).toEqual({ writingDirection: 'ltr', textAlign: 'left' });
    expect(storyTextProps('kurmanci')).toEqual({ accessibilityLanguage: 'ku' });
  });

  it('keeps English translations left to right and read in English', () => {
    expect(ENGLISH_TEXT_STYLE).toEqual({ writingDirection: 'ltr', textAlign: 'left' });
    expect(ENGLISH_TEXT_PROPS).toEqual({ accessibilityLanguage: 'en' });
  });

  it('puts a story’s row of facts on the side its title starts from', () => {
    expect(storyRowStyle('sorani')).toEqual({ justifyContent: 'flex-end' });
    expect(storyRowStyle('kurmanci')).toEqual({ justifyContent: 'flex-start' });
  });

  it('puts an option’s number or tick where a Soranî line starts, beside its first word', () => {
    expect(storyRowDirection('sorani')).toBe('row-reverse');
    expect(storyRowDirection('kurmanci')).toBe('row');
  });

  it('quotes a story’s words in the marks its own language uses', () => {
    expect(quoted('Nan germ e.', 'kurmanci')).toBe('“Nan germ e.”');
    expect(quoted('نانی گەرم', 'sorani')).toBe('«نانی گەرم»');
  });
});
