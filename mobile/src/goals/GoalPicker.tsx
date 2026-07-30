import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme/tokens';
import { GOAL_OPTIONS, type GoalOption } from './format';

interface Props {
  value: GoalOption;
  onChange: (goal: GoalOption) => void;
  disabled?: boolean;
}

/** Segmented daily-goal selector (10/20/30/50 XP). */
export function GoalPicker({ value, onChange, disabled }: Props) {
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
            style={[styles.segment, selected && styles.segmentSelected, disabled && styles.dim]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option}</Text>
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
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  segmentSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  label: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold, color: colors.textPrimary },
  labelSelected: { color: colors.textOnPrimary },
  dim: { opacity: 0.5 },
});
