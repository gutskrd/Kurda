import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StoryDetail, StoryGlossEntry } from '@kurda/shared';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { CHARACTER_SIZE } from '../characters/voice';
import { paragraphSegments } from './segments';
import { storyRowDirection, storyTextProps, storyTextStyle } from './storyText';

/** The reader's body size before the text-size control and the system's Dynamic Type. */
export const STORY_BODY_SIZE = 18;

/**
 * The spacing between lines for a body size: generous, for reading. The
 * system's text size is not in it — React Native applies that to the line
 * height itself, as it does to the letters.
 */
export function storyLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.6);
}

export interface TextPoint {
  paragraph: number;
  sentence: number | null;
}

/**
 * A story's paragraphs, as the reader and the game's "Story" sheet show them.
 *
 * Body text follows the system text size (Dynamic Type) on top of the
 * reader's own control. React Native scales the line height by the system
 * factor together with the letters (iOS multiplies it, Android reads it in
 * sp), so the spacing is given here for the reader's size only: scaling it
 * again by the system factor spread large text out to twice its spacing.
 *
 * Glossary words are underlined and open their meaning when tapped. A word
 * inside a paragraph cannot be reached on its own with VoiceOver or TalkBack,
 * which is why the reader also lists them under "Words in this story" — that
 * list is the accessible way to the same meanings, not a duplicate.
 *
 * Tapping text never plays sound; a paragraph with recordings has its own
 * Listen button. While a sentence an editor has given a character to is read,
 * that character says it beside its paragraph's Listen; a paragraph with such
 * a sentence keeps the room for it, so nothing moves when it appears.
 */
export function StoryText({
  story,
  fontSize = STORY_BODY_SIZE,
  current = null,
  evidence = null,
  onGloss,
  listenable,
  listening = null,
  playing = false,
  onListen,
  voiced,
  speaker = null,
  onParagraphLayout,
}: {
  story: Pick<StoryDetail, 'dialect' | 'paragraphs' | 'glossary'>;
  fontSize?: number;
  /** the sentence being read aloud */
  current?: TextPoint | null;
  /** the passage a reveal points at */
  evidence?: TextPoint | null;
  onGloss?: (entry: StoryGlossEntry) => void;
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
  onParagraphLayout?: (paragraph: number, y: number) => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const lineHeight = storyLineHeight(fontSize);
  const textStyle = storyTextStyle(story.dialect);
  const textProps = storyTextProps(story.dialect);

  return (
    <View style={styles.wrap}>
      {story.paragraphs.map((paragraph, pi) => {
        const segments = paragraphSegments(paragraph, onGloss ? story.glossary : []);
        const isEvidence = evidence?.paragraph === pi;
        const active = listening === pi;
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
                    { backgroundColor: active ? colors.primary : colors.controlTrack, opacity: pressed ? 0.8 : 1 },
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
            <Text {...textProps} style={[{ fontSize, lineHeight, color: colors.textPrimary }, textStyle]}>
              {segments.map((seg, si) => {
                const lit =
                  seg.sentence !== null &&
                  ((current?.paragraph === pi && current.sentence === seg.sentence) ||
                    (isEvidence && evidence?.sentence === seg.sentence));
                const bg = lit ? { backgroundColor: colors.successFill } : null;
                if (seg.gloss && onGloss) {
                  const entry = seg.gloss;
                  return (
                    <Text
                      key={si}
                      onPress={() => onGloss(entry)}
                      style={[styles.gloss, { textDecorationColor: colors.primary, color: colors.textPrimary }, bg]}
                      suppressHighlighting={false}
                    >
                      {seg.text}
                    </Text>
                  );
                }
                return (
                  <Text key={si} style={bg}>
                    {seg.text}
                  </Text>
                );
              })}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  paragraph: { gap: spacing.xs, borderRadius: radii.sm },
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
});
