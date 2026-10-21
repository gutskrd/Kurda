import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useI18n } from '../i18n/I18nContext';
import type { RootNavigation } from '../navigation/rootStack';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { bucket, type RailFriend, type SocialRailData } from '../social/rail';
import { Icon } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { layout, radii, spacing } from '../theme/tokens';

/** The face in each circle, and the ring round it with a little air between. */
const FACE = 58;
const RING = 2.5;
const AIR = 2;
const CIRCLE = FACE + 2 * (RING + AIR);
/** How many friends the row holds before it stops: the people most worth a tap, not everybody. */
const MOST = 20;

/**
 * The row of faces at the top of the wall: you first, with a "+" to post
 * something, then your friends — those playing a game now with a gold ring,
 * those online with a green one, the rest as they are, the most recently
 * around first. A tap opens their profile.
 *
 * It is the first thing on Home because the wall is about people, and seeing
 * the people you know there, some of them here right now, is what makes it
 * feel like somewhere to be rather than a list to read. Nobody is ranked or
 * counted; the rings only say who is about.
 *
 * With no friends yet, the second circle finds some.
 */
export function FriendsRow({ refreshKey = 0 }: { refreshKey?: number }): React.JSX.Element {
  const { client, user } = useAuth();
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
      let active = true;
      void client.get<SocialRailData>('/me/social').then((res) => {
        if (active && res.ok) setFriends(res.data.friends ?? []);
      });
      return () => {
        active = false;
      };
      // a pull on the wall asks again
    }, [client, refreshKey]),
  );

  const { playing, online, offline } = bucket(friends ?? []);
  const ordered = [...playing, ...online, ...offline].slice(0, MOST);
  const me = user?.displayName ?? user?.username ?? '';

  return (
    <ScrollView
      ref={scroller}
      // right to left, you are on the right: start the row there, until it has been scrolled by hand
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
      <Face label={t('feed.friends.you')} spoken={`${t('feed.friends.you')}, ${t('post.open')}`} onPress={() => navigation.navigate('Compose')}>
        <InitialsAvatar name={me} id={user?.id ?? ''} size={FACE} photoUrl={user?.profilePhotoUrl ?? undefined} />
        <View style={[styles.plus, { backgroundColor: colors.primary, borderColor: colors.background }]}>
          <Icon name="plus" size={14} color={colors.textOnPrimary} />
        </View>
      </Face>

      {friends !== null && ordered.length === 0 ? (
        <Face label={t('feed.friends.find')} spoken={t('feed.friends.find')} onPress={() => navigation.navigate('Tabs', { screen: 'Search' })}>
          <View style={[styles.find, { backgroundColor: colors.controlTrack }]}>
            <Icon name="people" size={26} color={colors.textPrimary} />
          </View>
        </Face>
      ) : null}

      {ordered.map((f) => {
        const name = f.displayName || f.username;
        const ring = f.activity ? colors.gold : f.online ? colors.success : 'transparent';
        const spoken = f.activity ? t('feed.friends.playing', { name }) : f.online ? t('feed.friends.online', { name }) : name;
        return (
          <Face key={f.userId} label={name} spoken={spoken} ring={ring} onPress={() => navigation.navigate('UserProfile', { userId: f.userId })}>
            <InitialsAvatar name={name} id={f.userId} size={FACE} photoUrl={f.avatarUrl ?? undefined} />
          </Face>
        );
      })}
    </ScrollView>
  );
}

/** One circle and the name under it. */
function Face({
  label,
  spoken,
  ring = 'transparent',
  onPress,
  children,
}: {
  label: string;
  spoken: string;
  ring?: string;
  onPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={spoken}
      style={({ pressed }) => [styles.face, pressed && styles.pressed]}
    >
      <View style={[styles.ring, { borderColor: ring }]}>{children}</View>
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm + 4, paddingHorizontal: layout.gutter, paddingVertical: spacing.sm },
  face: { width: CIRCLE, alignItems: 'center', gap: 4 },
  pressed: { opacity: 0.6 },
  ring: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: radii.pill,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 12, maxWidth: CIRCLE + 6, textAlign: 'center' },
  // the "+" on your own face, sitting on its rim at the bottom corner
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
