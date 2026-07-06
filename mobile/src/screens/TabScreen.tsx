import { StyleSheet, Text, View } from 'react-native';
import type { TabDef } from '../navigation/tabs';
import { colors, kurdishSample, spacing, typography } from '../theme/tokens';

/**
 * Placeholder screen for every tab until each system's UI issue lands
 * (Learn #29/#40, Play #54, Dictionary #45, Social #82, Profile #21).
 * Shows the Kurdish sample string so diacritic rendering is verified on
 * sight every time the app opens.
 */
export function TabScreen({ tab }: { tab: TabDef }) {
  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>{tab.emoji}</Text>
      <Text style={styles.titleKu}>{tab.titleKu}</Text>
      <Text style={styles.title}>{tab.title}</Text>
      <Text style={styles.sample}>{kurdishSample}</Text>
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
  titleKu: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.primary,
    fontFamily: typography.fontFamily,
  },
  title: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },
  sample: {
    marginTop: spacing.xl,
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    textAlign: 'center',
    fontFamily: typography.fontFamily,
  },
});
