import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { haptic } from '../feedback/haptics';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ClayButton, ErrorRetry, GradientBackground } from '../theme/glass';
import { describeError } from '../api/errors';
import type { ApiError } from '../api/types';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { EmptyState } from '../theme/EmptyState';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useUnread } from './unread';

interface RequestRow {
  userId: string;
  username: string;
  displayName?: string | null;
}

/**
 * The friend requests waiting on you, each with Accept and Decline.
 *
 * Opened from the row at the top of Messages. A request is answered here and
 * is gone from the list at once — the answer is not in doubt, and a row that
 * stays while the request flies reads as a button that did nothing. Tapping
 * the person opens their profile first, for anyone who wants to know who is
 * asking before they answer.
 */
export function FriendRequestsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const { refresh } = useUnread();
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  // a list that could not be loaded says so, rather than passing for an empty one
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      setError(null);
      void client.get<{ requests: RequestRow[] }>('/friends/requests').then((r) => {
        if (!live) return;
        if (r.ok) setRequests(r.data.requests);
        else setError(r.error);
      });
      return () => {
        live = false;
      };
      // a retry asks again
    }, [client, attempt]),
  );

  const respond = useCallback(
    (row: RequestRow, accept: boolean) => {
      if (accept) haptic('tap');
      const at = (requests ?? []).findIndex((r) => r.userId === row.userId);
      setRequests((list) => (list ?? []).filter((r) => r.userId !== row.userId));
      void client.post(`/friends/requests/${row.userId}/${accept ? 'accept' : 'decline'}`).then((res) => {
        if (res.ok) {
          refresh();
          return;
        }
        // the answer did not get through: the request comes back where it was, to be answered again
        haptic('error');
        setRequests((list) => {
          const next = [...(list ?? [])];
          next.splice(at < 0 ? next.length : Math.min(at, next.length), 0, row);
          return next;
        });
      });
    },
    [client, refresh, requests],
  );

  return (
    <GradientBackground>
      <ScreenHeader title={t('messages.requestsTitle')} onBack={onExit} hairline />
      <FlatList
        data={requests ?? []}
        keyExtractor={(r) => r.userId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          requests === null ? (
            error ? (
              <ErrorRetry message={describeError(error, t)} onRetry={() => setAttempt((n) => n + 1)} />
            ) : (
              <RequestsSkeleton />
            )
          ) : (
            <EmptyState title={t('messages.requestsEmpty')} body={t('messages.requestsEmpty.body')} />
          )
        }
        renderItem={({ item: r }) => (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {/*
              Two lines, not one: side by side with the two buttons, a name
              had about sixty points and "rojhat" arrived as "roj…". The name
              is the whole of the row — it is the only way to know who is
              asking — so it gets the width and the buttons get their own line.
            */}
            <Pressable
              onPress={() => navigation.navigate('UserProfile', { userId: r.userId })}
              accessibilityRole="button"
              accessibilityLabel={r.displayName ? `${r.username}, ${r.displayName}` : r.username}
              style={[styles.who, { flexDirection: dir.row }]}
            >
              <InitialsAvatar name={r.username} id={r.userId} size={44} />
              <View style={styles.names}>
                <Text style={[styles.name, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                  {r.username}
                </Text>
                {r.displayName ? (
                  <Text style={[styles.sub, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
                    {r.displayName}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            <View style={[styles.actions, { flexDirection: dir.row }]}>
              <ClayButton
                label={t('friends.accept')}
                accessibilityLabel={t('friends.acceptFrom', { username: r.username })}
                tone="primary"
                onPress={() => respond(r, true)}
                style={styles.action}
              />
              <ClayButton
                label={t('friends.decline')}
                accessibilityLabel={t('friends.declineFrom', { username: r.username })}
                onPress={() => respond(r, false)}
                style={styles.action}
              />
            </View>
          </View>
        )}
      />
    </GradientBackground>
  );
}

/** The requests while they load: each card's face, name and two buttons, in grey. */
function RequestsSkeleton(): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const start = { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' } as const;
  return (
    <View style={styles.skeleton} accessibilityLabel={t('common.loading')}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={[styles.who, { flexDirection: dir.row }]}>
            <Skeleton width={44} height={44} radius={radii.pill} />
            <View style={styles.names}>
              <SkeletonText size={typography.sizes.md} width={i % 2 ? '34%' : '46%'} style={start} />
              <SkeletonText size={typography.sizes.sm} width="28%" style={start} />
            </View>
          </View>
          <View style={[styles.actions, { flexDirection: dir.row }]}>
            <Skeleton height={MIN_TOUCH_TARGET} radius={radii.pill} style={styles.action} />
            <Skeleton height={MIN_TOUCH_TARGET} radius={radii.pill} style={styles.action} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { gap: layout.rowGap },
  list: { padding: layout.gutter, gap: layout.rowGap },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md - 4 },
  who: { alignItems: 'center', gap: spacing.md - 4 },
  names: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  sub: { fontSize: typography.sizes.sm },
  actions: { gap: spacing.sm },
  action: { flex: 1 },
});
