import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../../a11y/a11y';
import { useDirection } from '../../reports/direction';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, typography } from '../../theme/tokens';

/** One way out of a screen that holds an account until it is answered. */
export interface WayOut {
  label: string;
  onPress: () => void;
  /** it cannot be taken back (deleting the account) */
  danger?: boolean;
  testID?: string;
}

/**
 * The ways out of a question that has to be answered before the app opens
 * (the emailed code, the birth month): signing out, deleting the account.
 *
 * Side by side and quiet, under everything else, because they are not what
 * the screen is for; one under the other, close, where a longer language
 * wraps them. Each is still a full touch target.
 */
export function WaysOut({ ways }: { ways: readonly WayOut[] }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.ways, { flexDirection: dir.row }]}>
      {ways.map((way) => (
        <Pressable key={way.label} onPress={way.onPress} accessibilityRole="button" hitSlop={8} style={styles.way} testID={way.testID}>
          <Text style={[styles.text, { color: way.danger ? colors.danger : colors.textSecondary }]}>{way.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  ways: { flexWrap: 'wrap', columnGap: spacing.lg, rowGap: 0, marginTop: spacing.sm },
  way: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' },
  text: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
});
