import { StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A tag/badge chip (KUR-287). The `main` tone highlights the effective main tag
 * (Founder / Admin / Kurdish); default chips are the claimable/auto tags. Reused
 * on profiles and comments to show a user's tags.
 */
export function TagBadge({ label, tone = 'default' }: { label: string; tone?: 'main' | 'default' }): React.JSX.Element {
  const { colors } = useTheme();
  const main = tone === 'main';
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: main ? colors.primaryStrong : colors.glassFill,
          borderColor: main ? colors.primary : colors.glassBorder,
        },
      ]}
    >
      <Text style={[styles.text, { color: main ? colors.textOnPrimary : colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  text: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
});
