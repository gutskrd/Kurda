import { StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/** A tag chip. The `main` tone marks the effective main tag (Founder, Admin, Kurdish); used on profiles and comments. */
export function TagBadge({ label, tone = 'default' }: { label: string; tone?: 'main' | 'default' }): React.JSX.Element {
  const { colors } = useTheme();
  const main = tone === 'main';
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: main ? colors.primary : colors.glassFill,
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
  text: { fontSize: typography.sizes.text, fontWeight: typography.weights.medium },
});
