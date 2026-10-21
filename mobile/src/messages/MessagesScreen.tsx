import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useScrollToTop } from '@react-navigation/native';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Rise } from '../theme/MotionParts';
import { useListEntrance } from '../theme/animate';
import { refreshFelt } from '../feedback/haptics';
import { useAuth } from '../auth/AuthContext';
import type { TabNavigation } from '../navigation/rootStack';
import { layout, radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { ErrorRetry, GradientBackground } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { Chips } from '../theme/Chips';
import { SearchField } from '../theme/SearchField';
import { Skeleton, SkeletonText } from '../theme/Skeleton';
import { EmptyState } from '../theme/EmptyState';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { LargeTitle } from '../navigation/LargeTitle';
import { HeaderButton } from '../navigation/HeaderButton';
import { useOpenSlide } from '../social/SocialSlide';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { resolveDeepLink, type InboxItem } from '../notifications/inbox';
import { messagePreview } from '../chat/preview';
import { CaringMessageDialog, type CaringMessage } from '../reports/CaringMessage';
import type { Group } from '../groups/api';
import {
  FILTER_LABEL,
  MESSAGE_FILTERS,
  listTime,
  messageRows,
  type DirectConversation,
  type GroupConversation,
  type MessageFilter,
  type MessageRow,
} from './list';
import { useUnread } from './unread';

interface RequestRow {
  userId: string;
  username: string;
  displayName?: string | null;
}

/**
 * Messages: every conversation, with one person or with a group, and the
 * friend requests waiting on you.
 *
 * The requests are a single row at the top — "Friend requests (2)" — rather
 * than rows among the chats, because a request is the one thing in here
 * waiting on the reader, and in a list sorted by time it would sink under a
 * morning of chatter. The chats follow, newest first, an unread one in bold
 * with its count.
 *
 * The field filters what is already loaded (no request per letter), and the
 * chips narrow to what is unread or to groups. A message from the moderators
 * that checks on somebody's wellbeing is pinned above everything until it is
 * read: it is the kind of message that must never be missed.
 *
 * Notifications are not here any more. They are the bell on Home: what
 * arrived *about* you is not a conversation *with* anybody.
 */
export function MessagesScreen(): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<TabNavigation>();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const dir = useDirection();
  const openSlide = useOpenSlide();
  const topInset = useScreenTopInset();
  const bottomInset = useTabBarInset();
  const { report } = useUnread();

  const [filter, setFilter] = useState<MessageFilter>('all');
  const [query, setQuery] = useState('');
  const [chats, setChats] = useState<DirectConversation[] | null>(null);
  const [groups, setGroups] = useState<GroupConversation[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [caringItems, setCaringItems] = useState<InboxItem[]>([]);
  const [caring, setCaring] = useState<CaringMessage | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // the conversations could not be read at all: say so and offer to try again, rather than "No messages yet"
  const [failed, setFailed] = useState(false);

  const listRef = useRef<FlatList<MessageRow>>(null);
  useScrollToTop(listRef);

  const load = useCallback(async () => {
    const [c, g, gu, r, n] = await Promise.all([
      client.get<{ conversations: DirectConversation[] }>('/chat/conversations'),
      client.get<{ groups: Group[] }>('/me/groups'),
      client.get<{ unread: { groupId: string; unread: number }[] }>('/me/groups/unread'),
      client.get<{ requests: RequestRow[] }>('/friends/requests'),
      client.get<{ notifications: InboxItem[] }>('/me/notifications'),
    ]);
    const unreadByGroup = new Map((gu.ok ? gu.data.unread : []).map((u) => [u.groupId, u.unread]));
    const nextGroups: GroupConversation[] = g.ok
      ? g.data.groups
          .filter((x) => x.archivedAt === null)
          .map((x) => ({ id: x.id, name: x.name, memberCount: x.memberCount, unread: unreadByGroup.get(x.id) ?? 0 }))
      : [];
    setFailed(!c.ok);
    if (c.ok) setChats(c.data.conversations);
    setGroups(nextGroups);
    if (r.ok) setRequests(r.data.requests);
    if (n.ok) {
      setCaringItems(n.data.notifications.filter((i) => !i.readAt && resolveDeepLink(i.data)?.screen === 'CaringMessage'));
    }
    // the badge on the tab, from what was just read rather than asked for again
    report({
      ...(c.ok ? { chats: c.data.conversations.reduce((sum, x) => sum + Math.max(0, x.unread), 0) } : {}),
      ...(gu.ok ? { groups: gu.data.unread.reduce((sum, x) => sum + Math.max(0, x.unread), 0) } : {}),
      ...(r.ok ? { requests: r.data.requests.length } : {}),
    });
  }, [client, report]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openCaring = useCallback(
    (item: InboxItem) => {
      const link = resolveDeepLink(item.data);
      if (link?.screen !== 'CaringMessage') return;
      setCaringItems((list) => list.filter((i) => i.id !== item.id));
      void client.post(`/me/notifications/${item.id}/read`);
      setCaring({ title: item.title, body: item.body, helplineUrl: link.helplineUrl });
    },
    [client],
  );

  const preview = useCallback(
    (chat: DirectConversation) => (chat.lastFromMe ? t('chat.lastFromYou', { preview: messagePreview(chat, t) }) : messagePreview(chat, t)),
    [t],
  );

  const rows = useMemo(
    () => messageRows({ chats: chats ?? [], groups, filter, query, preview }),
    [chats, groups, filter, query, preview],
  );
  // the first screenful of conversations rises in once, as the list arrives
  const entering = useListEntrance(chats !== null && rows.length > 0);
  const unreadCount = useMemo(
    () => (chats ?? []).filter((c) => c.unread > 0).length + groups.filter((g) => g.unread > 0).length,
    [chats, groups],
  );

  const open = (row: MessageRow) =>
    row.kind === 'direct'
      ? navigation.navigate('Chat', { userId: row.chat.userId, username: row.chat.username })
      : navigation.navigate('GroupThread', { groupId: row.group.id, name: row.group.name });

  const findFriends = () => navigation.navigate('Search');
  const nothingAtAll = chats !== null && chats.length === 0 && groups.length === 0;
  const typed = query.trim().length > 0;

  const header = (
    <View style={styles.listHead}>
      {caringItems.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => openCaring(item)}
          accessibilityRole="button"
          accessibilityLabel={item.title}
          style={({ pressed }) => [styles.pinned, { backgroundColor: colors.successFill, opacity: pressed ? 0.8 : 1, flexDirection: dir.row }]}
        >
          <Icon name="lifebuoy" size={22} color={colors.success} />
          <View style={styles.rowMain}>
            <Text style={[styles.rowName, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.rowPreview, dir.free, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.body}
            </Text>
          </View>
        </Pressable>
      ))}

      {requests.length > 0 && filter !== 'groups' ? (
        <Pressable
          onPress={() => navigation.navigate('FriendRequests')}
          accessibilityRole="button"
          accessibilityLabel={t('messages.requests', { count: requests.length })}
          testID="messages-requests"
          style={({ pressed }) => [styles.requests, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1, flexDirection: dir.row }]}
        >
          <View style={styles.faces}>
            {requests.slice(0, 2).map((r, i) => (
              <View key={r.userId} style={[styles.face, i > 0 && styles.faceBehind, { borderColor: colors.surface }]}>
                <InitialsAvatar name={r.username} id={r.userId} size={32} />
              </View>
            ))}
          </View>
          <View style={styles.rowMain}>
            <Text style={[styles.rowName, styles.unreadName, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
              {t('messages.requests', { count: requests.length })}
            </Text>
            <Text style={[styles.rowPreview, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
              {requests.map((r) => r.displayName ?? r.username).join(', ')}
            </Text>
          </View>
          <Icon name="chevron-right" size={16} color={colors.textSecondary} style={dir.flip ?? undefined} />
        </Pressable>
      ) : null}
    </View>
  );

  const empty =
    chats === null && failed ? (
      <ErrorRetry onRetry={() => void load()} style={styles.error} />
    ) : chats === null ? (
      <ConversationsSkeleton />
    ) : typed ? (
      <Text style={[styles.note, { color: colors.textSecondary }]}>{t('messages.noMatch', { query: query.trim() })}</Text>
    ) : filter === 'unread' ? (
      <Text style={[styles.note, { color: colors.textSecondary }]}>{t('messages.noUnread')}</Text>
    ) : filter === 'groups' ? (
      <EmptyState
        title={t('groups.noGroupsYet')}
        body={t('groups.noGroupsBody')}
        action={{ label: t('groups.discover'), onPress: () => navigation.navigate('Clubs') }}
      />
    ) : (
      <EmptyState title={t('messages.empty')} body={t('messages.empty.body')} action={{ label: t('messages.findFriends'), onPress: findFriends }} />
    );

  return (
    <GradientBackground>
      <View style={[styles.head, { paddingTop: topInset }]}>
        <LargeTitle
          title={t('nav.messages')}
          right={<HeaderButton icon="compose" label={t('messages.new')} onPress={openSlide} edge="end" />}
        />
        {nothingAtAll && requests.length === 0 ? null : (
          <>
            <SearchField value={query} onChangeText={setQuery} label={t('messages.search')} returnKeyType="done" />
            <Chips
              options={MESSAGE_FILTERS}
              value={filter}
              onChange={setFilter}
              labelOf={(f) => t(FILTER_LABEL[f])}
              countOf={(f) => (f === 'unread' && unreadCount > 0 ? unreadCount : null)}
            />
          </>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item, index }) => (
          <Rise delay={entering(index)}>
            <ConversationRow row={item} locale={locale} preview={preview} onPress={() => open(item)} />
          </Rise>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          filter === 'groups' && groups.length > 0 ? (
            <Pressable
              onPress={() => navigation.navigate('Clubs')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.discover, { opacity: pressed ? 0.6 : 1, flexDirection: dir.row }]}
            >
              <Icon name="people" size={20} color={colors.textPrimary} />
              <Text style={[styles.discoverText, { color: colors.textPrimary }]}>{t('groups.discover')}</Text>
            </Pressable>
          ) : null
        }
        contentContainerStyle={[styles.list, { paddingBottom: bottomInset }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshFelt(refresh)} tintColor={colors.textSecondary} />}
        showsVerticalScrollIndicator={false}
      />
      <CaringMessageDialog message={caring} onClose={() => setCaring(null)} />
    </GradientBackground>
  );
}

/**
 * One conversation: who, the last line, when, and whether anything in it is
 * unread — which is said three ways, because colour alone is not a signal:
 * the name turns bold, the count appears, and a screen reader hears it.
 */
function ConversationRow({
  row,
  locale,
  preview,
  onPress,
}: {
  row: MessageRow;
  locale: string;
  preview: (chat: DirectConversation) => string;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const unread = row.unread > 0;
  const line = row.kind === 'direct' ? preview(row.chat) : t('groups.memberCount', { count: row.group.memberCount });
  const when = row.kind === 'direct' ? listTime(row.at, locale) : '';
  const label = unread ? t('messages.unreadLabel', { name: row.name, count: row.unread }) : row.name;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${line}`}
      testID={`conversation-${row.key}`}
      style={({ pressed }) => [styles.row, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
    >
      <View>
        <InitialsAvatar
          name={row.name}
          id={row.kind === 'direct' ? row.chat.userId : row.group.id}
          size={52}
          photoUrl={row.kind === 'direct' ? (row.chat.avatarUrl ?? undefined) : undefined}
        />
        {row.kind === 'group' ? (
          // a group is marked as one, so it is not mistaken for a person with that name
          <View style={[styles.groupMark, { backgroundColor: colors.surfaceRaised, borderColor: colors.background }]}>
            <Icon name="people" size={12} color={colors.textPrimary} />
          </View>
        ) : null}
      </View>
      <View style={styles.rowMain}>
        <View style={[styles.rowTop, { flexDirection: dir.row }]}>
          <Text
            style={[styles.rowName, dir.text, unread && styles.unreadName, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {row.name}
          </Text>
          {when ? <Text style={[styles.when, { color: unread ? colors.textPrimary : colors.textSecondary }]}>{when}</Text> : null}
        </View>
        <View style={[styles.rowTop, { flexDirection: dir.row }]}>
          <Text
            style={[styles.rowPreview, dir.free, { color: unread ? colors.textPrimary : colors.textSecondary }]}
            numberOfLines={1}
          >
            {line}
          </Text>
          {unread ? (
            <View style={[styles.count, { backgroundColor: colors.goldText }]}>
              <Text style={[styles.countText, { color: colors.textOnPrimary }]}>{row.unread > 99 ? '99+' : row.unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The list while it loads: conversation rows in grey, at the row's own size
 * — the 52pt picture, the name and the time on one line, the last message
 * under it — as many as the screen holds.
 */
function ConversationsSkeleton(): React.JSX.Element {
  const { t } = useI18n();
  const dir = useDirection();
  const { height } = useWindowDimensions();
  const count = Math.max(4, Math.ceil(height / 72));
  const start = { alignItems: dir.row === 'row-reverse' ? 'flex-end' : 'flex-start' } as const;
  return (
    <View accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.row, { flexDirection: dir.row }]}>
          <Skeleton width={52} height={52} radius={radii.pill} />
          <View style={styles.rowMain}>
            <View style={[styles.rowTop, { flexDirection: dir.row }]}>
              <SkeletonText size={typography.sizes.md} width={i % 2 ? '42%' : '56%'} style={[styles.flex, start]} />
              <SkeletonText size={typography.sizes.xs} width={36} />
            </View>
            <SkeletonText size={typography.sizes.sm} width={i % 3 === 1 ? '58%' : '78%'} style={start} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { paddingHorizontal: layout.gutter, gap: spacing.md - 4, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  listHead: { gap: spacing.sm, paddingHorizontal: spacing.sm, marginBottom: spacing.xs },
  error: { paddingTop: spacing.xxl },
  note: { textAlign: 'center', fontSize: typography.sizes.sm, marginTop: spacing.xl, paddingHorizontal: layout.gutter },

  pinned: { alignItems: 'center', gap: spacing.md - 4, borderRadius: radii.md, padding: spacing.md - 4 },
  requests: { alignItems: 'center', gap: spacing.md - 4, borderRadius: radii.md, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md - 4, minHeight: MIN_TOUCH_TARGET + 12 },
  faces: { flexDirection: 'row', width: 52, justifyContent: 'center' },
  face: { borderRadius: radii.pill, borderWidth: 2 },
  faceBehind: { marginLeft: -14 },

  row: {
    alignItems: 'center',
    gap: spacing.md - 4,
    minHeight: 72,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  rowMain: { flex: 1, gap: 2 },
  rowTop: { alignItems: 'center', gap: spacing.sm },
  rowName: { flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  unreadName: { fontWeight: typography.weights.bold },
  rowPreview: { flex: 1, fontSize: typography.sizes.sm },
  when: { fontSize: typography.sizes.xs },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  groupMark: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discover: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET, marginTop: spacing.sm },
  discoverText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
});
