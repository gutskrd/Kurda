import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { useScreenTopInset } from '../navigation/tabBarLayout';
import { relativeTime, resolveDeepLink, type InboxItem } from './inbox.js';

/** In-app notification center: list, mark-read, deep links (KUR-097). */
export function NotificationCenterScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const topInset = useScreenTopInset();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(() => {
    void client.get<{ notifications: InboxItem[] }>('/me/notifications').then((res) => {
      if (res.ok) {
        setItems(res.data.notifications);
        setError(null);
      } else {
        setError(res.error);
      }
    });
  }, [client]);

  useFocusEffect(useCallback(() => load(), [load]));

  const markAll = useCallback(() => {
    setItems((list) => (list ? list.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) : list));
    void client.post('/me/notifications/read-all');
  }, [client]);

  const open = useCallback(
    (item: InboxItem) => {
      if (!item.readAt) {
        setItems((list) => (list ? list.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)) : list));
        void client.post(`/me/notifications/${item.id}/read`);
      }
      const link = resolveDeepLink(item.data);
      // link targets may live on routes added by other feature branches; the
      // merged app has them all. A null link stays in the inbox (friendly
      // fallback for an expired/removed target).
      if (link) {
        const navigate = navigation.navigate as (screen: string, params?: object) => void;
        navigate(link.screen, 'params' in link ? link.params : undefined);
      }
    },
    [client, navigation],
  );

  const hasUnread = (items ?? []).some((i) => !i.readAt);

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: topInset }]}>
          <Pressable onPress={onExit} hitSlop={10}>
            <Text style={[styles.close, { color: colors.primary }]}>‹ Back</Text>
          </Pressable>
          <Text style={[styles.heading, { color: colors.textPrimary }]}>Notifications</Text>
          {hasUnread ? (
            <Pressable onPress={markAll} hitSlop={8}>
              <Text style={[styles.markAll, { color: colors.primary }]}>Mark all read</Text>
            </Pressable>
          ) : (
            <View style={{ width: 1 }} />
          )}
        </View>

        <AsyncBoundary
          loading={items === null}
          error={items === null ? error : null}
          isEmpty={items?.length === 0}
          onRetry={load}
          emptyText="You're all caught up."
        >
          <FlatList
            data={items ?? []}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => open(item)}
                style={[
                  styles.card,
                  { backgroundColor: colors.controlTrack, borderColor: colors.glassBorder },
                  !item.readAt && { borderLeftWidth: 3, borderLeftColor: colors.primary },
                ]}
              >
                {!item.readAt ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : <View style={styles.dotSpacer} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.textPrimary }]}>{item.title}</Text>
                  <Text style={[styles.body, { color: colors.textSecondary }]}>{item.body}</Text>
                </View>
                <Text style={[styles.time, { color: colors.textSecondary }]}>{relativeTime(item.createdAt)}</Text>
              </Pressable>
            )}
          />
        </AsyncBoundary>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingTop: spacing.md, marginBottom: spacing.md },
  close: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  heading: { fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  markAll: { fontSize: typography.sizes.sm, fontWeight: typography.weights.bold },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dim: {},
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
  dotSpacer: { width: 8 },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
  body: { fontSize: typography.sizes.sm },
  time: { fontSize: typography.sizes.xs },
});
