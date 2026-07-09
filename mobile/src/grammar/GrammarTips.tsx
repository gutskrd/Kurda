import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { MarkdownView } from './MarkdownView';

/**
 * Grammar "Tips" sheet (KUR-038). Rendered inside a Modal so opening it
 * mid-lesson never unmounts the player — session state is untouched.
 */
export function GrammarTips({ source, onClose }: { source: string; onClose: () => void }) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>💡 Tips</Text>
        <Pressable onPress={onClose} accessibilityLabel="Close tips" hitSlop={12}>
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <MarkdownView source={source} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, color: colors.textPrimary },
  close: { fontSize: typography.sizes.lg, color: colors.textSecondary },
  body: { padding: spacing.lg },
});
