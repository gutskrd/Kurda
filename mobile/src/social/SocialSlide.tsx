import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Animated, Dimensions, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import { PressableScale, heldDim } from '../theme/MotionParts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { useEdgePanel } from '../navigation/edgePanel';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Avatar } from '../profile/Avatar';
import { GroupAvatar } from '../groups/GroupAvatar';
import { TicketBadge } from '../play/Ticket';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { bucket, type RailFriend, type SocialRailData } from './rail';
import { elapsed, lastSeen } from './time';
import { Loading } from '../theme/Loading';
import { useDirection } from '../reports/direction';

const WIDTH_RATIO = 0.86;

/**
 * Your people, from the side of the app: friends and what they are doing now, who is waiting on you, and groups with
 * unread messages, from one request (`GET /me/social`). An invite that expires in two minutes needs to be reachable
 * from anywhere.
 *
 * It comes from the side its button is on (the right, the left in right-to-left languages) and moves as the profile's
 * menu does (`useEdgePanel`): the same spring, a drag or flick to shut it, and Android's back. The two panels are never
 * on one screen (the menu belongs to Profile, this to Messages), so a swipe is never ambiguous.
 */
export function SocialSlide({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  // The end edge, where the new-message button is: the right, or the left in right-to-left languages.
  const fromRight = dir.row !== 'row-reverse';
  const sign = fromRight ? 1 : -1;

  const [data, setData] = useState<SocialRailData | null>(null);
  const [loading, setLoading] = useState(false);

  const width = Math.round(Dimensions.get('window').width * WIDTH_RATIO);
  // How far it is from open towards its edge: 0 is open, `width` is gone.
  const { away, panHandlers } = useEdgePanel({ open, onClose, width, sign });

  /*
   * Read when it opens, not on a timer: it aggregates six queries, so polling it would be the app's most expensive
   * request running constantly for a closed drawer.
   */
  useEffect(() => {
    if (!open) return;
    let stale = false;
    setLoading(true);
    void client.get<SocialRailData>('/me/social').then((res) => {
      if (stale) return;
      setLoading(false);
      if (res.ok) setData(res.data);
    });
    return () => {
      stale = true;
    };
  }, [open, client]);

  const go = useCallback(
    (run: () => void) => {
      onClose();
      run();
    },
    [onClose],
  );

  const friends = data?.friends ?? [];
  const { playing, online, offline } = bucket(friends);

  const heading = (key: TranslationKey, count?: number) => (
    <Text style={[styles.heading, dir.text, { color: colors.textSecondary }]}>
      {count === undefined ? t(key) : `${t(key)} · ${count}`}
    </Text>
  );

  const person = (f: RailFriend, detail: string) => (
    <PressableScale
      key={f.userId}
      style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}
      onPress={() => go(() => navigation.navigate('Chat', { userId: f.userId, username: f.username }))}
      accessibilityRole="button"
      accessibilityLabel={t('rail.messageWho', { name: f.displayName ?? f.username })}
    >
      <Avatar name={f.username} size={34} photoUrl={f.avatarUrl ?? undefined} />
      <View style={styles.rowMain}>
        <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>
          {f.username}
        </Text>
        {detail ? (
          <Text style={[styles.detail, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? 'box-none' : 'none'}
      // Hidden from screen readers while closed.
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.scrim, opacity: away.interpolate({ inputRange: [0, width], outputRange: [1, 0], extrapolate: 'clamp' }) },
        ]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('rail.closePanel')}
        />
      </Animated.View>

      <Animated.View
        {...panHandlers}
        accessibilityViewIsModal={open}
        style={[
          styles.panel,
          fromRight ? styles.panelRight : styles.panelLeft,
          {
            width,
            backgroundColor: colors.background,
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom,
            transform: [{ translateX: away.interpolate({ inputRange: [0, 1], outputRange: [0, sign] }) }],
          },
        ]}
      >
        {/* Past the screen's edge, so a panel pulled further open shows more panel rather than a gap. */}
        <View pointerEvents="none" style={[styles.skirt, fromRight ? styles.skirtRight : styles.skirtLeft, { width, backgroundColor: colors.background }]} />
        <View style={[styles.head, { flexDirection: dir.row }]}>
          {/* Opened by Messages' new-message pencil: your people by who is around, and a tap on one opens the
             conversation. */}
          <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} numberOfLines={1} accessibilityRole="header">
            {t('messages.new')}
          </Text>
          <Pressable
            onPress={onClose}
            // A 20pt glyph, reaching a fingertip.
            reachSize={{ width: 20, height: 20 }}
            accessibilityRole="button"
            accessibilityLabel={t('rail.closePanel')}
            style={({ pressed }) => pressed && heldDim}
          >
            <Icon name="close" size={20} tone="secondary" />
          </Pressable>
        </View>

        {loading && data === null ? (
          <Loading style={{ marginTop: spacing.lg }} />
        ) : (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* What goes stale first: a challenge is gone in two minutes. */}
            {data && (data.challenges.length > 0 || data.requests.length > 0) ? (
              <View style={styles.group}>
                {heading('rail.waitingOnYou')}
                {data.challenges.map((c) => (
                  <PressableScale
                    key={`c:${c.userId}`}
                    style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}
                    onPress={() => go(() => navigation.navigate('FriendRequests'))}
                    accessibilityRole="button"
                    accessibilityLabel={t('rail.wantsToPlay', { name: c.displayName ?? c.username })}
                  >
                    <Avatar name={c.username} size={34} photoUrl={c.avatarUrl ?? undefined} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>{c.username}</Text>
                      <Text style={[styles.detail, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
                        {t('rail.wantsToPlay', { name: c.displayName ?? c.username })}
                      </Text>
                    </View>
                  </PressableScale>
                ))}
                {data.requests.map((r) => (
                  <PressableScale
                    key={`r:${r.userId}`}
                    style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}
                    onPress={() => go(() => navigation.navigate('FriendRequests'))}
                    accessibilityRole="button"
                    accessibilityLabel={t('rail.wantsToBeFriendsWith', { name: r.displayName ?? r.username })}
                  >
                    {/* A friend request is a ticket, as an invite to play is: its glyph on the face's corner. */}
                    <View>
                      <Avatar name={r.username} size={34} photoUrl={r.avatarUrl ?? undefined} />
                      <View style={[styles.ticketBadge, fromRight ? styles.ticketBadgeRight : styles.ticketBadgeLeft]}>
                        <TicketBadge tone="friend" size={16} ring={colors.background} />
                      </View>
                    </View>
                    <View style={styles.rowMain}>
                      <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>{r.username}</Text>
                      <Text style={[styles.detail, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
                        {r.displayName ? t('rail.wantsToBeFriendsWith', { name: r.displayName }) : t('rail.wantsToBeFriends')}
                      </Text>
                    </View>
                  </PressableScale>
                ))}
              </View>
            ) : null}

            {playing.length > 0 ? (
              <View style={styles.group}>
                {heading('rail.inAGame', playing.length)}
                {playing.map((f) => person(f, elapsed(f.activity!.since, t)))}
              </View>
            ) : null}

            {online.length > 0 ? (
              <View style={styles.group}>
                {heading('rail.friendsOnline', online.length)}
                {online.map((f) => person(f, ''))}
              </View>
            ) : friends.length > 0 && playing.length === 0 ? (
              // Friends, none of them about: said where they would be, not under the ones who are away.
              <View style={styles.group}>
                {heading('rail.friendsOnline')}
                <Text style={[styles.note, dir.text, { color: colors.textSecondary }]}>{t('rail.nobodyRightNow')}</Text>
              </View>
            ) : null}

            {data && data.groups.length > 0 ? (
              <View style={styles.group}>
                {heading('rail.groups')}
                {data.groups.map((g) => (
                  <PressableScale
                    key={g.id}
                    style={[styles.row, { flexDirection: dir.row, backgroundColor: colors.controlTrack }]}
                    onPress={() => go(() => navigation.navigate('GroupThread', { groupId: g.id, name: g.name }))}
                    accessibilityRole="button"
                    accessibilityLabel={g.name}
                  >
                    {/* A group in its rounded square, as Messages draws it, so it is never mistaken for a person of
                       that name. */}
                    <GroupAvatar name={g.name} id={g.id} size={34} photoUrl={g.photoUrl ?? null} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.name, dir.free, { color: colors.textPrimary }]} numberOfLines={1}>{g.name}</Text>
                      <Text style={[styles.detail, dir.text, { color: colors.textSecondary }]} numberOfLines={1}>
                        {t('rail.members', { count: g.memberCount })}
                      </Text>
                    </View>
                    {g.unread > 0 ? (
                      <View style={[styles.unread, { backgroundColor: colors.primary }]}>
                        <Text style={[styles.unreadText, { color: colors.textOnPrimary }]}>{g.unread > 99 ? '99+' : g.unread}</Text>
                      </View>
                    ) : null}
                  </PressableScale>
                ))}
              </View>
            ) : null}

            {offline.length > 0 ? (
              <View style={styles.group}>
                {heading('rail.offline')}
                {offline.map((f) => person(f, lastSeen(f.lastSeenAt ?? null, t)))}
              </View>
            ) : null}

            {/* No friends at all is a different thing to say than none about today. */}
            {data && friends.length === 0 ? (
              <Pressable
                onPress={() => go(() => navigation.navigate('Search'))}
                style={({ pressed }) => [styles.empty, pressed && heldDim]}
                accessibilityRole="button"
                accessibilityLabel={t('rail.findPeople')}
              >
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('rail.noFriendsYet')}</Text>
                <Text style={[styles.emptyLink, { color: colors.primary }]}>{t('rail.findPeople')}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, bottom: 0 },
  panelRight: { right: 0 },
  panelLeft: { left: 0 },
  skirt: { position: 'absolute', top: 0, bottom: 0 },
  skirtRight: { left: '100%' },
  skirtLeft: { right: '100%' },
  // On the face's corner on the side its row ends on.
  ticketBadge: { position: 'absolute', bottom: -4 },
  ticketBadgeRight: { right: -5 },
  ticketBadgeLeft: { left: -5 },
  note: { fontSize: typography.sizes.sm },
  head: {
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
  },
  title: { flex: 1, fontSize: typography.sizes.lg, fontWeight: typography.weights.bold },
  body: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.xs },
  heading: { ...sectionLabel },
  row: { alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, padding: spacing.sm },
  rowMain: { flex: 1 },
  name: { fontSize: typography.sizes.md, fontWeight: typography.weights.semibold },
  detail: { fontSize: typography.sizes.sm },
  unread: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radii.pill, alignItems: 'center' },
  unreadText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  empty: { gap: spacing.xs, alignItems: 'center', marginTop: spacing.lg },
  emptyText: { fontSize: typography.sizes.md, textAlign: 'center' },
  emptyLink: { fontSize: typography.sizes.md, fontWeight: typography.weights.bold },
});

/*
 * Opening it as the side menu is opened: a context holding one function, so a screen can put a button in its header
 * without knowing where the panel lives.
 */
const OpenSlide = createContext<() => void>(() => {});

export function SlideProvider({ value, children }: { value: () => void; children: ReactNode }): React.JSX.Element {
  return <OpenSlide.Provider value={value}>{children}</OpenSlide.Provider>;
}

export function useOpenSlide(): () => void {
  return useContext(OpenSlide);
}

