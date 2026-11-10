import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A small button at the end of a row in a group's lists — Add beside a friend,
 * Approve beside a request: filled in ink for the one thing to do, outlined
 * for the quieter one. The pill stays slim and its hit slop makes up the
 * rest of a fingertip.
 */
export function Pill({
  label,
  onPress,
  filled = false,
  busy = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  filled?: boolean;
  busy?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [
        styles.pill,
        filled ? { backgroundColor: colors.textPrimary } : { borderColor: colors.textSecondary, borderWidth: StyleSheet.hairlineWidth * 2 },
        (pressed || (disabled && !busy)) && styles.pillDim,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={filled ? colors.background : colors.textPrimary} style={styles.pillBusy} /> : null}
      <Text style={[styles.pillText, { color: filled ? colors.background : colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill },
  pillDim: { opacity: 0.6 },
  pillBusy: { marginEnd: 2 },
  pillText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
