import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { Icon } from '../../theme/Icon';
import { useTheme } from '../../theme/ThemeProvider';
import type { Exercise } from '../types';
import { useAudio } from '../useAudio';
import { useI18n } from '../../i18n/I18nContext';

interface Props {
  exercise: Exercise;
  text: string;
  onChangeText: (text: string) => void;
  /** defer the exercise (can't listen now / audio failed): not counted wrong */
  onSkip: () => void;
  disabled: boolean;
}

export function ListeningExercise({ exercise, text, onChangeText, onSkip, disabled }: Props) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const audio = useAudio(exercise.audioUrl);
  const skippedRef = useRef(false);

  // audio download/playback failure → auto-skip once (KUR-035 edge case)
  const cannotPlay = !audio.supported || audio.error;
  useEffect(() => {
    if (audio.error && !skippedRef.current) {
      skippedRef.current = true;
      onSkip();
    }
  }, [audio.error, onSkip]);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{t('lesson.listen.prompt')}</Text>

      <View style={styles.controls}>
        <Pressable
          disabled={disabled || cannotPlay}
          onPress={() => audio.play(1)}
          accessibilityLabel={t('lesson.listen.play')}
          style={[styles.playButton, { backgroundColor: colors.primary }, (disabled || cannotPlay) && styles.dim]}
        >
          <Icon name="speaker" size={20} color={colors.textOnPrimary} />
          <Text style={[styles.playText, { color: colors.textOnPrimary }]}>{t('lesson.listen.playShort')}</Text>
        </Pressable>
        <Pressable
          disabled={disabled || cannotPlay}
          onPress={() => audio.play(0.75)}
          accessibilityLabel={t('lesson.listen.playSlow')}
          style={[styles.slowButton, { borderColor: colors.primary }, (disabled || cannotPlay) && styles.dim]}
        >
          <Text style={[styles.slowText, { color: colors.primary }]}>0.75×</Text>
        </Pressable>
      </View>

      {exercise.prompt ? <Text style={[styles.prompt, { color: colors.textSecondary }]}>{exercise.prompt}</Text> : null}

      <TextInput
        value={text}
        onChangeText={onChangeText}
        editable={!disabled}
        placeholder={t('lesson.listen.placeholder')}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { borderColor: colors.glassBorder, color: colors.textPrimary, backgroundColor: colors.controlTrack }, disabled && styles.dim]}
        accessibilityLabel={t('lesson.listen.answerLabel')}
      />

      <Pressable disabled={disabled} onPress={onSkip} accessibilityRole="button" style={styles.skip}>
        <Text style={[styles.skipText, { color: colors.textSecondary }]}>{t('lesson.listen.skip')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
  controls: { flexDirection: 'row', gap: spacing.sm },
  playButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  playText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  slowButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 2,
    alignItems: 'center',
  },
  slowText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  prompt: { fontSize: typography.sizes.md },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.lg,
  },
  skip: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { fontSize: typography.sizes.sm, textDecorationLine: 'underline' },
  dim: { opacity: 0.4 },
});
