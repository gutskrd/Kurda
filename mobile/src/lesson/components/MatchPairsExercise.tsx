import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../../theme/tokens';
import { useTheme } from '../../theme/ThemeProvider';
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
  const { colors } = useTheme();
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
        {
          backgroundColor: matched ? colors.success : colors.controlTrack,
          borderColor: matched ? colors.success : selected ? colors.primary : colors.glassBorder,
        },
        disabled && styles.dim,
      ]}
    >
      <Text style={[styles.tokenText, { color: matched ? colors.textOnPrimary : colors.textPrimary }, (matched || selected) && styles.tokenTextActive]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>Match the pairs</Text>
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
  label: { fontSize: typography.sizes.sm, textTransform: 'uppercase' },
  columns: { flexDirection: 'row', gap: spacing.md },
  column: { flex: 1, gap: spacing.sm },
  token: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
    alignItems: 'center',
  },
  tokenText: { fontSize: typography.sizes.md },
  tokenTextActive: { fontWeight: typography.weights.bold },
  dim: { opacity: 0.6 },
});
