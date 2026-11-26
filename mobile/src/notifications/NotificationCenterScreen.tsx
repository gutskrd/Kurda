import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { isPlayGame, noticeFiltersFor, noticePicture, noticeShows, type IncomingInvite, type NoticeFilter } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useIntents, useSayNotSaved } from '../api/optimistic';
import type { ApiError } from '../api/types';
import { AsyncBoundary } from '../net/AsyncBoundary';
import type { RootNavigation } from '../navigation/rootStack';
import { HeaderButton } from '../navigation/HeaderButton';
import { layout, spacing } from '../theme/tokens';
import { GradientBackground } from '../theme/glass';
import { useTheme } from '../theme/ThemeProvider';
import { Chips } from '../theme/Chips';
import { useListEntrance } from '../theme/animate';
import { ScreenHeader } from '../navigation/ScreenHeader';
import { useScreenBottomInset } from '../navigation/tabBarLayout';
import { groupNotices, noticeActor, noticeKind, noticeWhen, resolveDeepLink, type InboxItem, type NoticeFriend, type NoticeGroup } from './inbox.js';
import { followDeepLink, notificationText } from './followLink';
import { NotificationHeading, NotificationListSkeleton, NotificationRow } from './NotificationRow';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { EmptyState } from '../theme/EmptyState';
import { CaringMessageDialog, type CaringMessage } from '../reports/CaringMessage';
import { useUnread } from '../messages/unread';
import { haptic, refreshFelt } from '../feedback/haptics';
import { listInvites } from '../play/api';
import { liveInvites } from '../play/invites';
import { GAME_NAME_KEY } from '../play/labels';

const GROUP_TITLE: Record<NoticeGroup, TranslationKey> = {
  today: 'notifications.group.today',
  week: 'notifications.group.thisWeek',
  earlier: 'notifications.group.earlier',
};

const FILTER_LABEL: Record<NoticeFilter, TranslationKey> = {
  all: 'notifications.filter.all',
  people: 'notifications.filter.people',
  games: 'notifications.filter.games',
  progress: 'notifications.filter.progress',
  hevalo: 'notifications.filter.hevalo',
};

/** Ids, as a set that is replaced rather than changed, so React sees each change. */
const plus = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => new Set(set).add(id);
const minus = (set: ReadonlySet<string>, id: string): ReadonlySet<string> => {
  const next = new Set(set);
  next.delete(id);
  return next;
};

/**
 * Pieces a screen reader says one after another, each ended once: a body that already ends its sentence gets no second
 * full stop.
 */
function sentences(parts: ReadonlyArray<string | null>): string {
  return parts.filter((p): p is string => Boolean(p)).reduce((all, part) => (all ? `${all}${/[.!?…؟]$/.test(all) ? ' ' : '. '}${part}` : part), '');
}

/**
 * The notification list: invites, gifts, letters, badges, the league and news from Hevalo, newest first, opened from
 * the bell. Cut into Today, This week and Earlier, with filter chips (People, Games, Progress, From Hevalo; shared
 * notices.ts) when there is more than one kind; a filter whose last notification is removed falls back to everything.
 *
 * Rows are NotificationRow; reading one here clears the bell's dot. A row pulled aside opens on the settings and
 * Delete; one row is open at a time, and a tap or scroll on the list closes it rather than opening anything. Deleting
 * is shown at once and undone only if the server refuses for a reason other than the item being gone already. On a
 * tablet the list is a centred column.
 */
export function NotificationCenterScreen({ onExit }: { onExit: () => void }) {
  const { client, isGuest } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // The invites that can still be answered: who sent each, and whether "Join" still means anything.
  const [invites, setInvites] = useState<IncomingInvite[]>([]);
  // Who sent a gift or a letter: the server names them by id, and they are almost always a friend.
  const [friends, setFriends] = useState<NoticeFriend[]>([]);
  // The moderators' caring message, opened with its helpline (reports/CaringMessage.tsx).
  const [caring, setCaring] = useState<CaringMessage | null>(null);
  const [filter, setFilter] = useState<NoticeFilter>('all');
  // One row open at a time, and the list held still while a finger pulls one.
  const [openId, setOpenId] = useState<string | null>(null);
  const [swiping, setSwiping] = useState(false);
  // Taken away: on their way out (still drawn, leaving), then gone from the list.
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set());
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const { report } = useUnread();
  const bottom = useScreenBottomInset(spacing.lg);

  const live = useMemo(() => (items ?? []).filter((i) => !removed.has(i.id)), [items, removed]);

  // The bell's dot follows what is read and taken away here, without asking the server again.
  useEffect(() => {
    if (items) report({ notifications: live.filter((i) => !i.readAt && !leaving.has(i.id)).length });
  }, [items, live, leaving, report]);

  const load = useCallback(async () => {
    const [res, invited, mine] = await Promise.all([
      client.get<{ notifications: InboxItem[] }>('/me/notifications'),
      listInvites(client),
      // The friend list alone, not the social summary, which reads requests, groups and notifications besides.
      isGuest ? null : client.get<{ friends?: NoticeFriend[] }>('/friends'),
    ]);
    if (invited.ok) setInvites(liveInvites(invited.data.incoming, Date.now()));
    if (mine?.ok) setFriends(mine.data.friends ?? []);
    if (res.ok) {
      setItems(res.data.notifications);
      setError(null);
    } else {
      setError(res.error);
    }
  }, [client, isGuest]);

  useFocusEffect(useCallback(() => void load(), [load]));

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load().finally(() => setRefreshing(false));
  }, [load]);

  /*
   * Read at once, the bell with it, and the server told after. A refusal makes them unread again: said for Mark all
   * read, which was asked for, and quietly for one read by opening it, which has gone on to wherever it leads.
   */
  const say = useSayNotSaved();
  const unread = useCallback((ids: ReadonlySet<string>) => {
    setItems((list) => (list ? list.map((i) => (ids.has(i.id) ? { ...i, readAt: null } : i)) : list));
  }, []);
  const readNow = useCallback((ids: ReadonlySet<string>) => {
    const now = new Date().toISOString();
    setItems((list) => (list ? list.map((i) => (ids.has(i.id) ? { ...i, readAt: i.readAt ?? now } : i)) : list));
  }, []);
  const markedAll = useRef<ReadonlySet<string>>(new Set());
  const readingAll = useIntents<'all', boolean>(() => client.post('/me/notifications/read-all'), {
    failed: (error) => {
      unread(markedAll.current);
      say(error);
    },
  });
  const reading = useIntents<string, boolean>((id) => client.post(`/me/notifications/${id}/read`), {
    failed: (_error, id) => unread(new Set([id])),
  });

  const markAll = useCallback(() => {
    const ids = new Set((items ?? []).filter((i) => !i.readAt).map((i) => i.id));
    if (ids.size === 0) return;
    markedAll.current = ids;
    readNow(ids);
    readingAll.want('all', true, false);
  }, [items, readNow, readingAll]);

  const open = useCallback(
    (item: InboxItem) => {
      if (!item.readAt) {
        readNow(new Set([item.id]));
        reading.want(item.id, true, false);
      }
      const link = resolveDeepLink(item.data);
      // A caring message is read here, with its helpline; it has no screen.
      if (link?.screen === 'CaringMessage') {
        setCaring({ title: item.title, body: item.body, helplineUrl: link.helplineUrl });
        return;
      }
      // A null link stays in the list (the fallback for an expired or removed target); the rest go where followDeepLink
      // sends them.
      if (link) void followDeepLink(link, navigation, client);
    },
    [client, navigation, readNow, reading],
  );

  /**
   * Take one away: it starts leaving at once and the server is told; if the server refuses (and it was not already
   * gone), it comes back in its place and the reason is said.
   */
  const removing = useIntents<string, boolean>(
    async (id) => {
      const res = await client.delete(`/me/notifications/${id}`);
      return res.ok || res.error.status === 404 ? { ok: true, data: null } : res;
    },
    {
      failed: (error, id) => {
        setLeaving((s) => minus(s, id));
        setRemoved((s) => minus(s, id));
        say(error);
      },
    },
  );
  const remove = useCallback(
    (item: InboxItem) => {
      setOpenId(null);
      setLeaving((s) => plus(s, item.id));
      haptic('tap');
      removing.want(item.id, true, false);
    },
    [removing],
  );

  const gone = useCallback((id: string) => {
    setRemoved((s) => plus(s, id));
    setLeaving((s) => minus(s, id));
  }, []);

  const filters = useMemo(() => noticeFiltersFor(live), [live]);
  // A filter whose last notification was taken away falls back to everything.
  const current = filters.includes(filter) ? filter : 'all';
  const hasUnread = live.some((i) => !i.readAt && !leaving.has(i.id));
  const sections = useMemo(
    () => groupNotices(live.filter((i) => noticeShows(i, current))).map((g) => ({ key: g.key, data: g.items })),
    [live, current],
  );
  // Where each row stands in the whole list, for the stagger as it arrives.
  const order = useMemo(() => new Map(sections.flatMap((s) => s.data).map((i, n) => [i.id, n])), [sections]);
  const entering = useListEntrance(items !== null);

  const renderItem = useCallback(
    ({ item, section }: { item: InboxItem; section: { key: NoticeGroup } }) => {
      const actor = noticeActor(item, invites, friends);
      const unread = !item.readAt;
      // An invite that can still be answered names its host, in the reader's words.
      const joinable = item.data.kind === 'play_invite' && actor && isPlayGame(item.data.game);
      const text = joinable
        ? { title: t('play.banner.invited', { name: actor.name, game: t(GAME_NAME_KEY[item.data.game as keyof typeof GAME_NAME_KEY]) }), body: '' }
        : item.data.kind === 'gift'
          ? // A gift says who it is from, or that a member sent it when the server no longer names them to this reader.
            { title: actor ? t('gift.banner.body', { name: actor.name }) : t('gift.fromMember'), body: notificationText(item, t, locale).body }
          : notificationText(item, t, locale);
      const time = noticeWhen(item.createdAt, section.key, t, locale);
      // Join only while there is a game to join, Open only on a gift not yet opened.
      const action = joinable
        ? { label: t('play.banner.join'), onPress: () => open(item) }
        : item.data.kind === 'gift' && unread
          ? { label: t('gift.banner.open'), onPress: () => open(item) }
          : null;
      const label = sentences([unread ? t('messages.filter.unread') : null, text.title, text.body || null, time]);
      return (
        <NotificationRow
          title={text.title}
          body={text.body}
          time={time}
          unread={unread}
          actor={actor}
          kind={noticeKind(item)}
          picture={noticePicture(item)}
          label={label}
          // A tap while a row is open only closes it: the finger was busy with that row, not asking for this one.
          onPress={() => (openId !== null ? setOpenId(null) : open(item))}
          action={action}
          open={openId === item.id}
          leaving={leaving.has(item.id)}
          enter={entering(order.get(item.id) ?? 0)}
          onOpen={(on) => {
            if (on) haptic('tap');
            setOpenId(on ? item.id : null);
          }}
          onRemove={() => remove(item)}
          onGone={() => gone(item.id)}
          onTouch={() => setOpenId((was) => (was === item.id ? was : null))}
          onSwiping={setSwiping}
          onSettings={() => {
            setOpenId(null);
            navigation.navigate('Notifications');
          }}
        />
      );
    },
    [entering, friends, gone, invites, leaving, locale, navigation, open, openId, order, remove, t],
  );

  return (
    <GradientBackground>
      <View style={styles.screen}>
        <ScreenHeader
          title={t('notifications.title')}
          onBack={onExit}
          right={<HeaderButton icon="gear" label={t('settings.notifications')} onPress={() => navigation.navigate('Notifications')} />}
        />

        <AsyncBoundary
          loading={items === null}
          error={items === null ? error : null}
          isEmpty={items !== null && live.length === 0}
          onRetry={() => void load()}
          skeleton={<NotificationListSkeleton />}
          empty={
            <EmptyState
              title={t('notifications.allCaughtUp')}
              body={t('notifications.emptyBody')}
              // Most of what arrives here comes from friends: an invite, a gift, a message.
              action={{ label: t('messages.findFriends'), onPress: () => navigation.navigate('Search') }}
            />
          }
        >
          <SectionList
            sections={sections}
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            ListHeaderComponent={
              filters.length > 2 ? (
                <View style={styles.filters} role="group" accessibilityLabel={t('notifications.filter.label')}>
                  <Chips
                    options={filters}
                    value={current}
                    onChange={(f) => {
                      setOpenId(null);
                      setFilter(f);
                    }}
                    labelOf={(f) => t(FILTER_LABEL[f])}
                  />
                </View>
              ) : null
            }
            renderSectionHeader={({ section }) => (
              <NotificationHeading
                title={t(GROUP_TITLE[section.key])}
                first={section.key === sections[0]?.key}
                action={section.key === sections[0]?.key && hasUnread ? { label: t('notifications.markAllRead'), onPress: markAll } : null}
              />
            )}
            stickySectionHeadersEnabled={false}
            scrollEnabled={!swiping}
            onScrollBeginDrag={() => setOpenId(null)}
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { flex: 1 },
  // The same column the skeleton draws (NotificationRow.tsx), so the rows land where it stood; rows run to its edges.
  column: { width: '100%', maxWidth: layout.column, alignSelf: 'center' },
  // The chips scroll out to the column's edges from inside the gutter (theme/Chips.tsx).
  filters: { paddingHorizontal: layout.gutter, paddingTop: spacing.sm },
});
