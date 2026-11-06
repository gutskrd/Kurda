import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { describeError } from '../api/errors';
import { limitErrorText } from '../limits/limitCopy';
import type { ApiError } from '../api/types';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { EmptyState } from '../theme/EmptyState';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { ACCEPTED_HOLD_MS, DECLINE_FOLD_MS, FriendRequestTicket, type RequestAnswer } from '../social/FriendTicket';
import { useAnnouncer } from '../stories/ui';
import { useUnread } from './unread';
import { usePullRefresh } from '../net/usePullRefresh';

interface RequestRow {
  userId: string;
  username: string;
  displayName?: string | null;
}

/**
 * The friend requests waiting on you, each with Accept and Decline.
 *
 * Opened from the row at the top of Messages. A request is answered here and
 * shows it at once — the answer is not in doubt, and a row that stays as it
 * was while the request flies reads as a button that did nothing. Each one
 * is a friendship ticket (social/FriendTicket): Accept tears its stub off and
 * stamps it "Friends" for a moment before it leaves the list, Decline folds
 * it away. Tapping the person opens their profile first, for anyone who
 * wants to know who is asking before they answer.
 */
export function FriendRequestsScreen({ onExit }: { onExit: () => void }): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { t } = useI18n();
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
  // pulled down, the requests are read again; a failure keeps the list that is there
  const pull = usePullRefresh(() =>
    client.get<{ requests: RequestRow[] }>('/friends/requests').then((r) => {
      if (r.ok) {
        setRequests(r.data.requests);
        setError(null);
      }
    }),
  );

  const reduce = useReducedMotion();
  const { announce, region } = useAnnouncer();
  /** answered on this phone: stamped "Friends" or folding away, until it leaves the list */
  const [answers, setAnswers] = useState<Record<string, RequestAnswer>>({});
  const leaving = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => leaving.current.forEach(clearTimeout), []);
  const unanswer = (userId: string): void =>
    setAnswers((a) => {
      const rest = { ...a };
      delete rest[userId];
      return rest;
    });

  const respond = useCallback(
    (row: RequestRow, accept: boolean) => {
      if (accept) haptic('tap');
      if (accept) announce(t('friends.nowFriends', { name: row.displayName ?? row.username }));
      const at = (requests ?? []).findIndex((r) => r.userId === row.userId);
      setAnswers((a) => ({ ...a, [row.userId]: accept ? 'accepted' : 'declined' }));
      // stamped for a moment, or folded away, and then out of the list
      let gone = false;
      const drop = (): void => {
        gone = true;
        leaving.current.delete(row.userId);
        setRequests((list) => (list ?? []).filter((r) => r.userId !== row.userId));
        unanswer(row.userId);
      };
      const hold = accept ? ACCEPTED_HOLD_MS : reduce ? 0 : DECLINE_FOLD_MS;
      if (hold === 0) drop();
      else leaving.current.set(row.userId, setTimeout(drop, hold));
      void client.post(`/friends/requests/${row.userId}/${accept ? 'accept' : 'decline'}`).then((res) => {
        if (res.ok) {
          refresh();
          return;
        }
        // the answer did not get through: the request comes back where it was, to be answered again
        haptic('error');
        // a friend list that is full (theirs or yours) will not empty on a retry, so it is said (limits/limitCopy.ts)
        const limit = limitErrorText(res.error, t);
        if (limit) Alert.alert(limit);
        clearTimeout(leaving.current.get(row.userId));
        leaving.current.delete(row.userId);
        unanswer(row.userId);
        if (!gone) return;
        setRequests((list) => {
          const next = [...(list ?? [])];
          next.splice(at < 0 ? next.length : Math.min(at, next.length), 0, row);
          return next;
        });
      });
    },
    [client, refresh, requests, t, reduce, announce],
  );

  return (
    <GradientBackground>
      <ScreenHeader title={t('messages.requestsTitle')} onBack={onExit} hairline />
      <FlatList
        data={requests ?? []}
        keyExtractor={(r) => r.userId}
        contentContainerStyle={styles.list}
        refreshControl={pull}
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
          <FriendRequestTicket
            person={r}
            answer={answers[r.userId] ?? null}
            onOpen={() => navigation.navigate('UserProfile', { userId: r.userId })}
            onAccept={() => respond(r, true)}
            onDecline={() => respond(r, false)}
            acceptLabel={t('friends.acceptFrom', { username: r.username })}
            declineLabel={t('friends.declineFrom', { username: r.username })}
          />
        )}
      />
      {region}
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
  actions: { gap: spacing.sm },
  action: { flex: 1 },
});
