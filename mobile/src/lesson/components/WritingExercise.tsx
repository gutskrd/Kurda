import { StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
import type { Exercise } from '../types';
import { useI18n } from '../../i18n/I18nContext';
import { KurdishAnswerInput } from './KurdishAnswerInput';

interface Props {
  exercise: Exercise;
  text: string;
  onChangeText: (text: string) => void;
  disabled: boolean;
  /** the course's variety of Kurdish, for the key bar */
  dialect?: string | null;
}

/** Free-text writing with the Kurdish key bar (KUR-037), in the course's variety. */
export function WritingExercise({ exercise, text, onChangeText, disabled, dialect }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('lesson.write.prompt')}</Text>
      {exercise.prompt ? <Text style={[styles.prompt, { color: colors.textPrimary }]}>{exercise.prompt}</Text> : null}

      <KurdishAnswerInput
        text={text}
        onChangeText={onChangeText}
        dialect={dialect}
        disabled={disabled}
        multiline
        placeholder={t('lesson.write.placeholder')}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.textPrimary, backgroundColor: colors.controlTrack }, disabled && styles.dim]}
        accessibilityLabel={t('lesson.write.answerLabel')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  input: {
    minHeight: 96,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.lg,
    textAlignVertical: 'top',
  },
  dim: { opacity: 0.6 },
});
