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
 * A render that throws unmounts the entire React tree — that is React's design,
 * because it cannot know which state is still consistent. In a browser the user
 * presses reload; on a phone there is no reload, so without a boundary the app
 * becomes a white screen that only a force-quit escapes.
 *
 * Mounted once, around the screens, inside the providers: the fallback needs the
 * palette and the translator, and it needs to be under the NavigationContainer
 * so that recovering re-enters the navigator at its initial route rather than
 * straight back into the screen that just threw.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  /*
   * The crash screen tells the person; this tells the owner. The component
   * stack is the part worth having: React does not put it in the error, and
   * it says which screen and which part of it was rendering.
   */
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

/**
 * Deliberately a separate function component: the boundary itself has to be a
 * class (no hook catches a render error), but the screen it shows wants the
 * theme and the translator, and those are hooks.
 */
function CrashScreen({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
    >
      {/*
        The fawn with the cable come loose, as a screen that could not load
        wears it (theme/EmptyState): the same news, and never the reader's
        doing. A red alarm said otherwise, in the colour kept for a wrong
        answer. Decoration: the words below say it all.
      */}
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

      {/*
        The message is for whoever is holding the debugger, not for whoever is
        holding the phone: it names internals, and a released build shows it to
        strangers. `__DEV__` is false in every store build, so this line simply
        is not there in the one that ships.
      */}
      {__DEV__ ? <Text style={[styles.detail, { color: colors.textSecondary }]}>{String(error.message)}</Text> : null}

      {/* the app's own primary button: the boundary sits inside the providers, so the palette it needs is there */}
      <ClayButton label={t('common.retry')} tone="primary" size="large" onPress={onRetry} style={styles.buttonWrap} testID="crash-retry" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  // the size the empty and offline states draw it at: 480 of source is exactly @3x
  art: { width: 160, height: 135 },
  title: { ...display(typography.sizes.xxl), textAlign: 'center' },
  body: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  detail: { fontSize: typography.sizes.xs, textAlign: 'center', fontStyle: 'italic' },
  buttonWrap: { alignSelf: 'stretch', marginTop: spacing.md },
});
