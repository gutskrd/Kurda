import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { Exercise } from '../types';

interface Props {
  exercise: Exercise;
  text: string;
  onChangeText: (text: string) => void;
  disabled: boolean;
}

export function TranslateExercise({ exercise, text, onChangeText, disabled }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Translate</Text>
      {exercise.prompt ? <Text style={styles.prompt}>{exercise.prompt}</Text> : null}
      <TextInput
        value={text}
        onChangeText={onChangeText}
        editable={!disabled}
        placeholder="Type in Kurdish…"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, disabled && styles.dim]}
        accessibilityLabel="Your translation"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, color: colors.textSecondary, textTransform: 'uppercase' },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.lg,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
  dim: { opacity: 0.6 },
});
