import { StyleSheet, Text, TextInput, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import type { Exercise } from '../types';
import { useI18n } from '../../i18n/I18nContext';

interface Props {
  exercise: Exercise;
  text: string;
  onChangeText: (text: string) => void;
  disabled: boolean;
}

export function TranslateExercise({ exercise, text, onChangeText, disabled }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('lesson.translate.prompt')}</Text>
      {exercise.prompt ? <Text style={[styles.prompt, { color: colors.textPrimary }]}>{exercise.prompt}</Text> : null}
      <TextInput
        value={text}
        onChangeText={onChangeText}
        editable={!disabled}
        placeholder="Type in Kurdish…"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { borderColor: colors.glassBorder, color: colors.textPrimary, backgroundColor: colors.controlTrack }, disabled && styles.dim]}
        accessibilityLabel={t('lesson.translate.answerLabel')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  input: {
    borderWidth: 2,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.lg,
  },
  dim: { opacity: 0.6 },
});
