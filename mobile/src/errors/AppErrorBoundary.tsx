import { Component, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../theme/Icon';
import { radii, spacing, typography } from '../theme/tokens';
import { display } from '../theme/fonts';
import { useI18n } from '../i18n/I18nContext';

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
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.screen, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <Icon name="alert" size={72} color={colors.danger} />
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('error.crash.title')}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>{t('error.crash.body')}</Text>

      {/*
        The message is for whoever is holding the debugger, not for whoever is
        holding the phone: it names internals, and a released build shows it to
        strangers. `__DEV__` is false in every store build, so this line simply
        is not there in the one that ships.
      */}
      {__DEV__ ? <Text style={[styles.detail, { color: colors.textSecondary }]}>{String(error.message)}</Text> : null}

      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        testID="crash-retry"
        style={({ pressed }) => [styles.buttonWrap, { opacity: pressed ? 0.92 : 1 }]}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryStrong]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.button, { borderColor: colors.clayBorder, shadowColor: colors.softShadow }]}
        >
          <Text style={[styles.buttonText, { color: colors.textOnPrimary }]}>{t('common.retry')}</Text>
        </LinearGradient>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  title: { ...display(typography.sizes.xxl), textAlign: 'center' },
  body: { fontSize: typography.sizes.md, textAlign: 'center', lineHeight: 22 },
  detail: { fontSize: typography.sizes.xs, textAlign: 'center', fontStyle: 'italic' },
  buttonWrap: { alignSelf: 'stretch', marginTop: spacing.md },
  button: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    alignItems: 'center',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  buttonText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
