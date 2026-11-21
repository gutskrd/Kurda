import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { fontScaleCap, radii, typography, wash } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { unreadBadge } from '../notifications/inbox';
import { useUnread } from '../messages/unread';
import { haptic } from '../feedback/haptics';
import { springTo, usePressScale } from '../theme/animate';
import { TAB_BAR_HEIGHT, TAB_BAR_SIDE, tabBarLift, useKeyboardShown } from './tabBarLayout';
import { TABS, type TabName } from './tabs';
import { Avatar, ownAvatarUrl } from '../profile/Avatar';
import { useAuth } from '../auth/AuthContext';
import { GlassFill, useGlassShape } from '../theme/LiquidGlass';

/** The glyphs: big enough to hit and to read at a glance, with room under them for the tab's word. */
const GLYPH = 24;
/** Your picture on the Profile tab, a little smaller than the glyphs so its ring fits the same box. */
const AVATAR = 22;
/** The bar's padding around the tabs, which is the air round the capsule behind the chosen tab. */
const PAD = 6;

/**
 * The tab bar: four places in one rounded bar of glass floating over the page's foot (LiquidGlass.tsx), each an icon with its word (screens
 * leave room with `useTabBarInset`). The chosen tab has a solid glyph, a heavier word and a sliding capsule, so colour
 * is never the only sign. Only Messages (unread messages and requests, 1–9 then "9+") and Profile (a dot for a gift to
 * unwrap) badge, both said in words to a screen reader; tapping the current tab scrolls it to the top
 * (`useScrollToTop`). It is last in the tree with a z-index and an Android elevation above anything a screen raises,
 * and is hidden while the keyboard is up, since on Android the window shrinks and the bar would ride up over the list.
 */
export function TabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { messages, counts, refresh } = useUnread();
  // The signed-in session, for the picture on the Profile tab.
  const { user } = useAuth();

  const mirrored = dir.row === 'row-reverse';
  const typing = useKeyboardShown();
  const glass = useGlassShape('raised');

  // Moving between tabs is a good moment to refresh the badges.
  useEffect(() => {
    refresh({ soon: true });
  }, [state.index, refresh]);

  /*
   * The capsule behind the chosen tab: one tab-wide shape moved along the bar on a transform. It is drawn once the row
   * has been measured, arrives without a slide the first time, and then slides on the interface spring (straight there
   * under Reduce Motion).
   */
  const [rowWidth, setRowWidth] = useState(0);
  const slot = rowWidth > 0 ? rowWidth / state.routes.length : 0;
  // Counted from the left whichever way the tabs run.
  const place = mirrored ? state.routes.length - 1 - state.index : state.index;
  const capsuleX = useRef(new Animated.Value(0)).current;
  const capsulePlaced = useRef(false);
  useEffect(() => {
    if (slot <= 0) return;
    const to = place * slot;
    if (reduceMotion || !capsulePlaced.current) {
      capsulePlaced.current = true;
      capsuleX.setValue(to);
      return;
    }
    const slide = springTo(capsuleX, to, 'chrome');
    slide.start();
    return () => slide.stop();
  }, [place, slot, reduceMotion, capsuleX]);

  if (typing) return null;

  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: tabBarLift(insets.bottom) }]}>
      <View style={[styles.bar, ...glass]}>
        <GlassFill lift="raised" />
        <View
          style={[styles.row, { flexDirection: dir.row }]}
          accessibilityRole="tablist"
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
        >
          {slot > 0 ? (
            <Animated.View
              pointerEvents="none"
              testID="tab-pill"
              // A faint wash of the violet the chosen tab is written in, so capsule, glyph and word read as one.
              style={[styles.capsule, { width: slot, backgroundColor: wash(colors.primary), transform: [{ translateX: capsuleX }] }]}
            />
          ) : null}
          {state.routes.map((route, i) => {
            const tab = TABS.find((x) => x.name === route.name);
            const name = (tab?.name ?? route.name) as TabName;
            const full = tab ? t(tab.labelKey) : route.name;
            const focused = state.index === i;
            const ink = focused ? colors.primary : colors.textSecondary;
            const badge = name === 'Messages' ? unreadBadge(messages) : null;
            const dot = name === 'Profile' && counts.gifts > 0;
            // A screen reader gets the name and what is waiting.
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
            // Counted from the left whichever way the tabs run, as the capsule is.
            const at = mirrored ? state.routes.length - 1 - i : i;
            return (
              <TabButton
                key={route.key}
                name={name}
                leftmost={at === 0}
                rightmost={at === state.routes.length - 1}
                word={full}
                spoken={spoken}
                focused={focused}
                ink={ink}
                onPress={onPress}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              >
                {name === 'Profile' && user ? (
                  // Your own face on your own tab, from the session already loaded so it costs no request.
                  <View style={[styles.ring, { borderColor: focused ? colors.primary : 'transparent' }]}>
                    <Avatar name={user.username} size={AVATAR} photoUrl={ownAvatarUrl(user)} />
                  </View>
                ) : (
                  <Icon name={(focused ? tab?.activeIcon : tab?.icon) ?? 'home'} size={GLYPH} color={ink} />
                )}
                {badge ? (
                  <View
                    style={[styles.badge, mirrored ? styles.badgeMirrored : null, { backgroundColor: colors.primary, borderColor: colors.barFill }]}
                    pointerEvents="none"
                  >
                    <Text style={[styles.badgeText, { color: colors.textOnPrimary }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
                      {badge}
                    </Text>
                  </View>
                ) : dot ? (
                  <View
                    style={[styles.dot, mirrored ? styles.dotMirrored : null, { backgroundColor: colors.primary, borderColor: colors.barFill }]}
                    pointerEvents="none"
                    testID="tab-Profile-dot"
                  />
                ) : null}
              </TabButton>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/**
 * One tab: its whole share of the bar is the target, and its glyph and word give under the finger (`usePressScale`).
 * Every tab also reaches across the bar's padding to its top and bottom edges, and the end tabs to its rounded ends, so
 * no part of the bar is dead.
 */
function TabButton({
  name,
  leftmost,
  rightmost,
  word,
  spoken,
  focused,
  ink,
  onPress,
  onLongPress,
  children,
}: {
  name: TabName;
  /**
   * Whether this tab is at the bar's left or right end as drawn, which is reversed from the tab order in right-to-left
   * languages.
   */
  leftmost: boolean;
  rightmost: boolean;
  /** The tab's name, under its glyph. */
  word: string;
  spoken: string;
  focused: boolean;
  ink: string;
  onPress: () => void;
  onLongPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  // Still under Reduce Motion, where the tab's own change of shape is the feedback.
  const press = usePressScale();
  return (
    <Pressable
      // The tab bar is outside anything that scrolls, so it answers the moment it is touched.
      pressDelay={0}
      hitSlop={{ top: PAD, bottom: PAD, left: leftmost ? PAD : 0, right: rightmost ? PAD : 0 }}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={spoken}
      testID={`tab-${name}`}
      style={styles.item}
    >
      <Animated.View style={[styles.face, { transform: [{ scale: press.scale }] }]}>
        <View style={styles.glyph}>{children}</View>
        <Text
          style={[styles.word, { color: ink, fontWeight: focused ? typography.weights.semibold : typography.weights.medium }]}
          numberOfLines={1}
          // A word in a share of the bar that cannot grow with it.
          maxFontSizeMultiplier={fontScaleCap.fixedBox}
        >
          {word}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Over every screen: last in the tree, and raised for Android, where elevation rather than order decides what draws
  // on top.
  dock: { position: 'absolute', left: TAB_BAR_SIDE, right: TAB_BAR_SIDE, zIndex: 10, elevation: 12 },
  bar: { height: TAB_BAR_HEIGHT, borderRadius: radii.pill, padding: PAD },
  row: { flex: 1, alignItems: 'stretch' },
  // Behind the tabs, free to travel along the bar, as tall as the row.
  capsule: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radii.pill },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  face: { alignItems: 'center', gap: 3 },
  glyph: { width: GLYPH + 4, height: GLYPH + 2, alignItems: 'center', justifyContent: 'center' },
  word: { fontSize: typography.sizes.text, lineHeight: 20, textAlign: 'center' },
  // The ring sits round the picture with a hairline of air between them.
  ring: {
    width: AVATAR + 5,
    height: AVATAR + 5,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -8,
    left: 14,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 5,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Over the glyph's leading shoulder in a mirrored bar, as the platform puts it.
  badgeMirrored: { left: undefined, right: 16 },
  badgeText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold, lineHeight: 20 },
  dot: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: radii.pill, borderWidth: 2 },
  dotMirrored: { right: undefined, left: -2 },
});
