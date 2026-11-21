import { StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '../../theme/tokens';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useTheme } from '../../theme/ThemeProvider';
import type { Exercise } from '../types';
import { useI18n } from '../../i18n/I18nContext';
import { useDirection } from '../../reports/direction';
import { askHeadline } from '../asks';
import { useAudio } from '../useAudio';
import { AskScene, type GapState } from './AskParts';
import { ExerciseHeadline } from './ExerciseHeadline';
import { KurdishAnswerInput } from './KurdishAnswerInput';

interface Props {
  exercise: Exercise;
  text: string;
  onChangeText: (text: string) => void;
  disabled: boolean;
  /** The course's variety of Kurdish, for the key bar. */
  dialect?: string | null;
  /** How the answer was graded, once it has been. */
  verdict?: 'right' | 'wrong' | null;
}

/**
 * Free-text writing with the Kurdish key bar, in the course's variety. An item with `ask` puts its line alone in a
 * bubble beside its character (`AskScene`): English to write in Kurdish ('to-kurdish'), or Kurdish with a gap
 * ('missing'), where the typed word fills the gap and the field is one line.
 */
export function WritingExercise({ exercise, text, onChangeText, disabled, dialect, verdict = null }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const model = useAudio(exercise.ask ? exercise.modelAudioUrl : undefined);
  const headline = askHeadline(exercise, { dialect });
  const missing = exercise.ask === 'missing';
  const typed = text.trim();
  const gap: GapState = verdict ?? (typed ? 'filled' : 'empty');

  return (
    <View style={styles.container}>
      <ExerciseHeadline>{headline ? t(headline.key, headline.params) : t('lesson.write.prompt')}</ExerciseHeadline>
      {exercise.ask && exercise.prompt ? (
        <AskScene
          exercise={exercise}
          model={model}
          reaction={verdict === 'right' ? 'cheer' : verdict === 'wrong' ? 'hmm' : null}
          gap={missing ? { word: typed || null, state: gap } : undefined}
        />
      ) : exercise.prompt ? (
        <Text style={[styles.prompt, dir.free, { color: colors.textPrimary }]}>{exercise.prompt}</Text>
      ) : null}

      <KurdishAnswerInput
        text={text}
        onChangeText={onChangeText}
        dialect={dialect}
        disabled={disabled}
        verdict={verdict}
        multiline={!missing}
        placeholder={t('lesson.write.placeholder')}
        placeholderTextColor={colors.textSecondary}
        style={[missing ? styles.word : styles.input, disabled && styles.dim]}
        accessibilityLabel={t('lesson.write.answerLabel')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  // The question, under the headline that says what to do with it.
  prompt: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  // The field's card, edge and face match the answer box (KurdishAnswerInput).
  input: { minHeight: 96, paddingVertical: spacing.md, paddingHorizontal: spacing.md, textAlignVertical: 'top' },
  // One word for a gap: one line, a fingertip tall.
  word: { minHeight: MIN_TOUCH_TARGET + 8, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md },
  dim: { opacity: 0.6 },
});
