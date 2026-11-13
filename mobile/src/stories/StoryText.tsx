import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoryDetail, StoryGlossEntry } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { displayFont } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { CHARACTER_SIZE } from '../characters/voice';
import { paragraphSegments } from './segments';
import { ENGLISH_TEXT_PROPS, ENGLISH_TEXT_STYLE, storyRowDirection, storyTextProps, storyTextStyle } from './storyText';
import { pressedDim } from '../theme/motion';
import { heldDim } from '../theme/MotionParts';

/** The reader's body size before the text-size control and the system's Dynamic Type. */
export const STORY_BODY_SIZE = 18;

/**
 * The spacing between lines for a body size: generous, for reading — the
 * design's 1.65. The system's text size is not in it: React Native applies
 * that to the line height itself, as it does to the letters.
 */
export function storyLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.65);
}

/**
 * The band behind the sentence being read: the sun's gold, thinned to a tint
 * that leaves the words their contrast on either theme.
 */
export function readingTint(gold: string): string {
  return `${gold}33`;
}

export interface TextPoint {
  paragraph: number;
  sentence: number | null;
}

/**
 * A story's paragraphs, as the reader and the game's "Story" sheet show them.
 *
 * Set in the display serif — the face the headings use, which renders ê î û
 * ç ş — at the reader's size with generous leading, the way a page of a book
 * is set rather than a page of an app. Body text follows the system text
 * size (Dynamic Type) on top of the reader's own control. React Native
 * scales the line height by the system factor together with the letters
 * (iOS multiplies it, Android reads it in sp), so the spacing is given here
 * for the reader's size only: scaling it again by the system factor spread
 * large text out to twice its spacing.
 *
 * Glossary words carry a dotted gold underline (not bold, which fights the
 * serif) and open their meaning when tapped. A word inside a paragraph
 * cannot be reached on its own with VoiceOver or TalkBack, which is why the
 * reader also lists them under "Key vocabulary" — that list is the
 * accessible way to the same meanings, not a duplicate.
 *
 * Under a paragraph, when the story has a translation in the reader's
 * language (or in English), a small "Translation" toggle shows that
 * paragraph's translation in secondary ink.
 *
 * Tapping text never plays sound; a paragraph with recordings has its own
 * Listen button, and the sentence being read sits on a gold band — tapping
 * that band plays the sentence again. While a sentence an editor has given a
 * character to is read, that character says it beside its paragraph's Listen;
 * a paragraph with such a sentence keeps the room for it, so nothing moves
 * when it appears.
 */
export function StoryText({
  story,
  fontSize = STORY_BODY_SIZE,
  current = null,
  evidence = null,
  onGloss,
  onReplay,
  listenable,
  listening = null,
  playing = false,
  onListen,
  voiced,
  speaker = null,
  translation = null,
  translated,
  onToggleTranslation,
  onParagraphLayout,
}: {
  story: Pick<StoryDetail, 'dialect' | 'paragraphs' | 'glossary'>;
  fontSize?: number;
  /** the sentence being read aloud */
  current?: TextPoint | null;
  /** the passage a reveal points at */
  evidence?: TextPoint | null;
  onGloss?: (entry: StoryGlossEntry) => void;
  /** a tap on the sentence being read: say it again */
  onReplay?: () => void;
  /** paragraphs that have recordings */
  listenable?: ReadonlySet<number>;
  /** the paragraph whose Listen is active */
  listening?: number | null;
  playing?: boolean;
  onListen?: (paragraph: number) => void;
  /** paragraphs with a sentence a character says */
  voiced?: ReadonlySet<number>;
  /** the character saying the sentence being read, and the paragraph it is in */
  speaker?: { paragraph: number; view: ReactNode } | null;
  /** the paragraphs' translation, aligned with them, and the language it is in */
  translation?: { paragraphs: readonly string[]; lang: string } | null;
  /** the paragraphs whose translation is open */
  translated?: ReadonlySet<number>;
  onToggleTranslation?: (paragraph: number) => void;
  onParagraphLayout?: (paragraph: number, y: number) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const lineHeight = storyLineHeight(fontSize);
  const textStyle = storyTextStyle(story.dialect);
  const textProps = storyTextProps(story.dialect);
  const tint = readingTint(colors.gold);
  const translationEnglish = translation?.lang === 'en' && locale !== 'en';

  return (
    <View style={styles.wrap}>
      {story.paragraphs.map((paragraph, pi) => {
        const segments = paragraphSegments(paragraph, onGloss ? story.glossary : []);
        const isEvidence = evidence?.paragraph === pi;
        const active = listening === pi;
        const translatedText = translation?.paragraphs[pi];
        const showTranslation = !!translatedText && !!translated?.has(pi);
        return (
          <View
            key={pi}
            onLayout={onParagraphLayout ? (e) => onParagraphLayout(pi, e.nativeEvent.layout.y) : undefined}
            style={[styles.paragraph, isEvidence && evidence?.sentence === null ? { backgroundColor: colors.successFill } : null]}
          >
            {onListen && listenable?.has(pi) ? (
              // on the side the paragraph starts from, the character (when one says it) after the button
              <View style={[styles.listenRow, { flexDirection: storyRowDirection(story.dialect) }, voiced?.has(pi) && styles.voicedRow]}>
                <Pressable
                  onPress={() => onListen(pi)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    active && playing ? t('stories.reader.pauseParagraph', { n: pi + 1 }) : t('stories.reader.listenParagraph', { n: pi + 1 })
                  }
                  style={({ pressed }) => [
                    styles.listen,
                    { backgroundColor: active ? colors.primary : colors.controlTrack, opacity: pressed ? pressedDim : 1 },
                  ]}
                >
                  <Icon name={active && playing ? 'audio-pause' : 'headphones'} size={16} color={active ? colors.textOnPrimary : colors.primary} />
                  <Text style={[styles.listenText, { color: active ? colors.textOnPrimary : colors.primary }]}>
                    {active && playing ? t('stories.reader.pause') : t('stories.reader.listen')}
                  </Text>
                </Pressable>
                {speaker?.paragraph === pi ? speaker.view : null}
              </View>
            ) : null}
            <Text {...textProps} style={[styles.body, { fontSize, lineHeight, color: colors.textPrimary }, textStyle]}>
              {segments.map((seg, si) => {
                const reading = seg.sentence !== null && current?.paragraph === pi && current.sentence === seg.sentence;
                const lit = reading || (seg.sentence !== null && isEvidence && evidence?.sentence === seg.sentence);
                const bg = lit ? { backgroundColor: reading ? tint : colors.successFill } : null;
                if (seg.gloss && onGloss) {
                  const entry = seg.gloss;
                  return (
                    <Text
                      key={si}
                      onPress={() => onGloss(entry)}
                      style={[styles.gloss, { textDecorationColor: colors.gold, color: colors.textPrimary }, bg]}
                      suppressHighlighting={false}
                    >
                      {seg.text}
                    </Text>
                  );
                }
                // the sentence keeps its own words for a screen reader; what a tap on it does is the hint
                return (
                  <Text
                    key={si}
                    style={bg}
                    onPress={reading && onReplay ? onReplay : undefined}
                    accessibilityHint={reading && onReplay ? t('stories.player.replay') : undefined}
                  >
                    {seg.text}
                  </Text>
                );
              })}
            </Text>
            {translatedText && onToggleTranslation ? (
              <View style={[styles.translationRow, { alignItems: textStyle.textAlign === 'right' ? 'flex-end' : 'flex-start' }]}>
                {showTranslation ? (
                  <Text
                    {...(translationEnglish ? ENGLISH_TEXT_PROPS : {})}
                    style={[styles.translation, { fontSize: Math.round(fontSize * 0.88), lineHeight: Math.round(fontSize * 0.88 * 1.5), color: colors.textSecondary }, translationEnglish ? ENGLISH_TEXT_STYLE : null]}
                  >
                    {translatedText}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => onToggleTranslation(pi)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showTranslation }}
                  accessibilityLabel={showTranslation ? t('stories.reader.hideTranslationOf', { n: pi + 1 }) : t('stories.reader.translationOf', { n: pi + 1 })}
                  hitSlop={6}
                  style={({ pressed }) => [styles.translationToggle, pressed && heldDim]}
                >
                  <Icon name="translate" size={14} color={colors.textSecondary} />
                  <Text style={[styles.translationToggleText, { color: colors.textSecondary }]}>
                    {showTranslation ? t('stories.reader.hideTranslation') : t('stories.reader.translation')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  paragraph: { gap: spacing.xs, borderRadius: radii.sm },
  // the serif at book weight: the headings' face, without the headings' heaviness
  body: { fontFamily: displayFont, fontWeight: typography.weights.regular },
  listenRow: { alignItems: 'center', gap: spacing.sm },
  voicedRow: { minHeight: CHARACTER_SIZE.row },
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
  },
  listenText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  gloss: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  translationRow: { gap: spacing.xs },
  translation: { fontFamily: displayFont, fontStyle: 'italic' },
  translationToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32, paddingHorizontal: spacing.xs },
  translationToggleText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
});
