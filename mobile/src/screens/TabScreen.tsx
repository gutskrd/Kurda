import { StyleSheet, Text, View } from 'react-native';
import type { TabDef } from '../navigation/tabs';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * Placeholder screen for every tab until each system's UI issue lands
 * (Learn #29/#40, Play #54, Dictionary #45, Social #82).
 */
export function TabScreen({ tab }: { tab: TabDef }) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{tab.emoji}</Text>
      <Text style={styles.title}>{tab.title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emoji: {
    fontSize: typography.sizes.xxl,
  },
  title: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    fontFamily: typography.fontFamily,
  },
});
