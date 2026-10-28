import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { unreadBadge } from '../notifications/inbox';
import { useUnread } from '../messages/unread';
import { haptic } from '../feedback/haptics';
import { springTo } from '../theme/animate';
import { TAB_BAR_HEIGHT } from './tabBarLayout';
import { TABS, type TabName } from './tabs';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useAuth } from '../auth/AuthContext';

/** The glyphs: big enough to hit and to read at a glance, as a phone's own bar draws them. */
const GLYPH = 26;
/** Your picture on the Profile tab, a little smaller than the glyphs so its ring fits the same box. */
const AVATAR = 24;
/** How far a tab sinks while it is held: enough to feel, not enough to look like it moved. */
const PRESSED_SCALE = 0.86;

/**
 * The tab bar: five places, docked along the bottom edge, each one an icon.
 *
 * The tab you are on is drawn solid and the others in outline: a change of
 * shape, which reads at a glance and does not lean on colour alone. Your own
 * picture is the Profile tab, ringed while you are on it.
 *
 * No words under the icons. Every tab still has its whole name for a screen
 * reader, and holding a tab shows its name above it for as long as it is
 * held, as the system bar does for somebody using large text, so nobody has
 * to guess what a glyph means.
 *
 * A tab sinks a little under the finger and springs back, and moving to
 * another tab gives the light tick of a selection. Somebody who has asked
 * for less motion gets neither the sink nor the spring.
 *
 * Two things badge, and nothing else does: Messages, with how many unread
 * messages and friend requests are waiting (1–9, then "9+"), and Profile, with
 * a dot when a gift is waiting to be unwrapped. A badge that counts anything
 * else is a badge people learn to ignore. Both are said in words to a screen
 * reader — "Messages, 3 unread" — since a number in a coloured circle is not
 * something VoiceOver can see.
 *
 * Tapping the tab you are already on scrolls its screen back to the top: the
 * bar sends the press either way, and each tab's list listens for it
 * (`useScrollToTop`).
 *
 * In Soranî and Arabic the bar is mirrored, Home on the right, the same as
 * every row on those screens.
 *
 * It is solid, with a hairline along its top edge, and sits over the bottom
 * of the screens: last in the tree, with a z-index and, for Android, where
 * elevation decides what draws on top, an elevation above anything a screen
 * raises. Each tab screen leaves room for it (`useTabBarInset`).
 */
export function TabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { messages, counts, refresh } = useUnread();
  // the signed-in session, for the picture on the profile tab
  const { user } = useAuth();
  // the tab whose name is showing because it is being held
  const [held, setHeld] = useState<number | null>(null);

  const mirrored = dir.row === 'row-reverse';

  // moving between tabs is a good moment to make sure the badges are current
  useEffect(() => {
    refresh({ soon: true });
  }, [state.index, refresh]);

  const ink = colors.textPrimary;

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.barFill, borderTopColor: colors.separator, paddingBottom: insets.bottom },
      ]}
    >
      <View
        style={[styles.row, { flexDirection: dir.row }]}
        accessibilityRole="tablist"
      >
        {state.routes.map((route, i) => {
          const tab = TABS.find((x) => x.name === route.name);
          const name = (tab?.name ?? route.name) as TabName;
          const full = tab ? t(tab.labelKey) : route.name;
          const focused = state.index === i;
          const badge = name === 'Messages' ? unreadBadge(messages) : null;
          const dot = name === 'Profile' && counts.gifts > 0;
          // …and a screen reader gets the whole name, and what is waiting
          const spoken = badge
            ? t('nav.tabUnread', { tab: full, count: messages })
            : dot
              ? t('nav.tabWaiting', { tab: full })
              : full;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              haptic('select');
              navigation.navigate(route.name, route.params);
            }
          };
          const onLongPress = () => {
            // the hold took: a knock, as a held message gets, not the tick of a choice
            haptic('tap');
            setHeld(i);
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };
          return (
            <TabButton
              key={route.key}
              name={name}
              spoken={spoken}
              focused={focused}
              peek={held === i ? full : null}
              reduceMotion={reduceMotion}
              onPress={onPress}
              onLongPress={onLongPress}
              onRelease={() => setHeld((h) => (h === i ? null : h))}
            >
              {name === 'Profile' && user ? (
                /*
                  Your own face on your own tab: every other tab is a glyph for
                  a place, and this one is a person. The photo comes off the
                  session that is already loaded, so it costs no request;
                  without one it is your coloured initials.
                */
                <View style={[styles.ring, { borderColor: focused ? ink : 'transparent' }]}>
                  <InitialsAvatar
                    name={user.username}
                    id={user.id}
                    size={AVATAR}
                    photoUrl={user.profilePhotoUrl ?? undefined}
                    textStyle={styles.avatarText}
                  />
                </View>
              ) : (
                <Icon name={(focused ? tab?.activeIcon : tab?.icon) ?? 'home'} size={GLYPH} color={ink} />
              )}
              {badge ? (
                <View
                  style={[styles.badge, mirrored ? styles.badgeMirrored : null, { backgroundColor: colors.goldText, borderColor: colors.barFill }]}
                  pointerEvents="none"
                >
                  <Text style={[styles.badgeText, { color: colors.textOnPrimary }]} maxFontSizeMultiplier={1.2}>
                    {badge}
                  </Text>
                </View>
              ) : dot ? (
                <View
                  style={[styles.dot, mirrored ? styles.dotMirrored : null, { backgroundColor: colors.goldText, borderColor: colors.barFill }]}
                  pointerEvents="none"
                  testID="tab-Profile-dot"
                />
              ) : null}
            </TabButton>
          );
        })}
      </View>
    </View>
  );
}

/** One tab: the whole fifth of the bar is the target, and it sinks while held. */
function TabButton({
  name,
  spoken,
  focused,
  peek,
  reduceMotion,
  onPress,
  onLongPress,
  onRelease,
  children,
}: {
  name: TabName;
  spoken: string;
  focused: boolean;
  /** the tab's name, shown above it while it is held */
  peek: string | null;
  reduceMotion: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onRelease: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;
  // down without a bounce, back with the little one Apple gives a release
  const press = (toValue: number) => {
    if (reduceMotion) return;
    springTo(scale, toValue, toValue === 1 ? 'release' : 'standard').start();
  };
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      onPressIn={() => press(PRESSED_SCALE)}
      onPressOut={() => {
        press(1);
        onRelease();
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={spoken}
      testID={`tab-${name}`}
      style={styles.item}
    >
      <Animated.View style={[styles.glyph, { transform: [{ scale }] }]}>{children}</Animated.View>
      {peek ? <Peek text={peek} /> : null}
    </Pressable>
  );
}

/** A tab's name in a small bubble over it, as the system shows a bar item to somebody using large text. */
function Peek({ text }: { text: string }): React.JSX.Element {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={styles.peek}>
      <View style={[styles.peekBubble, { backgroundColor: colors.textPrimary }]}>
        <Text style={[styles.peekText, { color: colors.background }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // over every screen: last in the tree, and raised for Android, where
  // elevation rather than order decides what draws on top
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: { height: TAB_BAR_HEIGHT, alignItems: 'stretch' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  glyph: { width: GLYPH + 6, height: GLYPH + 6, alignItems: 'center', justifyContent: 'center' },
  // the ring sits round the picture with a hairline of air between them
  ring: {
    width: AVATAR + 6,
    height: AVATAR + 6,
    borderRadius: (AVATAR + 6) / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // the initials inside a small avatar: the smallest size text is drawn at, and two letters still fit
  avatarText: { fontSize: 11 },
  badge: {
    position: 'absolute',
    top: -2,
    left: 18,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // over the glyph's leading shoulder in a mirrored bar, as the platform puts it
  badgeMirrored: { left: undefined, right: 18 },
  badgeText: { fontSize: typography.ios.tabLabel, fontWeight: typography.weights.bold, lineHeight: 13 },
  dot: { position: 'absolute', top: 1, right: 0, width: 10, height: 10, borderRadius: radii.pill, borderWidth: 2 },
  dotMirrored: { right: undefined, left: 0 },
  // centred over the tab, and free to be wider than it: a long name is not clipped to a fifth of the bar
  peek: { position: 'absolute', bottom: TAB_BAR_HEIGHT + spacing.xs, left: -60, right: -60, alignItems: 'center' },
  peekBubble: { paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 1, borderRadius: radii.sm, maxWidth: 160 },
  peekText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.semibold },
});
