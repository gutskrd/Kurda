import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import type { NewWord } from '@kurda/shared';
import { Pressable } from '../../theme/Pressable';
import { reachSlop } from '../../a11y/a11y';
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
import { useAutoplayOnce } from '../useAutoplay';
import { autoplayOn } from '../../feedback/autoplayPref';
import { useValley } from '../ValleyScope';
import { PlayDisc } from './ModelButton';
import { PromptScene, saidStyle } from './SpeechBubble';
import { PromptWords } from './PromptWords';

/*
 * The parts of a question with an `ask`: the line alone in the bubble with play and slow play, the cue under it, the
 * gap for a missing word, and the "New word" badge. Items without an ask use none of these.
 */

/** The bubble's play mark, drawn smaller than a fingertip but reaching one. */
const SPEAKER = 32;

/** A picture item's word alone in the bubble, large since it is the whole question. */
const PICTURE_WORD = display(32);

/** An English line to put into Kurdish: the reading face, a step under the Kurdish line's size. */
const ENGLISH: TextStyle = { fontSize: typography.sizes.text, lineHeight: 25, fontWeight: typography.weights.semibold, writingDirection: 'ltr' };

/** A gap's state: waiting, holding the chosen or typed word, or graded. */
export type GapState = 'empty' | 'filled' | 'right' | 'wrong';

/**
 * The question's character beside a bubble holding the line alone. A Kurdish line is in the display face with
 * tappable meanings (new words first, gold dots), a play mark, and "Slow" under the bubble when the recording may be
 * heard first, lip-synced by its character. An English line to translate has nothing to play, since the Kurdish
 * recording would give the answer away. A picture item's line is its one word, large; a 'missing' item's line holds
 * the slot (`gap`). A cue pill sits under the bubble when the line alone is ambiguous.
 */
export function AskScene({
  exercise,
  model,
  reaction,
  gap,
}: {
  exercise: Exercise;
  /** The item's native recording, to play from the bubble (`useAudio(exercise.modelAudioUrl)`). */
  model: AudioControls;
  reaction: CharacterReaction | null;
  /** A 'missing' item's gap: the word in it, and its state. */
  gap?: { word: string | null; state: GapState };
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const english = lineIsEnglish(exercise.ask);
  const playable = !english && model.supported && !model.error;
  const voice = english ? null : knownVoice(exercise.modelAudioVoice);
  // Lit while playing slowly, so the tap is seen to work.
  const [slow, setSlow] = useState(false);
  const { playing, play } = model;
  useEffect(() => {
    if (!playing) setSlow(false);
  }, [playing]);
  // Said on its turn, as the exercise appears, unless Settings keeps recordings to a tap.
  useAutoplayOnce(model, playable && autoplayOn());
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
            reachSize={{ width: SPEAKER, height: SPEAKER }}
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

/** "Slow": replays the line at 0.75× as often as wanted, a small chip under the bubble lit red while it plays. Also used under listening clips. */
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
      hitSlop={SLOW_REACH}
      style={({ pressed }) => [styles.slow, { backgroundColor: lit ? valley.redWash : valley.chip }, (pressed || disabled) && styles.pressed]}
    >
      <Icon name="speaker-high" size={14} color={ink} />
      <Text style={[styles.slowText, { color: ink }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
        {t('lesson.listen.slow')}
      </Text>
    </Pressable>
  );
}

/** A few words of context for the line ("to two people"), quiet under the bubble. */
function CuePill({ cue }: { cue: string }): React.JSX.Element {
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
 * The gap in a 'missing' item's line: an empty word-wide slot on a rule, then the chosen or typed word on a red
 * rule, and once graded on the verdict's colour, popping or shaking like an option. Screen readers hear "Missing
 * word" until filled, then the word.
 */
function GapSlot({ word, state, style }: { word: string | null; state: GapState; style?: StyleProp<TextStyle> }): React.JSX.Element {
  const { t } = useI18n();
  const valley = useValley();
  const filled = !!word && word.length > 0;
  const rule = state === 'right' ? valley.green : state === 'wrong' ? valley.wrong : filled ? valley.red : valley.muted;
  const ink = state === 'right' ? valley.greenText : state === 'wrong' ? valley.wrongText : valley.ink;
  return (
    <AnswerMotion verdict={state === 'right' ? 'right' : state === 'wrong' ? 'wrong' : null}>
      <View style={styles.gap} accessible accessibilityLabel={filled ? word : t('lesson.gap.empty')} testID="ask-gap">
        <Text style={[style, styles.gapWord, { color: filled ? ink : 'transparent' }]}>{filled ? word : ' '}</Text>
        <View style={[styles.rule, { backgroundColor: rule }]} />
      </View>
    </AnswerMotion>
  );
}

/** "New word" in a small gold pill with a red sparkle, in place of the lesson's name over a question introducing one. Screen readers hear which words. */
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

/*
 * The slow chip reaches down to 48 but only 4 up: in a listening item the bubble 4 above is its own button (replay
 * the clip), and the two reaches must not meet in that gap.
 */
const SLOW_REACH = reachSlop(null, SLOW, { limit: { top: spacing.xs } });

/** The gap's minimum width, about a short word's; it grows with the word in it. */
const GAP_WIDTH = 64;

/** The badge's height: the lesson name's line it replaces, and a little more. */
export const BADGE = 22;

const styles = StyleSheet.create({
  // The play mark at the top of the bubble's start, however many lines follow.
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
  slowText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, letterSpacing: 0.3 },
  cue: { flexShrink: 1, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm + 4, borderRadius: radii.pill },
  cueText: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium },
  gap: { minWidth: GAP_WIDTH, alignItems: 'center' },
  gapWord: { paddingHorizontal: 2 },
  rule: { alignSelf: 'stretch', height: 2.5, borderRadius: radii.pill, marginTop: -1 },
  badge: { height: BADGE, alignItems: 'center', gap: spacing.xs + 1, paddingHorizontal: spacing.sm + 2, borderRadius: radii.pill },
  badgeText: { fontSize: typography.sizes.text, lineHeight: 22, fontWeight: typography.weights.bold, letterSpacing: 1.2, textTransform: 'uppercase' },
});
