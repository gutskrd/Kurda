import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../theme/Icon';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { radii, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { unreadBadge } from '../notifications/inbox';
import { useUnread } from '../messages/unread';
import { TAB_BAR_FADE, TAB_BAR_HEIGHT, TAB_BAR_MARGIN } from './tabBarLayout';
import { TABS, type TabName } from './tabs';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useAuth } from '../auth/AuthContext';

const PILL_INSET_Y = 8;
const PILL_INSET_X = 6;
/** How long the pill takes to reach a tab: a state change, so short and eased out. */
const SLIDE_MS = 220;

/**
 * The floating island bar (KUR-266/268): five equal slots, each an icon over a
 * label, and a soft pill behind the tab you are on that slides when you move.
 *
 * Labels stay. Somebody new to the app reads the words, not the glyphs, and a
 * child who has not learned that a paper plane means messages still knows the
 * word for it.
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
 * In Soranî and Arabic the bar is mirrored — Home on the right — with the pill
 * counted from that side, the same as every row on those screens.
 *
 * Nothing scrolls visibly under it. The island is solid, and behind it the
 * page fades to its own colour from a little above the island down to the
 * bottom edge, so a card or a line of text sliding down the screen dissolves
 * before it reaches the bar rather than showing round its edges and through
 * the gap beneath it. The whole layer sits above the screens — last in the
 * tree, with a z-index and, for Android, where elevation decides what draws
 * on top, an elevation above anything a screen raises.
 */
export function GlassTabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element {
  const { scheme, colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { messages, counts, refresh } = useUnread();
  const [barWidth, setBarWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const count = state.routes.length;
  const tabWidth = barWidth > 0 ? barWidth / count : 0;
  const mirrored = dir.row === 'row-reverse';
  const slot = mirrored ? count - 1 - state.index : state.index;

  useEffect(() => {
    const to = slot * tabWidth;
    if (reduceMotion || tabWidth === 0) {
      translateX.setValue(to);
      return;
    }
    Animated.timing(translateX, { toValue: to, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [slot, tabWidth, reduceMotion, translateX]);

  // moving between tabs is a good moment to make sure the badges are current
  useEffect(() => {
    refresh({ soon: true });
  }, [state.index, refresh]);

  const dark = scheme === 'dark';
  // the signed-in session, for the picture on the profile tab
  const { user } = useAuth();

  /**
   * The bubble under the active tab: a step brighter (or darker) than the
   * pane, so it reads as a lozenge resting in it.
   */
  const pillColor = dark ? 'rgba(255,255,255,0.12)' : 'rgba(17,17,17,0.07)';
  const activeText = colors.primary;
  const inactiveText = colors.textSecondary;

  const bottom = Math.max(insets.bottom, TAB_BAR_MARGIN);

  return (
    <View pointerEvents="box-none" style={[styles.layer, { height: bottom + TAB_BAR_HEIGHT + TAB_BAR_FADE }]}>
      <LinearGradient
        pointerEvents="none"
        // the page's own colour, from clear to solid: hex with an alpha of 00, not
        // 'transparent', which is clear black and greys the middle of the fade
        colors={[`${colors.background}00`, colors.background, colors.background]}
        locations={[0, 0.42, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          styles.island,
          { left: TAB_BAR_MARGIN, right: TAB_BAR_MARGIN, bottom, shadowColor: dark ? '#000000' : '#2B2F36', shadowOpacity: dark ? 0.4 : 0.12 },
        ]}
      >
        <View style={[styles.clip, { backgroundColor: colors.barFill }]}>
          <View
            style={[styles.row, { flexDirection: dir.row }]}
            onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}
            accessibilityRole="tablist"
          >
            {tabWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pill,
                  { width: tabWidth - PILL_INSET_X * 2, backgroundColor: pillColor, transform: [{ translateX }] },
                ]}
              />
            ) : null}

            {state.routes.map((route, i) => {
              const tab = TABS.find((x) => x.name === route.name);
              const name = (tab?.name ?? route.name) as TabName;
              // the bar speaks the reader's language like everything behind it,
              // and takes the shorter name where the screen has one
              const label = tab ? t(tab.shortLabelKey ?? tab.labelKey) : route.name;
              const full = tab ? t(tab.labelKey) : route.name;
              const focused = state.index === i;
              const color = focused ? activeText : inactiveText;
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
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
              };
              const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
              return (
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  onLongPress={onLongPress}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={spoken}
                  testID={`tab-${name}`}
                  style={styles.item}
                >
                  <View style={styles.glyph}>
                    {/*
                      Your own face on your own tab: every other tab is a glyph
                      for a place, and this one is a person. The photo comes
                      off the session that is already loaded, so it costs no
                      request; without one it is your coloured initials.
                    */}
                    {name === 'Profile' && user ? (
                      <InitialsAvatar
                        name={user.username}
                        id={user.id}
                        size={26}
                        photoUrl={user.profilePhotoUrl ?? undefined}
                        textStyle={styles.avatarText}
                        style={focused ? { borderWidth: 2, borderColor: activeText } : undefined}
                      />
                    ) : (
                      <Icon name={tab?.icon ?? 'home'} size={24} color={color} />
                    )}
                    {badge ? (
                      <View style={[styles.badge, { backgroundColor: colors.goldText }]} pointerEvents="none">
                        <Text style={[styles.badgeText, { color: colors.textOnPrimary }]} maxFontSizeMultiplier={1.2}>
                          {badge}
                        </Text>
                      </View>
                    ) : dot ? (
                      <View style={[styles.dot, { backgroundColor: colors.goldText }]} pointerEvents="none" testID="tab-Profile-dot" />
                    ) : null}
                  </View>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.3}
                    style={[styles.label, { color, fontWeight: focused ? typography.weights.semibold : typography.weights.medium }]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // above every screen: last in the tree, and raised for Android, where
  // elevation rather than order decides what draws on top
  layer: { position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, elevation: 12 },
  island: {
    position: 'absolute',
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    // it floats, so it is the one thing on a tab with a real shadow
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 10,
  },
  clip: { flex: 1, borderRadius: TAB_BAR_HEIGHT / 2, overflow: 'hidden' },
  row: { flex: 1, alignItems: 'center' },
  pill: {
    position: 'absolute',
    left: PILL_INSET_X,
    top: PILL_INSET_Y,
    bottom: PILL_INSET_Y,
    borderRadius: (TAB_BAR_HEIGHT - PILL_INSET_Y * 2) / 2,
  },
  item: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  glyph: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: typography.ios.tabLabel },
  // the initials inside a 26pt avatar, which is an icon's worth of room
  avatarText: { fontSize: 10 },
  badge: {
    position: 'absolute',
    top: -5,
    left: 15,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: typography.ios.tabLabel, fontWeight: typography.weights.bold },
  dot: { position: 'absolute', top: -1, right: -2, width: 10, height: 10, borderRadius: radii.pill },
});
