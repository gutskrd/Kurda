import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { hueSteps, storyHeadingTitle, type HueScheme, type StoryDetail, type StoryGlossEntry } from '@kurda/shared';
import { MIN_TOUCH_TARGET, REACH_OPEN, reachSlop } from '../a11y/a11y';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { display, sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { CHARACTER_SIZE } from '../characters/voice';
import { paragraphSegments } from './segments';
import { translatedHeading } from './legend';
import { ENGLISH_TEXT_PROPS, ENGLISH_TEXT_STYLE, storyRowDirection, storyTextProps, storyTextStyle } from './storyText';
import { pressedDim } from '../theme/motion';
import { heldDim } from '../theme/MotionParts';

/** The reader's body size before the text-size control and Dynamic Type. */
export const STORY_BODY_SIZE = typography.sizes.text;

/** Line height for a body size: the design's generous 1.65. React Native applies the system text size to it already. */
export function storyLineHeight(fontSize: number): number {
  return Math.round(fontSize * 1.65);
}

/** The band behind the sentence being read: the page's warm wash, as for everything that says "here". Text keeps 14:1 by day and 11:1 by night. */
function readingTint(scheme: HueScheme): string {
  return hueSteps(scheme, 'violet').wash;
}

interface TextPoint {
  paragraph: number;
  sentence: number | null;
}

/**
 * A story's paragraphs, as the reader and the game's Story sheet show them, in the display serif with generous
 * leading. Text follows Dynamic Type on top of the reader's own control; line height is given for the reader's size
 * only, since React Native scales it by the system factor itself.
 *
 * Glossary words have a dotted ink underline and open their meaning when tapped. Screen readers cannot reach a
 * word inside a paragraph, which is why the reader also lists them under "Key vocabulary". A paragraph with a
 * translation gets a small "Translation" toggle.
 *
 * A paragraph starting "## " is a legend's chapter heading, set as a heading and never glossed, read aloud or
 * translated by toggle. Paragraphs before the first heading are the introduction, closed by a short rule.
 *
 * Tapping text never plays sound: a paragraph with recordings has its own Listen, and tapping the highlighted
 * sentence replays it. A character speaking a sentence appears beside its paragraph's Listen, whose row keeps room
 * for it so nothing moves.
 */
export function StoryText({
  story,
  fontSize = STORY_BODY_SIZE,
  current = null,
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
  /** The sentence being read aloud. */
  current?: TextPoint | null;
  onGloss?: (entry: StoryGlossEntry) => void;
  /** A tap on the sentence being read replays it. */
  onReplay?: () => void;
  /** Paragraphs with recordings. */
  listenable?: ReadonlySet<number>;
  /** The paragraph whose Listen is active. */
  listening?: number | null;
  playing?: boolean;
  onListen?: (paragraph: number) => void;
  /** Paragraphs with a sentence a character says. */
  voiced?: ReadonlySet<number>;
  /** The character saying the current sentence, and its paragraph. */
  speaker?: { paragraph: number; view: ReactNode } | null;
  /** The paragraphs' translation, aligned with them, and its language. */
  translation?: { paragraphs: readonly string[]; lang: string } | null;
  /** Paragraphs whose translation is open. */
  translated?: ReadonlySet<number>;
  onToggleTranslation?: (paragraph: number) => void;
  onParagraphLayout?: (paragraph: number, y: number) => void;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const lineHeight = storyLineHeight(fontSize);
  const textStyle = storyTextStyle(story.dialect);
  const textProps = storyTextProps(story.dialect);
  const tint = readingTint(scheme);
  const translationEnglish = translation?.lang === 'en' && locale !== 'en';
  // Each heading's chapter number, and where the introduction ends (the first heading).
  const chapterOf = new Map<number, number>();
  story.paragraphs.forEach((p, i) => {
    if (storyHeadingTitle(p) !== null) chapterOf.set(i, chapterOf.size + 1);
  });
  const firstHeading = chapterOf.size > 0 ? Math.min(...chapterOf.keys()) : -1;

  return (
    <View style={styles.wrap}>
      {story.paragraphs.map((paragraph, pi) => {
        const heading = storyHeadingTitle(paragraph);
        if (heading !== null) {
          const n = chapterOf.get(pi) ?? 1;
          const under = translatedHeading(translation?.paragraphs[pi]);
          return (
            <View
              key={pi}
              onLayout={onParagraphLayout ? (e) => onParagraphLayout(pi, e.nativeEvent.layout.y) : undefined}
              style={[styles.chapter, pi > 0 && styles.chapterAfter]}
              testID={`story-chapter-${n}`}
            >
              {/* The end of the introduction: a quiet rule, and the chapter number in the page's quiet ink. */}
              {pi === firstHeading && firstHeading > 0 ? <View style={[styles.rule, { backgroundColor: colors.textSecondary }]} /> : null}
              <Text style={[sectionLabel, styles.centred, { color: colors.textSecondary }]}>{t('stories.reader.chapterN', { n })}</Text>
              <Text
                {...textProps}
                accessibilityRole="header"
                style={[display(typography.sizes.title), { lineHeight: Math.round(typography.sizes.title * 1.25), color: colors.textPrimary }, textStyle, styles.centred]}
              >
                {heading}
              </Text>
              {under && under !== heading ? (
                <Text
                  {...(translationEnglish ? ENGLISH_TEXT_PROPS : {})}
                  style={[{ fontSize, color: colors.textSecondary }, translationEnglish ? ENGLISH_TEXT_STYLE : null, styles.centred]}
                >
                  {under}
                </Text>
              ) : null}
            </View>
          );
        }
        const segments = paragraphSegments(paragraph, onGloss ? story.glossary : []);
        const active = listening === pi;
        const translatedText = translation?.paragraphs[pi];
        const showTranslation = !!translatedText && !!translated?.has(pi);
        return (
          <View
            key={pi}
            onLayout={onParagraphLayout ? (e) => onParagraphLayout(pi, e.nativeEvent.layout.y) : undefined}
            style={styles.paragraph}
          >
            {pi === 0 && firstHeading > 0 ? (
              <Text style={[sectionLabel, { color: colors.textSecondary }, textStyle]} accessibilityRole="header">
                {t('stories.reader.introduction')}
              </Text>
            ) : null}
            {onListen && listenable?.has(pi) ? (
              // On the paragraph's starting side: the button, then the speaking character.
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
                const bg = reading ? { backgroundColor: tint } : null;
                if (seg.gloss && onGloss) {
                  const entry = seg.gloss;
                  return (
                    <Text
                      key={si}
                      onPress={() => onGloss(entry)}
                      // A tappable word's dotted underline is the ink of what can be pressed.
                      style={[styles.gloss, { textDecorationColor: colors.primary, color: colors.textPrimary }, bg]}
                      suppressHighlighting={false}
                    >
                      {seg.text}
                    </Text>
                  );
                }
                // The sentence keeps its own words for screen readers; the hint says what a tap does.
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
                    style={[styles.translation, { fontSize, lineHeight: Math.round(fontSize * 1.5), color: colors.textSecondary }, translationEnglish ? ENGLISH_TEXT_STYLE : null]}
                  >
                    {translatedText}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => onToggleTranslation(pi)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showTranslation }}
                  accessibilityLabel={showTranslation ? t('stories.reader.hideTranslationOf', { n: pi + 1 }) : t('stories.reader.translationOf', { n: pi + 1 })}
                  hitSlop={TRANSLATION_TOGGLE_REACH}
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

/** The translation toggle's drawn height. */
const TRANSLATION_TOGGLE_HEIGHT = 32;

/**
 * The toggle reaches 8 past its sides and foot, where the next paragraph is a whole gap away. Above it the
 * paragraph's last line is only the paragraph gap away and its glossary words have no reach of their own, so the
 * toggle takes that gap and no more.
 */
const TRANSLATION_TOGGLE_REACH = reachSlop(null, TRANSLATION_TOGGLE_HEIGHT, { edge: REACH_OPEN, limit: { top: spacing.xs } });

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  paragraph: { gap: spacing.xs, borderRadius: radii.sm },
  // The serif at book weight: the headings' face without their heaviness.
  body: { fontWeight: typography.weights.regular },
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
  listenText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  gloss: { textDecorationLine: 'underline', textDecorationStyle: 'dotted' },
  translationRow: { gap: spacing.xs },
  translation: { fontStyle: 'italic' },
  chapter: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  // A chapter starts a little further from what precedes it than a paragraph does.
  chapterAfter: { marginTop: spacing.md },
  // The page's quiet ink, softened to about 2:1 on the paper in both schemes; the separator colour was too faint.
  rule: { width: 32, height: 2, borderRadius: radii.pill, marginBottom: spacing.lg, opacity: 0.4 },
  centred: { textAlign: 'center' },
  translationToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: TRANSLATION_TOGGLE_HEIGHT, paddingHorizontal: spacing.xs },
  translationToggleText: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
});
