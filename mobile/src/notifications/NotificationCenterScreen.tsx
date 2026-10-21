import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { isPlayGame, type IncomingInvite } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import type { RootNavigation } from '../navigation/rootStack';
import { HeaderButton } from '../navigation/HeaderButton';
import { layout, spacing } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { groupNotices, noticeActor, noticeKind, noticeTime, resolveDeepLink, type InboxItem, type NoticeGroup } from './inbox.js';
import { followDeepLink, notificationText } from './followLink';
import { NotificationHeading, NotificationListSkeleton, NotificationRow } from './NotificationRow';
import { NOTICE } from './rowMetrics';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { EmptyState } from '../theme/EmptyState';
import { CaringMessageDialog, type CaringMessage } from '../reports/CaringMessage';
import { useUnread } from '../messages/unread';
import { refreshFelt } from '../feedback/haptics';
import { listInvites } from '../play/api';
import { liveInvites } from '../play/invites';
import { GAME_NAME_KEY } from '../play/labels';

const GROUP_TITLE: Record<NoticeGroup, TranslationKey> = {
  today: 'notifications.group.today',
  week: 'notifications.group.thisWeek',
  earlier: 'notifications.group.earlier',
};

/**
 * The notification list (KUR-097): invites, gifts, badges, the league and
 * notices from Hevalo, newest first. Opened from the bell on Home.
 *
 * Cut into Today, This week and Earlier, because a list of fifty with nothing
 * between them makes "what happened since I last looked" a job of reading
 * timestamps. Each row says who or what it is from with a picture, what
 * happened in a sentence, and when in a few quiet characters at the end.
 *
 * An unread one is marked three ways — a dot, a tinted row, and the word a
 * screen reader hears — and reading them here takes the dot off the bell.
 *
 * On a tablet the list is a column in the middle, as the shop's and the
 * season's are, rather than rows stretched across the whole screen.
 */
export function NotificationCenterScreen({ onExit }: { onExit: () => void }) {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // the invites that can still be answered: who sent each, and whether "Join" still means anything
  const [invites, setInvites] = useState<IncomingInvite[]>([]);
  // the moderators' caring message, opened with its helpline (reports/CaringMessage.tsx)
  const [caring, setCaring] = useState<CaringMessage | null>(null);
  const { report } = useUnread();
  const bottom = useScreenBottomInset(spacing.lg);

  // the bell's dot follows what is read here, without asking the server again
  useEffect(() => {
    if (items) report({ notifications: items.filter((i) => !i.readAt).length });
  }, [items, report]);

  const load = useCallback(async () => {
    const [res, live] = await Promise.all([client.get<{ notifications: InboxItem[] }>('/me/notifications'), listInvites(client)]);
    if (live.ok) setInvites(liveInvites(live.data.incoming, Date.now()));
    if (res.ok) {
      setItems(res.data.notifications);
      setError(null);
    } else {
      setError(res.error);
    }
  }, [client]);

  useFocusEffect(useCallback(() => void load(), [load]));

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

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
  const sections = useMemo(() => groupNotices(items ?? []).map((g) => ({ key: g.key, data: g.items })), [items]);

  const renderItem = useCallback(
    ({ item }: { item: InboxItem }) => {
      const actor = noticeActor(item, invites);
      const unread = !item.readAt;
      // an invite that can still be answered names its host, in the reader's words
      const live = item.data.kind === 'play_invite' && actor && isPlayGame(item.data.game);
      const text = live
        ? { title: t('play.banner.invited', { name: actor.name, game: t(GAME_NAME_KEY[item.data.game as keyof typeof GAME_NAME_KEY]) }), body: '' }
        : notificationText(item, t, locale);
      const time = noticeTime(item.createdAt, t, locale);
      // Join only while there is a game to join, Open only on a gift not yet opened
      const action = live
        ? { label: t('play.banner.join'), onPress: () => open(item) }
        : item.data.kind === 'gift' && unread
          ? { label: t('gift.banner.open'), onPress: () => open(item) }
          : null;
      const label = [unread ? t('messages.filter.unread') : null, text.title, text.body || null, time].filter(Boolean).join('. ');
      return (
        <NotificationRow
          title={text.title}
          body={text.body}
          time={time}
          unread={unread}
          actor={actor}
          kind={noticeKind(item)}
          label={label}
          onPress={() => open(item)}
          action={action}
        />
      );
    },
    [invites, locale, open, t],
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader
          title={t('notifications.title')}
          onBack={onExit}
          right={<HeaderButton icon="gear" label={t('settings.notifications')} onPress={() => navigation.navigate('Notifications')} edge="end" />}
        />

        <AsyncBoundary
          loading={items === null}
          error={items === null ? error : null}
          isEmpty={items?.length === 0}
          onRetry={() => void load()}
          skeleton={<NotificationListSkeleton />}
          empty={
            <EmptyState
              title={t('notifications.allCaughtUp')}
              body={t('notifications.emptyBody')}
              // most of what arrives here comes from friends: an invite, a gift, a message
              action={{ label: t('messages.findFriends'), onPress: () => navigation.navigate('Tabs', { screen: 'Search' }) }}
            />
          }
        >
          <SectionList
            sections={sections}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <NotificationHeading
                title={t(GROUP_TITLE[section.key])}
                first={section.key === sections[0]?.key}
                action={section.key === sections[0]?.key && hasUnread ? { label: t('notifications.markAllRead'), onPress: markAll } : null}
              />
            )}
            ItemSeparatorComponent={Gap}
            stickySectionHeadersEnabled={false}
            style={styles.list}
            contentContainerStyle={[styles.column, { paddingBottom: bottom + spacing.lg }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.textSecondary} />}
            showsVerticalScrollIndicator={false}
          />
        </AsyncBoundary>
      </View>
      <CaringMessageDialog message={caring} onClose={() => setCaring(null)} />
    </GradientBackground>
  );
}

function Gap(): React.JSX.Element {
  return <View style={styles.gap} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { flex: 1 },
  // the same column the skeleton draws (NotificationRow.tsx), so the rows land where it stood
  column: { width: '100%', maxWidth: layout.column, alignSelf: 'center', paddingHorizontal: layout.gutter - NOTICE.padH },
  gap: { height: NOTICE.rowGap },
});
