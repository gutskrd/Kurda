import { useState } from 'react';
import {
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { KURDISH_KEYS, insertAtSelection } from '../kurdishKeys';
import type { Exercise } from '../types';

interface Props {
  exercise: Exercise;
  text: string;
  onChangeText: (text: string) => void;
  disabled: boolean;
}

/** Free-text writing with a Kurdish special-character hint bar (KUR-037). */
export function WritingExercise({ exercise, text, onChangeText, disabled }: Props) {
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  const onSelectionChange = (e: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
    setSelection(e.nativeEvent.selection);

  const insertKey = (key: string) => {
    const { text: next, caret } = insertAtSelection(text, selection, key);
    onChangeText(next);
    setSelection({ start: caret, end: caret });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Write your answer</Text>
      {exercise.prompt ? <Text style={styles.prompt}>{exercise.prompt}</Text> : null}

      {/* Kurdish keyboard hint bar */}
      <View style={styles.keys}>
        {KURDISH_KEYS.map((key) => (
          <Pressable
            key={key}
            disabled={disabled}
            onPress={() => insertKey(key)}
            accessibilityLabel={`Insert ${key}`}
            style={[styles.key, disabled && styles.dim]}
          >
            <Text style={styles.keyText}>{key}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        value={text}
        onChangeText={onChangeText}
        onSelectionChange={onSelectionChange}
        selection={selection}
        editable={!disabled}
        multiline
        placeholder="Write in Kurdish…"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, disabled && styles.dim]}
        accessibilityLabel="Your written answer"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, color: colors.textSecondary, textTransform: 'uppercase' },
  prompt: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  keys: { flexDirection: 'row', gap: spacing.sm },
  key: {
    minWidth: 40,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  keyText: { fontSize: typography.sizes.lg, color: colors.textPrimary },
  input: {
    minHeight: 96,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: typography.sizes.lg,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  dim: { opacity: 0.6 },
});
