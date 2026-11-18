import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { hueSteps } from '@kurda/shared';
import { useAuth } from '../auth/AuthContext';
import { useAccountGate } from '../auth/AccountGate';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { Avatar, ownAvatarUrl } from '../profile/Avatar';
import { useDirection } from '../reports/direction';
import { springTo, useListEntrance } from '../theme/animate';
import { bucket, type RailFriend, type SocialRailData } from '../social/rail';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing } from '../theme/tokens';
import { pressedDim } from '../theme/motion';

/** The face in each circle, and the ring round it with a little air between. */
const FACE = 58;
const RING = 2.5;
const AIR = 2;
const CIRCLE = FACE + 2 * (RING + AIR);
/** How many friends the row holds before it stops: the people most worth a tap, not everybody. */
const MOST = 20;

/**
 * The row of faces atop the wall: you first, with a "+" to post, then your friends, those playing a game now with
 * a warm ring and those online with a green one, the most recently active first. A tap opens their profile.
 * Nobody is ranked or counted; the rings only show who is around. With no friends yet, the second circle finds
 * some.
 *
 * Faces spring in one after another the first time they arrive; a later render shows them in place.
 */
export function FriendsRow({ refreshKey = 0 }: { refreshKey?: number }): React.JSX.Element {
  const { client, user } = useAuth();
  // A guest has no friends and the social summary refuses guests, so the row is you and the way to find some.
  const { isGuest, require } = useAccountGate();
  const navigation = useNavigation<RootNavigation>();
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const [friends, setFriends] = useState<RailFriend[] | null>(null);
  const mirrored = dir.row === 'row-reverse';
  const scroller = useRef<ScrollView>(null);
  const dragged = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (isGuest) {
        setFriends([]);
        return;
      }
      let active = true;
      void client.get<SocialRailData>('/me/social').then((res) => {
        if (active && res.ok) setFriends(res.data.friends ?? []);
      });
      return () => {
        active = false;
      };
      // A pull on the wall asks again.
    }, [client, refreshKey, isGuest]),
  );

  const { playing, online, offline } = bucket(friends ?? []);
  const ordered = [...playing, ...online, ...offline].slice(0, MOST);
  const me = user?.displayName ?? user?.username ?? '';
  // The first faces spring in once, as the friends arrive; "you" is there from the start.
  const entering = useListEntrance(friends !== null);

  return (
    <ScrollView
      ref={scroller}
      // Right to left, you are on the right: start the row there, until it has been scrolled by hand.
      onContentSizeChange={() => {
        if (mirrored && !dragged.current) scroller.current?.scrollToEnd({ animated: false });
      }}
      onScrollBeginDrag={() => {
        dragged.current = true;
      }}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { flexDirection: dir.row }]}
      accessibilityLabel={t('nav.friends')}
      testID="friends-row"
    >
      <Face
        label={t('feed.friends.you')}
        spoken={`${t('feed.friends.you')}, ${t('post.open')}`}
        onPress={() => require('post') && navigation.navigate('Compose')}
      >
        <Avatar name={me} size={FACE} photoUrl={ownAvatarUrl(user)} />
        <View style={[styles.plus, { backgroundColor: colors.primary, borderColor: colors.background }]}>
          <Icon name="plus" size={14} color={colors.textOnPrimary} />
        </View>
      </Face>

      {friends !== null && ordered.length === 0 ? (
        <Face
          label={t('feed.friends.find')}
          spoken={t('feed.friends.find')}
          delay={entering(1)}
          onPress={() => require('friends') && navigation.navigate('Search')}
        >
          <View style={[styles.find, { backgroundColor: colors.controlTrack }]}>
            <Icon name="people" size={26} color={colors.textPrimary} />
          </View>
        </Face>
      ) : null}

      {ordered.map((f, i) => {
        const name = f.displayName || f.username;
        const ring = f.activity ? 'playing' : f.online ? 'online' : 'none';
        const spoken = f.activity ? t('feed.friends.playing', { name }) : f.online ? t('feed.friends.online', { name }) : name;
        return (
          <Face key={f.userId} label={name} spoken={spoken} ring={ring} delay={entering(i + 1)} onPress={() => navigation.navigate('UserProfile', { userId: f.userId })}>
            <Avatar name={name} size={FACE} photoUrl={f.avatarUrl ?? undefined} />
          </Face>
        );
      })}
    </ScrollView>
  );
}

/**
 * A face springing in from slightly smaller on the bouncy spring, `delay` after the row arrives
 * (useListEntrance's beat for its place). Null means static: faces after the first screenful, on later visits,
 * and under Reduce Motion.
 */
function SpringIn({ delay, children }: { delay: number | null; children: ReactNode }): React.JSX.Element {
  const arrive = useRef(new Animated.Value(delay === null ? 1 : 0)).current;
  useEffect(() => {
    if (delay === null) return;
    const run = springTo(arrive, 1, 'bouncy', delay);
    run.start();
    return () => run.stop();
    // Once, as the face mounts.
  }, []);
  const scale = arrive.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const opacity = arrive.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  return <Animated.View style={{ opacity, transform: [{ scale }] }}>{children}</Animated.View>;
}

/** One circle and the name under it. */
function Face({
  label,
  spoken,
  ring = 'none',
  delay = null,
  onPress,
  children,
}: {
  label: string;
  spoken: string;
  /** When the face springs in, or null for one that is simply there. */
  delay?: number | null;
  /**
   * Who is around, as a ring: a warm gradient for a friend playing now (the liveliest thing in the row), quiet
   * green for online, nothing otherwise.
   */
  ring?: 'playing' | 'online' | 'none';
  onPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const r = (CIRCLE - RING) / 2;
  /* The warm ring for a friend playing now: orange into pink, two of the shared hues (gold is kept for what is earned). */
  const from = hueSteps(colors.scheme, 'orange').base;
  const to = hueSteps(colors.scheme, 'pink').base;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      style={({ pressed }) => [styles.face, pressed && styles.pressed]}
    >
      <SpringIn delay={delay}>
        <View style={styles.ring}>
          {ring !== 'none' ? (
          <Svg width={CIRCLE} height={CIRCLE} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <LinearGradient id="playing" x1="0" y1="1" x2="1" y2="0">
                <Stop offset="0" stopColor={from} />
                <Stop offset="1" stopColor={to} />
              </LinearGradient>
            </Defs>
            <Circle
              cx={CIRCLE / 2}
              cy={CIRCLE / 2}
              r={r}
              stroke={ring === 'playing' ? 'url(#playing)' : colors.success}
              strokeWidth={RING}
              fill="none"
            />
          </Svg>
          ) : null}
          {children}
        </View>
      </SpringIn>
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm + 4, paddingHorizontal: layout.gutter, paddingVertical: spacing.sm },
  face: { width: CIRCLE, alignItems: 'center', gap: 4 },
  pressed: { opacity: pressedDim },
  ring: {
    width: CIRCLE,
    height: CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 12, maxWidth: CIRCLE + 6, textAlign: 'center' },
  // The "+" on your own face, sitting on its rim at the bottom corner.
  plus: {
    position: 'absolute',
    right: AIR,
    bottom: AIR,
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  find: { width: FACE, height: FACE, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
});
