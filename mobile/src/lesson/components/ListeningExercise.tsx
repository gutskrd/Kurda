import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import type { Exercise } from '../types';
import { useAudio } from '../useAudio';

interface Props {
  exercise: Exercise;
  text: string;
  onChangeText: (text: string) => void;
  /** defer the exercise (can't listen now / audio failed): not counted wrong */
  onSkip: () => void;
  disabled: boolean;
}

export function ListeningExercise({ exercise, text, onChangeText, onSkip, disabled }: Props) {
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
      <Text style={styles.label}>Listen and type what you hear</Text>

      <View style={styles.controls}>
        <Pressable
          disabled={disabled || cannotPlay}
          onPress={() => audio.play(1)}
          accessibilityLabel="Play audio"
          style={[styles.playButton, (disabled || cannotPlay) && styles.dim]}
        >
          <Text style={styles.playText}>▶︎ Play</Text>
        </Pressable>
        <Pressable
          disabled={disabled || cannotPlay}
          onPress={() => audio.play(0.75)}
          accessibilityLabel="Play at slow speed"
          style={[styles.slowButton, (disabled || cannotPlay) && styles.dim]}
        >
          <Text style={styles.slowText}>🐢 0.75×</Text>
        </Pressable>
      </View>

      {exercise.prompt ? <Text style={styles.prompt}>{exercise.prompt}</Text> : null}

      <TextInput
        value={text}
        onChangeText={onChangeText}
        editable={!disabled}
        placeholder="Type what you heard…"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, disabled && styles.dim]}
        accessibilityLabel="What you heard"
      />

      <Pressable disabled={disabled} onPress={onSkip} accessibilityRole="button" style={styles.skip}>
        <Text style={styles.skipText}>Can’t listen now — skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, color: colors.textSecondary, textTransform: 'uppercase' },
  controls: { flexDirection: 'row', gap: spacing.sm },
  playButton: {
    flex: 1,
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  playText: { color: colors.textOnPrimary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  slowButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  slowText: { color: colors.primary, fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  prompt: { fontSize: typography.sizes.md, color: colors.textSecondary },
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
  skip: { alignItems: 'center', paddingVertical: spacing.sm },
  skipText: { color: colors.textSecondary, fontSize: typography.sizes.sm, textDecorationLine: 'underline' },
  dim: { opacity: 0.4 },
});
