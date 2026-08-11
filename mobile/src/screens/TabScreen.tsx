import { StyleSheet, Text, View } from 'react-native';
import type { TabDef } from '../navigation/tabs';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, typography } from '../theme/tokens';

/**
 * Placeholder screen for every tab until each system's UI issue lands
 * (Learn #29/#40, Play #54, Dictionary #45, Social #82). On the glass theme.
 */
export function TabScreen({ tab }: { tab: TabDef }) {
  const { colors } = useTheme();
  return (
    <GradientBackground>
      <View style={styles.container}>
        <Text style={styles.emoji}>{tab.emoji}</Text>
        <Text style={[styles.title, { color: colors.primary }]}>{tab.title}</Text>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emoji: {
    fontSize: typography.sizes.xxl,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    fontFamily: typography.fontFamily,
  },
});
