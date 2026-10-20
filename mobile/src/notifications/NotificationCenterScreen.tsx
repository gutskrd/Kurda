import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import type { RootNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { relativeTime, resolveDeepLink, type InboxItem } from './inbox.js';
import { followDeepLink, notificationText } from './followLink';
import { useI18n } from '../i18n/I18nContext';
import { EmptyState } from '../theme/EmptyState';
import { CaringMessageDialog, type CaringMessage } from '../reports/CaringMessage';
import { useDirection } from '../reports/direction';
import { useUnread } from '../messages/unread';

/**
 * The notification list (KUR-097): likes, comments, gifts, invites, badges and
 * notices from Hevalo, newest first. Opened from the bell on Home.
 *
 * An unread one is marked three ways — a dot, a bold title, and the words a
 * screen reader hears — and reading them here takes the dot off the bell.
 */
export function NotificationCenterScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  // the moderators' caring message, opened with its helpline (reports/CaringMessage.tsx)
  const [caring, setCaring] = useState<CaringMessage | null>(null);
  const dir = useDirection();
  const { report } = useUnread();

  // the bell's dot follows what is read here, without asking the server again
  useEffect(() => {
    if (items) report({ notifications: items.filter((i) => !i.readAt).length });
  }, [items, report]);

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
      // a caring message is read here, with its helpline; it has no screen
      if (link?.screen === 'CaringMessage') {
        setCaring({ title: item.title, body: item.body, helplineUrl: link.helplineUrl });
        return;
      }
      // a null link stays in the list (the friendly fallback for an expired or
      // removed target); the rest go where the inbox tab sends them — this
      // used to pass the link's own screen name straight to the navigator, and
      // "Profile" is the tab of that name: your own profile, not theirs
      if (link) void followDeepLink(link, navigation, client);
    },
    [client, navigation],
  );

  const hasUnread = (items ?? []).some((i) => !i.readAt);

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader
          title={t('notifications.title')}
          onBack={onExit}
          right={
            hasUnread ? (
              <Pressable onPress={markAll} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.markAll, { color: colors.primary }]} numberOfLines={1}>
                  {t('notifications.markAllRead')}
                </Text>
              </Pressable>
            ) : null
          }
        />

        <AsyncBoundary
          loading={items === null}
          error={items === null ? error : null}
          isEmpty={items?.length === 0}
          onRetry={load}
          empty={<EmptyState title={t('notifications.allCaughtUp')} />}
        >
          <FlatList
            data={items ?? []}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const text = notificationText(item, t, locale);
              const unread = !item.readAt;
              return (
                <Pressable
                  onPress={() => open(item)}
                  accessibilityRole="button"
                  accessibilityLabel={unread ? `${t('messages.filter.unread')}: ${text.title}` : text.title}
                  style={({ pressed }) => [styles.row, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
                >
                  {/* marked, not coloured: the row keeps its own contrast */}
                  <View style={[styles.dot, { backgroundColor: unread ? colors.goldText : 'transparent' }]} />
                  <View style={styles.main}>
                    <Text style={[styles.title, dir.free, unread && styles.titleUnread, { color: colors.textPrimary }]} numberOfLines={2}>
                      {text.title}
                    </Text>
                    <Text style={[styles.body, dir.free, { color: colors.textSecondary }]} numberOfLines={2}>
                      {text.body}
                    </Text>
                  </View>
                  <Text style={[styles.time, { color: colors.textSecondary }]}>{relativeTime(item.createdAt)}</Text>
                </Pressable>
              );
            }}
          />
        </AsyncBoundary>
      </View>
      <CaringMessageDialog message={caring} onClose={() => setCaring(null)} />
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  markAll: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  list: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  row: {
    alignItems: 'flex-start',
    gap: spacing.md - 4,
    borderRadius: radii.md,
    paddingHorizontal: layout.gutter - spacing.sm,
    paddingVertical: spacing.md - 4,
  },
  dot: { width: 8, height: 8, borderRadius: radii.pill, marginTop: 8 },
  main: { flex: 1, gap: 2 },
  title: { fontSize: typography.sizes.md, fontWeight: typography.weights.regular },
  titleUnread: { fontWeight: typography.weights.semibold },
  body: { fontSize: typography.sizes.sm },
  time: { fontSize: typography.sizes.xs, marginTop: 3 },
});
