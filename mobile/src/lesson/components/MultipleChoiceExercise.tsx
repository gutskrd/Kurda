import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import { Icon } from '../../theme/Icon';
import { AnswerMotion, DrawnCheck } from '../../theme/MotionParts';
import { useI18n } from '../../i18n/I18nContext';
import type { Feedback } from '../player';
import type { Exercise } from '../types';

interface Props {
  exercise: Exercise;
  choice: number | null;
  onSelect: (index: number) => void;
  disabled: boolean;
  /** the verdict, once the answer is graded; null while choosing */
  feedback?: Feedback | null;
}

/**
 * Choose one. Once it is graded the options answer back, and not by colour
 * alone: the one chosen pops and a check draws in when it was right, or
 * shakes with a cross when it was not — and then the right one is marked
 * with a check as well, so the answer is on the screen where it was asked.
 */
export function MultipleChoiceExercise({ exercise, choice, onSelect, disabled, feedback = null }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const options = exercise.options ?? [];
  // the right option is the one chosen when it was accepted, else the one the correction names
  const isRight = (i: number): boolean => (feedback ? (feedback.accepted ? i === choice : feedback.correction === options[i]) : false);
  return (
    <View style={styles.container}>
      {exercise.prompt ? <Text style={[styles.prompt, { color: colors.textPrimary }]}>{exercise.prompt}</Text> : null}
      <View style={styles.options}>
        {options.map((option, i) => {
          const selected = choice === i;
          const right = isRight(i);
          const wrong = !!feedback && selected && !right;
          const verdict = !feedback || !selected ? null : right ? 'right' : 'wrong';
          const fill = right ? colors.successFill : wrong ? colors.dangerFill : selected ? colors.primary : colors.controlTrack;
          const edge = right ? colors.success : wrong ? colors.danger : selected ? colors.primary : colors.glassBorder;
          const ink = right || wrong ? colors.textPrimary : selected ? colors.textOnPrimary : colors.textPrimary;
          return (
            <AnswerMotion key={i} verdict={verdict}>
              <Pressable
                disabled={disabled}
                onPress={() => onSelect(i)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={right ? `${option}, ${t('lesson.correct')}` : option}
                style={[styles.option, { borderColor: edge, backgroundColor: fill }, disabled && !right && !wrong && styles.dim]}
              >
                <Text style={[styles.optionText, { color: ink }, (selected || right) && styles.optionTextSelected]}>{option}</Text>
                {right ? (
                  selected ? (
                    <DrawnCheck size={20} color={colors.success} />
                  ) : (
                    <Icon name="check" size={20} color={colors.success} />
                  )
                ) : wrong ? (
                  <Icon name="close" size={20} color={colors.danger} />
                ) : null}
              </Pressable>
            </AnswerMotion>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  options: { gap: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 2,
  },
  optionText: { flex: 1, fontSize: typography.sizes.md },
  optionTextSelected: { fontWeight: typography.weights.bold },
  dim: { opacity: 0.6 },
});
