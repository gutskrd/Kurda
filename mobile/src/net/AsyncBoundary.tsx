import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import type { ApiError } from '../api/types';
import { spacing, radii, typography } from '../theme/tokens';
import { ErrorRetry } from '../theme/glass';
import { SkeletonList } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { useIsOnline } from './useNetworkStatus';
import { deriveAsyncState } from './asyncState';
import { useI18n } from '../i18n/I18nContext';

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
  emptyText,
  skeleton,
  children,
}: {
  loading: boolean;
  error?: ApiError | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  /** Defaults to "nothing here yet" in the reader's language. */
  emptyText?: string;
  /** Loading placeholder. Defaults to a generic list skeleton; pass a screen-shaped
   *  skeleton for a closer match to the content that's coming. */
  skeleton?: ReactNode;
  /** Content to show once ready. Pass a function when it dereferences loaded data —
   *  it's only invoked in the ready state, so it never runs during loading/error. */
  children: React.ReactNode | (() => React.ReactNode);
}): React.JSX.Element {
  const online = useIsOnline();
  const { colors } = useTheme();
  const { t } = useI18n();
  const state = deriveAsyncState({ loading, online, error: error ?? null, isEmpty, t });

  switch (state.kind) {
    case 'loading':
      return <>{skeleton ?? <SkeletonList style={styles.skeleton} />}</>;

    case 'offline':
      return (
        <View style={styles.center}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{t('net.offline.title')}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{t('net.offline.body')}</Text>
          {onRetry ? (
            <Pressable onPress={onRetry} style={[styles.retry, { borderColor: colors.glassBorder }]} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
              <Text style={[styles.retryText, { color: colors.primary }]}>{t('common.retry')}</Text>
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
          <Text style={[styles.body, { color: colors.textSecondary }]}>{emptyText ?? t('civak.empty')}</Text>
        </View>
      );

    case 'ready':
      return <>{typeof children === 'function' ? children() : children}</>;
  }
}

const styles = StyleSheet.create({
  skeleton: { padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  title: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  body: { fontSize: typography.sizes.md, textAlign: 'center' },
  retry: { marginTop: spacing.sm, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryText: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});
