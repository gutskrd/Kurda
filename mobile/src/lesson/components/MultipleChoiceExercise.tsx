import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import type { Exercise } from '../types';

interface Props {
  exercise: Exercise;
  choice: number | null;
  onSelect: (index: number) => void;
  disabled: boolean;
}

export function MultipleChoiceExercise({ exercise, choice, onSelect, disabled }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.container}>
      {exercise.prompt ? <Text style={[styles.prompt, { color: colors.textPrimary }]}>{exercise.prompt}</Text> : null}
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
              style={[
                styles.option,
                { borderColor: selected ? colors.primary : colors.glassBorder, backgroundColor: selected ? colors.primary : colors.controlTrack },
                disabled && styles.dim,
              ]}
            >
              <Text style={[styles.optionText, { color: selected ? colors.textOnPrimary : colors.textPrimary }, selected && styles.optionTextSelected]}>{option}</Text>
            </Pressable>
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 2,
  },
  optionText: { fontSize: typography.sizes.md },
  optionTextSelected: { fontWeight: typography.weights.bold },
  dim: { opacity: 0.6 },
});
