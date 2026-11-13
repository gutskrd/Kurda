import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressableScale, heldDim } from '../theme/MotionParts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { useEdgePanel } from '../navigation/edgePanel';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET, hitSlopFor } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { TicketBadge } from '../play/Ticket';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { bucket, type RailFriend, type SocialRailData } from './rail';
import { elapsed, lastSeen } from './time';
import { Loading } from '../theme/Loading';

const WIDTH_RATIO = 0.86;

/**
 * Your people, over the side of the app.
 *
 * The browser has had this since the rail was built — "modelled on the one every
 * game client has, because it solves a real problem: an invite that expires in
 * two minutes is useless on a page you have to navigate to". The phone had the
 * same problem and none of the answer: friends live on one tab, groups on
 * another, and who is *in a game right now* was not anywhere at all.
 *
 * It comes from the right, the side its button is on, and it moves as the
 * profile's menu does (`useEdgePanel`): the same spring in and out, a drag or
 * a flick towards its edge to shut it, and Android's back. The two are never
 * open on one screen — the menu belongs to Profile, this to Messages — so
 * there is no guessing which panel a swipe meant. It used to run a timing of
 * its own and could only be tapped away, which made two panels from one edge
 * feel like two different things.
 *
 * Everything it shows comes from one request. Six would not be a drawer anybody
 * opened twice.
 */
export function SocialSlide({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const { client } = useAuth();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<SocialRailData | null>(null);
  const [loading, setLoading] = useState(false);

  const width = Math.round(Dimensions.get('window').width * WIDTH_RATIO);
  // how far it is from open, towards the right edge: 0 is open, `width` is gone
  const { away, panHandlers } = useEdgePanel({ open, onClose, width, sign: 1 });

  /*
   * Read when it opens, not on a timer.
   *
   * The panel is the only thing that wants this payload and it aggregates six
   * queries, so polling it in the background would be the most expensive request
   * in the app running constantly for a drawer nobody had opened.
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
    <Text style={[styles.heading, { color: colors.textSecondary }]}>
      {count === undefined ? t(key) : `${t(key)} · ${count}`}
    </Text>
  );

  const person = (f: RailFriend, detail: string) => (
    <PressableScale
      key={f.userId}
      style={[styles.row, { backgroundColor: colors.controlTrack }]}
      onPress={() => go(() => navigation.navigate('Chat', { userId: f.userId, username: f.username }))}
      accessibilityRole="button"
      accessibilityLabel={t('rail.messageWho', { name: f.displayName ?? f.username })}
    >
      <InitialsAvatar name={f.username} id={f.userId} size={34} photoUrl={f.avatarUrl ?? undefined} />
      <View style={styles.rowMain}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {f.username}
        </Text>
        {detail ? (
          <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}>
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
      // closed, it is not something a screen reader should find its way into
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
          {
            width,
            backgroundColor: colors.background,
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom,
            transform: [{ translateX: away }],
          },
        ]}
      >
        {/* past the screen's edge, so a panel pulled further open than it goes shows more panel, not a gap */}
        <View pointerEvents="none" style={[styles.skirt, { width, backgroundColor: colors.background }]} />
        <View style={styles.head}>
          {/*
            Opened by Messages' new-message pencil: your people, by who is
            around, and a tap on one opens the conversation with them.
          */}
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1} accessibilityRole="header">
            {t('messages.new')}
          </Text>
          <Pressable
            onPress={onClose}
            // a 20-point glyph, caught at a fingertip's 44
            hitSlop={hitSlopFor(20, 20)}
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
            {/* what goes stale, first: a challenge is gone in two minutes */}
            {data && (data.challenges.length > 0 || data.requests.length > 0) ? (
              <View style={styles.group}>
                {heading('rail.waitingOnYou')}
                {data.challenges.map((c) => (
                  <PressableScale
                    key={`c:${c.userId}`}
                    style={[styles.row, { backgroundColor: colors.controlTrack }]}
                    onPress={() => go(() => navigation.navigate('FriendRequests'))}
                    accessibilityRole="button"
                    accessibilityLabel={t('rail.wantsToPlay', { name: c.displayName ?? c.username })}
                  >
                    <InitialsAvatar name={c.username} id={c.userId} size={34} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{c.username}</Text>
                      <Text style={[styles.detail, { color: colors.textPrimary }]} numberOfLines={1}>
                        {t('rail.wantsToPlay', { name: c.displayName ?? c.username })}
                      </Text>
                    </View>
                  </PressableScale>
                ))}
                {data.requests.map((r) => (
                  <PressableScale
                    key={`r:${r.userId}`}
                    style={[styles.row, { backgroundColor: colors.controlTrack }]}
                    onPress={() => go(() => navigation.navigate('FriendRequests'))}
                    accessibilityRole="button"
                    accessibilityLabel={t('rail.wantsToBeFriendsWith', { name: r.displayName ?? r.username })}
                  >
                    {/* a friend request is a ticket, as an invite to play is: its glyph on the face's corner */}
                    <View>
                      <InitialsAvatar name={r.username} id={r.userId} size={34} />
                      <View style={styles.ticketBadge}>
                        <TicketBadge tone="friend" size={16} ring={colors.background} />
                      </View>
                    </View>
                    <View style={styles.rowMain}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{r.username}</Text>
                      <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}>
                        {t('rail.wantsToBeFriendsWith', { name: r.displayName ?? r.username })}
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
            ) : null}

            {data && data.groups.length > 0 ? (
              <View style={styles.group}>
                {heading('rail.groups')}
                {data.groups.map((g) => (
                  <PressableScale
                    key={g.id}
                    style={[styles.row, { backgroundColor: colors.controlTrack }]}
                    onPress={() => go(() => navigation.navigate('GroupThread', { groupId: g.id, name: g.name }))}
                    accessibilityRole="button"
                    accessibilityLabel={g.name}
                  >
                    <InitialsAvatar name={g.name} id={g.id} size={34} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{g.name}</Text>
                      <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}>
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

            {/* no friends at all is a different thing to say than none about today */}
            {data && friends.length === 0 ? (
              <Pressable
                onPress={() => go(() => navigation.navigate('Tabs', { screen: 'Search' }))}
                style={({ pressed }) => [styles.empty, pressed && heldDim]}
                accessibilityRole="button"
                accessibilityLabel={t('rail.findPeople')}
              >
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('rail.noFriendsYet')}</Text>
                <Text style={[styles.emptyLink, { color: colors.primary }]}>{t('rail.findPeople')}</Text>
              </Pressable>
            ) : data && playing.length === 0 && online.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('rail.nobodyRightNow')}</Text>
            ) : null}
          </ScrollView>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', top: 0, bottom: 0, right: 0 },
  skirt: { position: 'absolute', top: 0, bottom: 0, left: '100%' },
  ticketBadge: { position: 'absolute', right: -5, bottom: -4 },
  head: {
    flexDirection: 'row',
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
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.md, padding: spacing.sm },
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
 * Opening it, the way the side menu is opened: a context holding one function,
 * so a screen puts a button in its header without knowing where the panel lives
 * or holding its state.
 */
const OpenSlide = createContext<() => void>(() => {});

export function SlideProvider({ value, children }: { value: () => void; children: ReactNode }): React.JSX.Element {
  return <OpenSlide.Provider value={value}>{children}</OpenSlide.Provider>;
}

export function useOpenSlide(): () => void {
  return useContext(OpenSlide);
}

