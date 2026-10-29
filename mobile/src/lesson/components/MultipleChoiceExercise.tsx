import { Pressable, StyleSheet, Text, View } from 'react-native';
import { hitSlopFor } from '../../a11y/a11y';
import { spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../theme/Icon';
import { AnswerMotion, DrawnCheck } from '../../theme/MotionParts';
import { Tile, type TileState } from '../../theme/Tile';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { knownVoice } from '../../characters/SpeakingCharacter';
import type { Feedback } from '../player';
import type { Exercise } from '../types';
import { useAudio } from '../useAudio';
import { ExerciseHeadline } from './ExerciseHeadline';
import { PromptScene } from './SpeechBubble';
import { PromptWords } from './PromptWords';

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
 * recording (Hevalo, when nobody does), and the options are tiles: the one
 * chosen takes the brand's ink. Once it is graded the options answer back,
 * and not by colour alone: the one chosen pops and a check draws in when it
 * was right, or shakes with a cross when it was not — and then the right one
 * is marked with a check as well, so the answer is on the screen where it was
 * asked.
 *
 * When the question's Kurdish has a native recording that gives nothing away
 * (the server sends it only then), the bubble carries a speaker and says it
 * when tapped, as its character does.
 */
export function MultipleChoiceExercise({ exercise, choice, onSelect, disabled, feedback = null, standalone = true }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
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
          <View style={styles.said}>
            {say ? (
              <Pressable
                onPress={say}
                accessibilityRole="button"
                accessibilityLabel={t('lesson.speak.playModel')}
                hitSlop={hitSlopFor(SPEAKER, SPEAKER)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <Icon name="speaker-high" size={SPEAKER} color={model.playing ? colors.goldText : colors.primary} />
              </Pressable>
            ) : null}
            <View style={styles.grow}>
              <PromptWords prompt={exercise.prompt} tokens={exercise.promptTokens} style={[styles.bubbleText, { color: colors.textPrimary }]} />
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
                faceStyle={styles.option}
              >
                {(ink) => (
                  <>
                    <Text style={[styles.optionText, { color: ink }]}>{option}</Text>
                    {right ? (
                      selected ? (
                        <DrawnCheck size={20} color={ink} />
                      ) : (
                        <Icon name="check" size={20} color={ink} />
                      )
                    ) : wrong ? (
                      <Icon name="close" size={20} color={ink} />
                    ) : null}
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

/** The speaker in the bubble, drawn smaller than a fingertip and reaching one. */
const SPEAKER = 26;

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  said: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flexShrink: 1 },
  pressed: { opacity: 0.6 },
  bubbleText: { fontSize: typography.sizes.lg, fontWeight: typography.weights.medium },
  options: { gap: spacing.sm },
  option: { flexDirection: 'row', gap: spacing.sm, minHeight: 56, paddingHorizontal: spacing.lg },
  optionText: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.medium, textAlign: 'center' },
});
