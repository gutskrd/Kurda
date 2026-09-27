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
      /*
       * The fawn with the unplugged cable, which is the one picture in this
       * app that is not about something being empty. A screen that could not
       * load and a screen with nothing in it are different things and used
       * to look the same: two centred grey sentences.
       */
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
      /*
       * The shared empty state, so a screen that says nothing about what is
       * missing at least looks like a beginning rather than a failure. A
       * screen with something better to say passes `empty` itself.
       */
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
