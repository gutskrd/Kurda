import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { GOAL_OPTIONS, type GoalOption } from './format';

interface Props {
  value: GoalOption;
  onChange: (goal: GoalOption) => void;
  disabled?: boolean;
}

/** Segmented daily-goal selector (10/20/30/50 XP). */
export function GoalPicker({ value, onChange, disabled }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      {GOAL_OPTIONS.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            disabled={disabled}
            onPress={() => onChange(option)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              { borderColor: selected ? colors.primary : colors.glassBorder, backgroundColor: selected ? colors.primary : colors.controlTrack },
              disabled && styles.dim,
            ]}
          >
            <Text style={[styles.label, { color: selected ? colors.textOnPrimary : colors.textPrimary }]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
  },
  label: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  dim: { opacity: 0.5 },
});
