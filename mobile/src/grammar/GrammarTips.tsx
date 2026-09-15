import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { MarkdownView } from './MarkdownView';
import { useI18n } from '../i18n/I18nContext';

/**
 * Grammar "Tips" sheet (KUR-038). Rendered inside a Modal so opening it
 * mid-lesson never unmounts the player — session state is untouched.
 */
export function GrammarTips({ source, onClose }: { source: string; onClose: () => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const topInset = useScreenTopInset();
  return (
    <GradientBackground>
      <View style={styles.screen}>
        <View style={[styles.header, { borderBottomColor: colors.glassBorder, paddingTop: topInset }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Tips</Text>
          <Pressable onPress={onClose} accessibilityLabel={t('grammar.closeTips')} hitSlop={12}>
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
