import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import type { NewWord } from '@kurda/shared';
import { Pressable } from '../../theme/Pressable';
import { hitSlopFor } from '../../a11y/a11y';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { knownVoice, type CharacterReaction } from '../../characters/SpeakingCharacter';
import { Icon } from '../../theme/Icon';
import { AnswerMotion } from '../../theme/MotionParts';
import { useTheme } from '../../theme/ThemeProvider';
import { display } from '../../theme/fonts';
import { pressedDim } from '../../theme/motion';
import { fontScaleCap, radii, spacing, typography } from '../../theme/tokens';
import { lineIsEnglish } from '../asks';
import type { Exercise } from '../types';
import type { AudioControls } from '../useAudio';
import { useValley } from '../ValleyScope';
import { PlayDisc } from './ModelButton';
import { PromptScene, saidStyle } from './SpeechBubble';
import { PromptWords } from './PromptWords';

/*
 * The parts of a question that says what it asks (`ask`): the line alone in
 * the bubble, with its play and slow play; the cue under it; the gap a
 * missing word goes in; and the badge over a question that brings in a new
 * word. An item without an ask is drawn as it always was, and uses none of
 * these.
 */

/** The play mark at the start of the bubble: drawn smaller than a fingertip, and reaching one. */
const SPEAKER = 32;

/** A picture item's word, alone in the bubble: large, since it is the whole question. */
const PICTURE_WORD = display(32);

/** An English line, to be put into Kurdish: the reading face, a step under the Kurdish line's size, for it is not the Kurdish. */
const ENGLISH: TextStyle = { fontSize: typography.sizes.md + 2, lineHeight: 25, fontWeight: typography.weights.semibold, writingDirection: 'ltr' };

/** How a gap stands: waiting, holding the word chosen or typed, or graded. */
export type GapState = 'empty' | 'filled' | 'right' | 'wrong';

/**
 * The question's character beside a bubble holding the line alone.
 *
 * A Kurdish line is set in the display face, its words a tap away from what
 * they mean (new words first, and dotted in gold), with the round play mark
 * at its start and "Slow" under the bubble whenever the native recording may
 * be heard before answering — said by its character, whose mouth follows it.
 * An English line, which the learner is to put into Kurdish, is plain words
 * with nothing to play: there is no recording of it, and the Kurdish one
 * would give the answer away. A picture item's line is its one Kurdish word,
 * set large. A 'missing' item's line has the slot its word goes in (`gap`).
 * The cue, when the line alone could be read two ways, is a small pill under
 * the bubble.
 */
export function AskScene({
  exercise,
  model,
  reaction,
  gap,
}: {
  exercise: Exercise;
  /** the item's native recording, to play from the bubble (`useAudio(exercise.modelAudioUrl)`) */
  model: AudioControls;
  reaction: CharacterReaction | null;
  /** a 'missing' item's gap: the word in it, and how it stands */
  gap?: { word: string | null; state: GapState };
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const english = lineIsEnglish(exercise.ask);
  const playable = !english && model.supported && !model.error;
  const voice = english ? null : knownVoice(exercise.modelAudioVoice);
  // lit while it plays slowly, so a tap on it is seen to have done something
  const [slow, setSlow] = useState(false);
  const { playing, play } = model;
  useEffect(() => {
    if (!playing) setSlow(false);
  }, [playing]);
  const say = (): void => {
    setSlow(false);
    play(1);
  };
  const saySlowly = (): void => {
    setSlow(true);
    play(0.75);
  };

  const line = exercise.prompt ?? '';
  if (!line) return null;
  const face: StyleProp<TextStyle> = [exercise.ask === 'picture' ? PICTURE_WORD : saidStyle(line), { color: colors.textPrimary }];
  const below =
    exercise.cue || playable ? (
      <View style={[styles.below, { flexDirection: dir.row }]}>
        {exercise.cue ? <CuePill cue={exercise.cue} /> : <View />}
        {playable ? <SlowButton onPress={saySlowly} lit={slow && playing} /> : null}
      </View>
    ) : undefined;

  return (
    <PromptScene voice={voice} audio={english ? null : model} reaction={reaction} onReplay={playable ? say : undefined} below={below}>
      <View style={[styles.said, { flexDirection: dir.row }]}>
        {playable ? (
          <Pressable
            onPress={say}
            accessibilityRole="button"
            accessibilityLabel={t('lesson.speak.playModel')}
            hitSlop={hitSlopFor(SPEAKER, SPEAKER)}
            style={({ pressed }) => [styles.play, pressed && styles.pressed]}
          >
            <PlayDisc size={SPEAKER} playing={playing && !slow} />
          </Pressable>
        ) : null}
        <View style={styles.grow}>
          {english ? (
            <Text style={[ENGLISH, dir.rtl && styles.englishOnRtl, { color: colors.textPrimary }]} testID="ask-line">
              {line}
            </Text>
          ) : (
            <View testID="ask-line">
              <PromptWords
                prompt={line}
                tokens={exercise.promptTokens}
                newWords={exercise.newWords}
                gap={gap ? <GapSlot word={gap.word} state={gap.state} style={face} /> : undefined}
                style={face}
              />
            </View>
          )}
        </View>
      </View>
    </PromptScene>
  );
}

/**
 * "Slow": the line again at three quarters of its speed, as often as wanted —
 * a small chip under the bubble with the speaker in it, lit in the
 * pomegranate's red while it plays slowly. The same under a listening clip.
 */
export function SlowButton({ onPress, disabled = false, lit = false }: { onPress: () => void; disabled?: boolean; lit?: boolean }): React.JSX.Element {
  const { t } = useI18n();
  const valley = useValley();
  const ink = lit ? valley.redText : valley.chipInk;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t('lesson.listen.playSlow')}
      accessibilityState={{ disabled }}
      hitSlop={hitSlopFor(64, SLOW)}
      style={({ pressed }) => [styles.slow, { backgroundColor: lit ? valley.redWash : valley.chip }, (pressed || disabled) && styles.pressed]}
    >
      <Icon name="speaker-high" size={14} color={ink} />
      <Text style={[styles.slowText, { color: ink }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
        {t('lesson.listen.slow')}
      </Text>
    </Pressable>
  );
}

/** A few words of context beside the line ("to two people"), quiet under the bubble. */
export function CuePill({ cue }: { cue: string }): React.JSX.Element {
  const valley = useValley();
  return (
    <View style={[styles.cue, { backgroundColor: valley.track }]} testID="ask-cue">
      <Text style={[styles.cueText, { color: valley.muted }]} numberOfLines={2}>
        {cue}
      </Text>
    </View>
  );
}

/**
 * The gap in a 'missing' item's line: an empty slot a word wide on a ruled
 * line, until a word is chosen or typed into it; then the word itself, in the
 * line's own face, on the pomegranate's red rule — and, once graded, on the
 * verdict's green or red, popping or shaking as an option does. A screen
 * reader hears "Missing word" until there is one, and the word after.
 */
export function GapSlot({ word, state, style }: { word: string | null; state: GapState; style?: StyleProp<TextStyle> }): React.JSX.Element {
  const { t } = useI18n();
  const valley = useValley();
  const filled = !!word && word.length > 0;
  const rule = state === 'right' ? valley.green : state === 'wrong' ? valley.wrong : filled ? valley.red : valley.muted;
  const ink = state === 'right' ? valley.greenText : state === 'wrong' ? valley.wrongText : valley.ink;
  return (
    <AnswerMotion verdict={state === 'right' ? 'right' : state === 'wrong' ? 'wrong' : null}>
      <View style={styles.gap} accessibilityLabel={filled ? word : t('lesson.gap.empty')} testID="ask-gap">
        <Text style={[style, styles.gapWord, { color: filled ? ink : 'transparent' }]}>{filled ? word : ' '}</Text>
        <View style={[styles.rule, { backgroundColor: rule }]} />
      </View>
    </AnswerMotion>
  );
}

/**
 * Over a question that brings in a word for the first time, in the place of
 * the lesson's name: "New word", in a small pill of the sun's gold with a red
 * sparkle at its start. A screen reader hears which words are new.
 */
export function NewWordBadge({ words }: { words: NewWord[] }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const valley = useValley();
  const dir = useDirection();
  const label = t(words.length > 1 ? 'lesson.newWords' : 'lesson.newWord');
  return (
    <View
      style={[styles.badge, { flexDirection: dir.row, alignSelf: dir.rtl ? 'flex-end' : 'flex-start', backgroundColor: colors.gold }]}
      accessible
      accessibilityLabel={`${label}: ${words.map((w) => w.ku).join(', ')}`}
      testID="lesson-new-word"
    >
      <Icon name="sparkle" size={12} color={valley.red} />
      <Text style={[styles.badgeText, { color: colors.textOnGold }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
        {label}
      </Text>
    </View>
  );
}

/** The slow chip's height: a fingertip with its reach. */
const SLOW = 30;

/** The gap's least width, about a short word's: it grows with the word put in it. */
const GAP_WIDTH = 64;

/** The badge's height, the lesson name's line it stands in for and a little more. */
export const BADGE = 22;

const styles = StyleSheet.create({
  // the play mark at the top of the bubble's start, however many lines follow it
  said: { alignItems: 'flex-start', gap: spacing.sm + 2 },
  play: { marginTop: 1 },
  grow: { flexShrink: 1, flexGrow: 1 },
  pressed: { opacity: pressedDim },
  englishOnRtl: { textAlign: 'left' },
  below: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.xs },
  slow: {
    height: SLOW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radii.pill,
  },
  slowText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 0.3 },
  cue: { flexShrink: 1, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm + 4, borderRadius: radii.pill },
  cueText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.medium },
  gap: { minWidth: GAP_WIDTH, alignItems: 'center', marginHorizontal: 2 },
  gapWord: { paddingHorizontal: spacing.xs },
  rule: { alignSelf: 'stretch', height: 2.5, borderRadius: radii.pill, marginTop: -1 },
  badge: { height: BADGE, alignItems: 'center', gap: spacing.xs + 1, paddingHorizontal: spacing.sm + 2, borderRadius: radii.pill },
  badgeText: { fontSize: 11, lineHeight: 15, fontWeight: typography.weights.bold, letterSpacing: 1.2, textTransform: 'uppercase' },
});
