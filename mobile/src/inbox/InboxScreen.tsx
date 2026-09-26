import { useCallback, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { ClayButton, GradientBackground, Segmented } from '../theme/glass';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useScreenTopInset, useTabBarInset } from '../navigation/tabBarLayout';
import { LargeTitle } from '../navigation/LargeTitle';
import { SideMenuButton, useOpenMenu } from '../navigation/SideMenu';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { relativeTime, resolveDeepLink, type InboxItem } from '../notifications/inbox';
import { FILTERS, FILTER_LABEL, SECTION_LABEL, newestFirst, sectionsFor, type InboxFilter } from './sections';

interface RequestRow {
  userId: string;
  username: string;
  displayName?: string | null;
}

interface ConversationRow {
  userId: string;
  username: string;
  lastMessage: string;
  lastAt?: string | null;
  lastFromMe: boolean;
  unread: number;
}

/**
 * Everything that arrived for you, in one place.
 *
 * Three things arrive and they lived in three: friend requests on the Friends
 * tab, conversations behind a Messages button, notifications behind a bell.
 * Nothing told you the total, so finding out whether anything had happened
 * meant visiting all three.
 *
 * Sections rather than one merged stream — `sections.ts` says why, and the
 * short version is that a request is the only one of the three waiting on you
 * and must not sink under a morning of chatter.
 *
 * This is a hub, not a replacement: it shows what is recent and lets you act
 * on it, and each section ends in a way through to the full list, which is
 * still the screen it always was.
 */
export function InboxScreen(): React.JSX.Element {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const openMenu = useOpenMenu();
  const topInset = useScreenTopInset();
  const bottomInset = useTabBarInset();

  const [filter, setFilter] = useState<InboxFilter>('all');
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [chats, setChats] = useState<ConversationRow[]>([]);
  const [alerts, setAlerts] = useState<InboxItem[]>([]);

  const load = useCallback(() => {
    void client.get<{ requests: RequestRow[] }>('/friends/requests').then((r) => {
      if (r.ok) setRequests(r.data.requests);
    });
    void client.get<{ conversations: ConversationRow[] }>('/chat/conversations').then((r) => {
      if (r.ok) setChats(newestFirst(r.data.conversations, (c) => c.lastAt));
    });
    void client.get<{ notifications: InboxItem[] }>('/me/notifications').then((r) => {
      if (r.ok) setAlerts(newestFirst(r.data.notifications, (n) => n.createdAt));
    });
  }, [client]);

  useFocusEffect(useCallback(() => load(), [load]));

  const respond = useCallback(
    (userId: string, accept: boolean) => {
      // gone from the list straight away: the answer is not in doubt, and
      // leaving the row there while the request flies reads as a dead button
      setRequests((list) => list.filter((r) => r.userId !== userId));
      void client.post(`/friends/requests/${userId}/${accept ? 'accept' : 'decline'}`);
    },
    [client],
  );

  const openAlert = useCallback(
    (item: InboxItem) => {
      if (!item.readAt) {
        setAlerts((list) => list.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)));
        void client.post(`/me/notifications/${item.id}/read`);
      }
      const link = resolveDeepLink(item.data);
      if (!link) return;
      if (link.screen === 'Chat') navigation.navigate('Chat', link.params);
      else if (link.screen === 'Game') navigation.navigate('Game', link.params);
      else if (link.screen === 'Profile') navigation.navigate('UserProfile', { userId: link.params.userId });
      else if (link.screen === 'EventQuests') navigation.navigate('EventQuests');
      else navigation.navigate('Notifications');
    },
    [client, navigation],
  );

  const shown = sectionsFor(filter);
  const empty =
    (!shown.includes('requests') || requests.length === 0) &&
    (!shown.includes('chats') || chats.length === 0) &&
    (!shown.includes('alerts') || alerts.length === 0);

  const heading = (key: TranslationKey) => (
    <Text style={[styles.heading, { color: colors.textSecondary }]}>{t(key)}</Text>
  );

  const more = (key: TranslationKey, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.more}>
      <Text style={[styles.moreText, { color: colors.primary }]}>{t(key)}</Text>
      <Icon name="chevron-right" size={14} color={colors.primary} />
    </Pressable>
  );

  return (
    <GradientBackground>
      <View style={{ paddingTop: topInset }}>
        <LargeTitle left={<SideMenuButton onPress={openMenu} />} title={t('inbox.title')} />
      </View>

      <View style={styles.controls}>
        <Segmented options={FILTERS} value={filter} onChange={setFilter} labelOf={(f) => t(FILTER_LABEL[f])} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        {shown.includes('requests') && requests.length > 0 ? (
          <View style={styles.section}>
            {heading(SECTION_LABEL.requests)}
            {/*
              Two lines, not one.

              Side by side at 375pt, the avatar and the two buttons leave about
              sixty points for the name, and a request from someone called
              "rojhat" arrives as "roj…". The name is the whole content of the
              row — it is the only way to know who is asking — so it gets the
              width and the buttons get their own line.
            */}
            {requests.map((r) => (
              <View key={r.userId} style={[styles.request, { backgroundColor: colors.controlTrack }]}>
                <View style={styles.requestWho}>
                  <InitialsAvatar name={r.username} id={r.userId} size={36} />
                  <View style={styles.rowMain}>
                    <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {r.username}
                    </Text>
                    {r.displayName ? (
                      <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
                        {r.displayName}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <View style={styles.requestActions}>
                  <ClayButton
                    label={t('friends.accept')}
                    tone="primary"
                    onPress={() => respond(r.userId, true)}
                    style={styles.requestButton}
                  />
                  <ClayButton
                    label={t('friends.decline')}
                    variant="outline"
                    onPress={() => respond(r.userId, false)}
                    style={styles.requestButton}
                  />
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {shown.includes('chats') && chats.length > 0 ? (
          <View style={styles.section}>
            {heading(SECTION_LABEL.chats)}
            {chats.slice(0, 6).map((c) => (
              <Pressable
                key={c.userId}
                onPress={() => navigation.navigate('Chat', { userId: c.userId, username: c.username })}
                accessibilityRole="button"
                accessibilityLabel={c.username}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <InitialsAvatar name={c.username} id={c.userId} size={36} />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {c.username}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={1}>
                    {c.lastMessage}
                  </Text>
                </View>
                {c.unread > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.badgeText, { color: colors.textOnPrimary }]}>{c.unread}</Text>
                  </View>
                ) : null}
              </Pressable>
            ))}
            {more('inbox.openChats', () => navigation.navigate('Chats'))}
          </View>
        ) : null}

        {shown.includes('alerts') && alerts.length > 0 ? (
          <View style={styles.section}>
            {heading(SECTION_LABEL.alerts)}
            {alerts.slice(0, 8).map((a) => (
              <Pressable
                key={a.id}
                onPress={() => openAlert(a)}
                accessibilityRole="button"
                accessibilityLabel={a.title}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: colors.controlTrack, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                {/* an unread one is marked, not coloured: the row keeps its own contrast */}
                <View style={[styles.dot, { backgroundColor: a.readAt ? 'transparent' : colors.primary }]} />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={[styles.rowSub, { color: colors.textSecondary }]} numberOfLines={2}>
                    {a.body}
                  </Text>
                </View>
                <Text style={[styles.when, { color: colors.textSecondary }]}>{relativeTime(a.createdAt)}</Text>
              </Pressable>
            ))}
            {more('inbox.openAlerts', () => navigation.navigate('NotificationCenter'))}
          </View>
        ) : null}

        {empty ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('inbox.empty')}</Text> : null}
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.lg },
  section: { gap: spacing.sm },
  heading: { ...sectionLabel },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  request: { borderRadius: radii.md, padding: spacing.md, gap: spacing.sm },
  requestWho: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  requestActions: { flexDirection: 'row', gap: spacing.sm },
  requestButton: { flex: 1 },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
  rowSub: { fontSize: typography.sizes.sm },
  when: { fontSize: typography.sizes.xs },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
  badge: { minWidth: 20, height: 20, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  more: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: MIN_TOUCH_TARGET },
  moreText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
  hint: { fontSize: typography.sizes.md, textAlign: 'center', marginTop: spacing.xl },
});
