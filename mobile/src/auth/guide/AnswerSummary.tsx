import { StyleSheet, Text, View } from 'react-native';
import { useDirection } from '../../reports/direction';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';

/**
 * The answers given so far, on the last step of a guided sign-up, so they
 * can be read over once before the account is made: each a small label and
 * the answer under it, in one quiet panel. Going back to change one is the
 * chevron at the top, as on every step.
 */
export function AnswerSummary({ rows, testID = 'answer-summary' }: { rows: ReadonlyArray<{ label: string; value: string }>; testID?: string }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <View style={[styles.panel, { backgroundColor: colors.controlTrack }]} testID={testID}>
      {rows.map((row) => (
        <View key={row.label}>
          <Text style={[styles.label, dir.text, { color: colors.textSecondary }]}>{row.label}</Text>
          <Text style={[styles.value, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md },
  label: { fontSize: typography.sizes.xs, marginBottom: 2 },
  value: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
});
