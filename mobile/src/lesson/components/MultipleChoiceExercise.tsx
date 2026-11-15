import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { hitSlopFor } from '../../a11y/a11y';
import { fontScaleCap, radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../theme/Icon';
import { AnswerMotion, DrawnCheck } from '../../theme/MotionParts';
import { Tile, type TileState } from '../../theme/Tile';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import { useDirection } from '../../reports/direction';
import { knownVoice } from '../../characters/SpeakingCharacter';
import type { Feedback } from '../player';
import type { Exercise } from '../types';
import { useAudio } from '../useAudio';
import { useValley } from '../ValleyScope';
import { CARD } from '../valley';
import { ExerciseHeadline } from './ExerciseHeadline';
import { PlayDisc } from './ModelButton';
import { PromptScene, saidStyle } from './SpeechBubble';
import { PromptWords } from './PromptWords';
import { pressedDim } from '../../theme/motion';

interface Props {
  exercise: Exercise;
  choice: number | null;
  onSelect: (index: number) => void;
  disabled: boolean;
  /** the verdict, once the answer is graded; null while choosing */
  feedback?: Feedback | null;
  /**
   * a question of its own, with its headline and its asker; false for one
   * that is part of something bigger (a conversation's question), set plainly
   */
  standalone?: boolean;
}

/**
 * Choose one. The question is said in a speech bubble by whoever says its
 * recording (Hevalo, when nobody does), and the options are cream cards, each
 * with its number in a round chip at its start: the one chosen is ringed in
 * the pomegranate's red. Once it is graded the options answer back, and not
 * by colour alone: the one chosen pops and a check draws into its chip when it
 * was right, or shakes with a cross there when it was not — and then the
 * right one is marked with a check as well, so the answer is on the screen
 * where it was asked. The rest step back.
 *
 * When the question's Kurdish has a native recording that gives nothing away
 * (the server sends it only then), the bubble carries a round play mark at
 * its start and says it when tapped, as its character does.
 */
export function MultipleChoiceExercise({ exercise, choice, onSelect, disabled, feedback = null, standalone = true }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const options = exercise.options ?? [];
  const model = useAudio(exercise.modelAudioUrl);
  const voice = knownVoice(exercise.modelAudioVoice);
  // the right option is the one chosen when it was accepted, else the one the correction names
  const isRight = (i: number): boolean => (feedback ? (feedback.accepted ? i === choice : feedback.correction === options[i]) : false);
  const say = model.supported ? () => model.play(1) : undefined;
  const choose = (i: number): void => {
    if (i !== choice) haptic('select');
    onSelect(i);
  };
  return (
    <View style={styles.container}>
      {standalone ? <ExerciseHeadline>{t('lesson.choose.prompt')}</ExerciseHeadline> : null}
      {standalone && exercise.prompt ? (
        <PromptScene
          voice={voice}
          audio={model}
          reaction={feedback ? (feedback.accepted ? 'cheer' : 'hmm') : null}
          onReplay={say}
        >
          <View style={[styles.said, { flexDirection: dir.row }]}>
            {say ? (
              <Pressable
                onPress={say}
                accessibilityRole="button"
                accessibilityLabel={t('lesson.speak.playModel')}
                hitSlop={hitSlopFor(SPEAKER, SPEAKER)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <PlayDisc size={SPEAKER} playing={model.playing} />
              </Pressable>
            ) : null}
            <View style={styles.grow}>
              <PromptWords prompt={exercise.prompt} tokens={exercise.promptTokens} style={[saidStyle(exercise.prompt), { color: colors.textPrimary }]} />
            </View>
          </View>
        </PromptScene>
      ) : exercise.prompt ? (
        <Text style={[styles.prompt, { color: colors.textPrimary }]}>{exercise.prompt}</Text>
      ) : null}
      <View style={styles.options}>
        {options.map((option, i) => {
          const selected = choice === i;
          const right = isRight(i);
          const wrong = !!feedback && selected && !right;
          const verdict = !feedback || !selected ? null : right ? 'right' : 'wrong';
          const state: TileState = right ? 'right' : wrong ? 'wrong' : feedback ? 'disabled' : selected ? 'picked' : 'idle';
          return (
            <AnswerMotion key={i} verdict={verdict}>
              <Tile
                state={state}
                disabled={disabled}
                onPress={() => choose(i)}
                accessibilityRole="radio"
                accessibilityLabel={right ? `${option}, ${t('lesson.correct')}` : option}
                selected={selected}
                faceStyle={[styles.option, { flexDirection: dir.row }]}
              >
                {(ink) => (
                  <>
                    <Chip state={state} selected={selected} n={formatNumber(i + 1, locale)} />
                    <Text style={[styles.optionText, dir.free, { color: ink }]}>{option}</Text>
                  </>
                )}
              </Tile>
            </AnswerMotion>
          );
        })}
      </View>
    </View>
  );
}

/**
 * An option's round chip, at its start: its number while it waits, in the
 * pomegranate's red once chosen, and the verdict's mark once graded — a check
 * that draws in on the one chosen right (and stands on the right one beside a
 * miss), a cross on the one chosen wrong. Its number is a place in the list
 * and nothing more on a phone, so it is not read out: the option's own label
 * is, with its verdict.
 */
function Chip({ state, selected, n }: { state: TileState; selected: boolean; n: string }): React.JSX.Element {
  const valley = useValley();
  const fill = state === 'right' ? valley.green : state === 'wrong' ? valley.wrong : state === 'picked' ? valley.red : valley.chip;
  const ink = state === 'right' ? valley.onGreen : state === 'wrong' ? valley.onWrong : state === 'picked' ? valley.onRed : valley.chipInk;
  return (
    <View style={[styles.chip, { backgroundColor: fill }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {state === 'right' ? (
        selected ? (
          <DrawnCheck size={CHIP_MARK} color={ink} />
        ) : (
          <Icon name="check" size={CHIP_MARK} color={ink} />
        )
      ) : state === 'wrong' ? (
        <Icon name="close" size={CHIP_MARK} color={ink} />
      ) : (
        <Text style={[styles.chipText, { color: ink }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
          {n}
        </Text>
      )}
    </View>
  );
}

/** The play mark in the bubble, drawn smaller than a fingertip and reaching one. */
const SPEAKER = 32;

/** An option's chip, and the mark drawn in it. */
const CHIP = 26;
const CHIP_MARK = 15;

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  // the play mark at the top of the bubble's start, however many lines follow it
  said: { alignItems: 'flex-start', gap: spacing.sm + 2 },
  grow: { flexShrink: 1 },
  pressed: { opacity: pressedDim },
  options: { gap: spacing.sm + 2 },
  // the lesson's cards, the words from the start beside the chip
  option: {
    justifyContent: 'flex-start',
    gap: spacing.sm + 4,
    minHeight: 56,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md - 2,
    borderRadius: CARD.radius,
    borderWidth: CARD.edge,
  },
  optionText: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  chip: { width: CHIP, height: CHIP, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: typography.weights.bold },
});
