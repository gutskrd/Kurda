import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import {
  isLeftMatched,
  isRightMatched,
  tapLeft,
  tapRight,
  type MatchState,
} from '../match';
import type { Exercise } from '../types';

interface Props {
  exercise: Exercise;
  state: MatchState;
  onChange: (state: MatchState) => void;
  disabled: boolean;
}

export function MatchPairsExercise({ exercise, state, onChange, disabled }: Props) {
  const token = (
    label: string,
    matched: boolean,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={label}
      disabled={disabled}
      onPress={onPress}
      accessibilityState={{ selected: selected || matched }}
      style={[
        styles.token,
        matched && styles.tokenMatched,
        selected && styles.tokenSelected,
        disabled && styles.dim,
      ]}
    >
      <Text style={[styles.tokenText, (matched || selected) && styles.tokenTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Match the pairs</Text>
      <View style={styles.columns}>
        <View style={styles.column}>
          {(exercise.lefts ?? []).map((left) =>
            token(left, isLeftMatched(state, left), state.selectedLeft === left, () =>
              onChange(tapLeft(state, left)),
            ),
          )}
        </View>
        <View style={styles.column}>
          {(exercise.rights ?? []).map((right) =>
            token(right, isRightMatched(state, right), false, () => onChange(tapRight(state, right))),
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  label: { fontSize: typography.sizes.sm, color: colors.textSecondary, textTransform: 'uppercase' },
  columns: { flexDirection: 'row', gap: spacing.md },
  column: { flex: 1, gap: spacing.sm },
  token: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  tokenSelected: { borderColor: colors.primary },
  tokenMatched: { borderColor: colors.success, backgroundColor: colors.success },
  tokenText: { fontSize: typography.sizes.md, color: colors.textPrimary },
  tokenTextActive: { color: colors.textOnPrimary, fontWeight: typography.weights.bold },
  dim: { opacity: 0.6 },
});
