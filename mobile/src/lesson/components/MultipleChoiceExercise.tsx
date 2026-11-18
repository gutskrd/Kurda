import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../theme/Pressable';
import { spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { AnswerMotion } from '../../theme/MotionParts';
import { Tile, type TileState } from '../../theme/Tile';
import { display } from '../../theme/fonts';
import { haptic } from '../../feedback/haptics';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber } from '../../i18n/format';
import { useDirection } from '../../reports/direction';
import { knownVoice } from '../../characters/SpeakingCharacter';
import { askHeadline, optionsAreKurdish } from '../asks';
import type { Feedback } from '../player';
import type { Exercise } from '../types';
import { useAudio } from '../useAudio';
import { CARD } from '../valley';
import { AskScene, type GapState } from './AskParts';
import { PictureChoices, WordChoices } from './AskChoices';
import { ExerciseHeadline } from './ExerciseHeadline';
import { PlayDisc } from './ModelButton';
import { OptionChip } from './OptionChip';
import { PromptScene, saidStyle } from './SpeechBubble';
import { PromptWords } from './PromptWords';
import { pressedDim } from '../../theme/motion';

interface Props {
  exercise: Exercise;
  choice: number | null;
  onSelect: (index: number) => void;
  disabled: boolean;
  /** The verdict once graded; null while choosing. */
  feedback?: Feedback | null;
  /** A question of its own, with headline and asker; false for one within something bigger (a conversation's question). */
  standalone?: boolean;
}

/**
 * Choose one. The question is in a speech bubble said by whoever voices its recording (Hevalo by default), and the
 * options are cream cards with a numbered chip; the chosen one is ringed in red. Once graded, the choice pops with a
 * check if right, or shakes with a cross and the right one is checked too, so the answer is never colour alone.
 *
 * When the Kurdish has a recording that gives nothing away, the bubble carries a play mark. An item with `ask` gets
 * its headline and the line alone in the bubble (`AskScene`), answered by pictures (`PictureChoices`), gap words
 * (`WordChoices`) or option cards. A conversation's question has no bubble: it stands plainly under the
 * conversation in the display face, a step under the headline.
 */
export function MultipleChoiceExercise({ exercise, choice, onSelect, disabled, feedback = null, standalone = true }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const options = exercise.options ?? [];
  const model = useAudio(exercise.modelAudioUrl);
  const voice = knownVoice(exercise.modelAudioVoice);
  // The right option is the chosen one when accepted, else the one the correction names.
  const isRight = (i: number): boolean => (feedback ? (feedback.accepted ? i === choice : feedback.correction === options[i]) : false);
  const say = model.supported ? () => model.play(1) : undefined;
  const choose = (i: number): void => {
    if (i !== choice) haptic('select');
    onSelect(i);
  };
  const ask = standalone ? exercise.ask : undefined;
  const headline = standalone ? askHeadline(exercise) : null;
  const reaction = feedback ? (feedback.accepted ? 'cheer' : 'hmm') : null;
  const gap: GapState = feedback ? (choice !== null && isRight(choice) ? 'right' : 'wrong') : choice !== null ? 'filled' : 'empty';
  const kurdish = optionsAreKurdish(ask);
  const choices = { options, choice, onSelect, disabled, isRight, graded: !!feedback };
  return (
    <View style={styles.container}>
      {standalone ? <ExerciseHeadline>{headline ? t(headline.key, headline.params) : t('lesson.choose.prompt')}</ExerciseHeadline> : null}
      {ask && exercise.prompt ? (
        <AskScene
          exercise={exercise}
          model={model}
          reaction={reaction}
          gap={ask === 'missing' ? { word: choice !== null ? (options[choice] ?? null) : null, state: gap } : undefined}
        />
      ) : standalone && exercise.prompt ? (
        <PromptScene voice={voice} audio={model} reaction={reaction} onReplay={say}>
          <View style={[styles.said, { flexDirection: dir.row }]}>
            {say ? (
              <Pressable
                onPress={say}
                accessibilityRole="button"
                accessibilityLabel={t('lesson.speak.playModel')}
                reachSize={{ width: SPEAKER, height: SPEAKER }}
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
        <Text style={[styles.prompt, dir.free, { color: colors.textPrimary }]}>{exercise.prompt}</Text>
      ) : null}
      {ask === 'picture' ? (
        <PictureChoices {...choices} />
      ) : ask === 'missing' ? (
        <WordChoices {...choices} />
      ) : (
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
                      <OptionChip state={state} selected={selected} n={formatNumber(i + 1, locale)} />
                      <Text style={[styles.optionText, kurdish && styles.kurdishText, dir.free, { color: ink }]}>{option}</Text>
                    </>
                  )}
                </Tile>
              </AnswerMotion>
            );
          })}
        </View>
      )}
    </View>
  );
}

/** The bubble's play mark, drawn smaller than a fingertip but reaching one. */
const SPEAKER = 32;

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  prompt: { ...display(typography.sizes.lg) },
  // The play mark at the top of the bubble's start, however many lines follow.
  said: { alignItems: 'flex-start', gap: spacing.sm + 2 },
  grow: { flexShrink: 1 },
  pressed: { opacity: pressedDim },
  options: { gap: spacing.sm + 2 },
  // The lesson's cards, the words starting beside the chip.
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
  // Kurdish answers in the lesson's Kurdish face.
  kurdishText: { ...display(typography.sizes.md + 2) },
});
