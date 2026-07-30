import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { Exercise } from '../types';

interface Props {
  exercise: Exercise;
  choice: number | null;
  onSelect: (index: number) => void;
  disabled: boolean;
}

export function MultipleChoiceExercise({ exercise, choice, onSelect, disabled }: Props) {
  return (
    <View style={styles.container}>
      {exercise.prompt ? <Text style={styles.prompt}>{exercise.prompt}</Text> : null}
      <View style={styles.options}>
        {(exercise.options ?? []).map((option, i) => {
          const selected = choice === i;
          return (
            <Pressable
              key={i}
              disabled={disabled}
              onPress={() => onSelect(i)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.option, selected && styles.optionSelected, disabled && styles.dim]}
            >
              <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  options: { gap: spacing.sm },
  option: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  optionText: { fontSize: typography.sizes.md, color: colors.textPrimary },
  optionTextSelected: { color: colors.textOnPrimary, fontWeight: typography.weights.bold },
  dim: { opacity: 0.6 },
});
