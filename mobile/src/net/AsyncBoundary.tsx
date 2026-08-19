import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ApiError } from '../api/types';
import { spacing, radii, typography } from '../theme/tokens';
import { ErrorRetry } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useIsOnline } from './useNetworkStatus';
import { deriveAsyncState } from './asyncState';

/**
 * One place that renders a data screen's loading / offline / error+retry / empty /
 * ready state (KUR-278), so no screen shows an infinite spinner or a blank page.
 * Wrap the content; pass the request's `loading`/`error` and whether the result is
 * empty. Connectivity is read live; a network error or being offline both surface a
 * clear, retryable offline state.
 */
export function AsyncBoundary({
  loading,
  error,
  isEmpty,
  onRetry,
  emptyText = 'Nothing here yet.',
  children,
}: {
  loading: boolean;
  error?: ApiError | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyText?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const online = useIsOnline();
  const { colors } = useTheme();
  const state = deriveAsyncState({ loading, online, error: error ?? null, isEmpty });

  switch (state.kind) {
    case 'loading':
      return <ActivityIndicator color={colors.primary} style={styles.center} accessibilityLabel="Loading" />;

    case 'offline':
      return (
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>You’re offline</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>Check your connection — your content will load when you’re back.</Text>
          {onRetry ? (
            <Pressable onPress={onRetry} style={[styles.retry, { borderColor: colors.glassBorder }]} accessibilityRole="button" accessibilityLabel="Try again">
              <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      );

    case 'error':
      return state.retryable && onRetry ? (
        <ErrorRetry message={state.message} onRetry={onRetry} />
      ) : (
        <View style={styles.center}>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{state.message}</Text>
        </View>
      );

    case 'empty':
      return (
        <View style={styles.center}>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{emptyText}</Text>
        </View>
      );

    case 'ready':
      return <>{children}</>;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  body: { fontSize: typography.sizes.md, textAlign: 'center' },
  retry: { marginTop: spacing.sm, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
