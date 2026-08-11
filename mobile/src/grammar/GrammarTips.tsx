import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { MarkdownView } from './MarkdownView';

/**
 * Grammar "Tips" sheet (KUR-038). Rendered inside a Modal so opening it
 * mid-lesson never unmounts the player — session state is untouched.
 */
export function GrammarTips({ source, onClose }: { source: string; onClose: () => void }) {
  const { colors } = useTheme();
  return (
    <GradientBackground>
      <View style={styles.screen}>
        <View style={[styles.header, { borderBottomColor: colors.glassBorder }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Tips</Text>
          <Pressable onPress={onClose} accessibilityLabel="Close tips" hitSlop={12}>
            <Text style={[styles.close, { color: colors.textSecondary }]}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <MarkdownView source={source} />
        </ScrollView>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold },
  close: { fontSize: typography.sizes.lg },
  body: { padding: spacing.lg },
});
