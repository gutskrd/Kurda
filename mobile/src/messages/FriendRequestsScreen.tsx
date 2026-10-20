import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { ClayButton, GradientBackground } from '../theme/glass';
import { SkeletonList } from '../theme/Skeleton';
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

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void client.get<{ requests: RequestRow[] }>('/friends/requests').then((r) => {
        if (live) setRequests(r.ok ? r.data.requests : []);
      });
      return () => {
        live = false;
      };
    }, [client]),
  );

  const respond = useCallback(
    (userId: string, accept: boolean) => {
      setRequests((list) => (list ?? []).filter((r) => r.userId !== userId));
      void client.post(`/friends/requests/${userId}/${accept ? 'accept' : 'decline'}`).then(() => refresh());
    },
    [client, refresh],
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
            <SkeletonList count={3} />
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
                onPress={() => respond(r.userId, true)}
                style={styles.action}
              />
              <ClayButton
                label={t('friends.decline')}
                accessibilityLabel={t('friends.declineFrom', { username: r.username })}
                onPress={() => respond(r.userId, false)}
                style={styles.action}
              />
            </View>
          </View>
        )}
      />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  list: { padding: layout.gutter, gap: layout.rowGap },
  card: { borderRadius: radii.lg, padding: spacing.md, gap: spacing.md - 4 },
  who: { alignItems: 'center', gap: spacing.md - 4 },
  names: { flex: 1, gap: 2 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  sub: { fontSize: typography.sizes.sm },
  actions: { gap: spacing.sm },
  action: { flex: 1 },
});
