import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import type { RootNavigation } from '../navigation/rootStack';
import { radii, spacing, typography } from '../theme/tokens';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { sectionLabel } from '../theme/fonts';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { bucket, waitingCount, type RailFriend, type SocialRailData } from './rail';
import { elapsed, lastSeen } from './time';

const WIDTH_RATIO = 0.86;
const DURATION = 220;
const EASE = Easing.bezier(0.2, 0, 0, 1);

/**
 * Your people, over the side of the app.
 *
 * The browser has had this since the rail was built — "modelled on the one every
 * game client has, because it solves a real problem: an invite that expires in
 * two minutes is useless on a page you have to navigate to". The phone had the
 * same problem and none of the answer: friends live on one tab, groups on
 * another, and who is *in a game right now* was not anywhere at all.
 *
 * It slides from the trailing edge because the leading one is the navigation
 * menu, and a panel that came from the same side would read as that menu having
 * changed its mind. No pan gesture for the same reason: the left edge already
 * owns the swipe, and two edge-swipes on one screen is a guess about which
 * panel you meant.
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
  const reduceMotion = useReducedMotion();

  const [data, setData] = useState<SocialRailData | null>(null);
  const [loading, setLoading] = useState(false);

  const width = Math.round(Dimensions.get('window').width * WIDTH_RATIO);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      slide.setValue(open ? 1 : 0);
      return;
    }
    // started and left alone: stopping it in a cleanup detaches the value from
    // the view, which is the bug `SideMenu` documents next door
    Animated.timing(slide, { toValue: open ? 1 : 0, duration: DURATION, useNativeDriver: true, easing: EASE }).start();
  }, [open, reduceMotion, slide]);

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
  const waiting = data ? waitingCount(data) : 0;

  const heading = (key: TranslationKey, count?: number) => (
    <Text style={[styles.heading, { color: colors.textSecondary }]}>
      {count === undefined ? t(key) : `${t(key)} · ${count}`}
    </Text>
  );

  const person = (f: RailFriend, detail: string) => (
    <Pressable
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
    </Pressable>
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
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: slide }]}
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
        accessibilityViewIsModal={open}
        style={[
          styles.panel,
          {
            width,
            backgroundColor: colors.background,
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom,
            transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }],
          },
        ]}
      >
        <View style={styles.head}>
          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {waiting > 0 ? t('rail.titleWaiting', { count: waiting }) : t('rail.title')}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('rail.closePanel')}>
            <Icon name="close" size={20} tone="secondary" />
          </Pressable>
        </View>

        {loading && data === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />
        ) : (
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {/* what goes stale, first: a challenge is gone in two minutes */}
            {data && (data.challenges.length > 0 || data.requests.length > 0) ? (
              <View style={styles.group}>
                {heading('rail.waitingOnYou')}
                {data.challenges.map((c) => (
                  <Pressable
                    key={`c:${c.userId}`}
                    style={[styles.row, { backgroundColor: colors.controlTrack }]}
                    onPress={() => go(() => navigation.navigate('Inbox'))}
                    accessibilityRole="button"
                    accessibilityLabel={t('rail.wantsToPlay', { name: c.displayName ?? c.username })}
                  >
                    <InitialsAvatar name={c.username} id={c.userId} size={34} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{c.username}</Text>
                      <Text style={[styles.detail, { color: colors.accent }]} numberOfLines={1}>
                        {t('rail.wantsToPlay', { name: c.displayName ?? c.username })}
                      </Text>
                    </View>
                  </Pressable>
                ))}
                {data.requests.map((r) => (
                  <Pressable
                    key={`r:${r.userId}`}
                    style={[styles.row, { backgroundColor: colors.controlTrack }]}
                    onPress={() => go(() => navigation.navigate('Inbox'))}
                    accessibilityRole="button"
                    accessibilityLabel={t('rail.wantsToBeFriendsWith', { name: r.displayName ?? r.username })}
                  >
                    <InitialsAvatar name={r.username} id={r.userId} size={34} />
                    <View style={styles.rowMain}>
                      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{r.username}</Text>
                      <Text style={[styles.detail, { color: colors.textSecondary }]} numberOfLines={1}>
                        {t('rail.wantsToBeFriendsWith', { name: r.displayName ?? r.username })}
                      </Text>
                    </View>
                  </Pressable>
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
                  <Pressable
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
                  </Pressable>
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
                onPress={() => go(() => navigation.navigate('Friends'))}
                style={styles.empty}
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
  trigger: { minWidth: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
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

/** The header button. Trailing edge, because that is the side the panel is on. */
export function SocialSlideButton({ onPress }: { onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={t('rail.title')}
      style={styles.trigger}
    >
      <Icon name="people" size={20} color={colors.textPrimary} />
    </Pressable>
  );
}
