import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { ClayButton } from '../theme/glass';
import { spacing, typography } from '../theme/tokens';
import unpluggedDark from '../../assets/empty/offline-dark.png';
import unpluggedLight from '../../assets/empty/offline-light.png';
import { display } from '../theme/fonts';
import { useI18n } from '../i18n/I18nContext';
import { reportRenderError } from './crashReporting';

/**
 * Catches render errors so a throw shows a recovery screen instead of a blank app; a phone has no reload button.
 * Mounted once around the screens, inside the providers (the fallback needs the palette and translator) and under
 * the NavigationContainer, so recovering re-enters the navigator at its initial route rather than the screen that
 * threw.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  /* Report the crash with the component stack, which React leaves out of the error and which names what was rendering. */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportRenderError(error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return <CrashScreen error={error} onRetry={this.retry} />;
  }
}

/** A function component so the fallback can use the theme and translator hooks; the boundary itself must be a class. */
function CrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
    >
      {/* The fawn with the loose cable, as on a failed load (theme/EmptyState): decoration, since the text says it all. */}
      <Image
        source={scheme === 'dark' ? unpluggedDark : unpluggedLight}
        style={styles.art}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
        testID="crash-art"
      />
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('error.crash.title')}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{t('error.crash.body')}</Text>

      {/* The error message names internals, so it is shown only in development (`__DEV__` is false in store builds). */}
      {__DEV__ ? <Text style={[styles.detail, { color: colors.textSecondary }]}>{String(error.message)}</Text> : null}

      {/* The app's primary button; the boundary sits inside the providers, so the palette is available. */}
      <ClayButton label={t('common.retry')} tone="primary" size="large" onPress={onRetry} style={styles.buttonWrap} testID="crash-retry" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  // The size the empty and offline states draw it at: 480 of source is exactly @3x.
  art: { width: 160, height: 135 },
  title: { ...display(typography.sizes.xxl), textAlign: 'center' },
  body: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  detail: { fontSize: typography.sizes.xs, textAlign: 'center', fontStyle: 'italic' },
  buttonWrap: { alignSelf: 'stretch', marginTop: spacing.md },
});
