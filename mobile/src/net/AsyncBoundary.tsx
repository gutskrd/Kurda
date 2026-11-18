import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import type { ApiError } from '../api/types';
import { spacing, typography } from '../theme/tokens';
import { ErrorRetry } from '../theme/glass';
import { SkeletonList } from '../theme/Skeleton';
import { useTheme } from '../theme/ThemeProvider';
import { useIsOnline } from './useNetworkStatus';
import { deriveAsyncState } from './asyncState';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState } from '../theme/EmptyState';

/**
 * Renders a data screen's loading, offline, error-with-retry, empty or ready state, so no screen shows an endless
 * spinner or a blank page. Connectivity is read live; a network error and being offline both show the offline
 * state with a retry.
 */
export function AsyncBoundary({
  loading,
  error,
  isEmpty,
  onRetry,
  emptyText,
  empty,
  skeleton,
  children,
}: {
  loading: boolean;
  error?: ApiError | null;
  isEmpty?: boolean;
  onRetry?: () => void;
  /** Defaults to "nothing here yet" in the reader's language. */
  emptyText?: string;
  /** A whole empty state, for a screen that has a glyph and an action in mind. */
  empty?: ReactNode;
  /** Loading placeholder; defaults to a list skeleton. */
  skeleton?: ReactNode;
  /** Content once ready. Pass a function when it reads loaded data, since it is only called in the ready state. */
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
      /* Hevalo looks puzzled rather than glad: a failed load looks different from an empty screen. */
      return (
        <EmptyState
          art="offline"
          title={t('net.offline.title')}
          body={t('net.offline.body')}
          {...(onRetry ? { action: { label: t('common.retry'), onPress: onRetry } } : {})}
        />
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
      /* The shared empty state, unless the screen passes its own `empty`. */
      return <>{empty ?? <EmptyState title={emptyText ?? t('civak.empty')} />}</>;

    case 'ready':
      return <>{typeof children === 'function' ? children() : children}</>;
  }
}

const styles = StyleSheet.create({
  skeleton: { padding: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  body: { fontSize: typography.sizes.md, textAlign: 'center' },
});
