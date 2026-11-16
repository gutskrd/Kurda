import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { fontScaleCap, radii, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { unreadBadge } from '../notifications/inbox';
import { useUnread } from '../messages/unread';
import { haptic } from '../feedback/haptics';
import { springTo, usePressScale } from '../theme/animate';
import { TAB_BAR_HEIGHT, TAB_BAR_SIDE, tabBarLift, useKeyboardShown } from './tabBarLayout';
import { TABS, type TabName } from './tabs';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useAuth } from '../auth/AuthContext';
import { floating } from '../theme/floating';

/** The glyphs: big enough to hit and to read at a glance, with room under them for the tab's word. */
const GLYPH = 24;
/** Your picture on the Profile tab, a little smaller than the glyphs so its ring fits the same box. */
const AVATAR = 22;
/** The room between the bar's edge and the tabs, which is the air round the capsule behind the tab you are on. */
const PAD = 6;

/**
 * The tab bar: four places in one rounded bar that floats over the bottom of
 * the page, each an icon with its word under it.
 *
 * It floats, clear of the screen's edges, so the page is seen to carry on
 * under and round it and the bar reads as something to hold rather than as
 * the end of the screen. It is solid: nothing shows through between the
 * icons. Each tab screen leaves room for it under its last row
 * (`useTabBarInset`).
 *
 * Every tab says what it is. The bar drew the icons alone for a while, with
 * the name shown only while a tab was held, and a row of glyphs asks to be
 * learnt before it can be used: an open book and a paper plane mean Learn
 * and Messages only to somebody who already knows. A word under each is read
 * at once, in the reader's own language.
 *
 * The tab you are on is told three ways, none of them colour alone: its
 * glyph is drawn solid where the others are in outline, its word is a step
 * heavier, and a soft capsule sits behind it; all three are in the app's
 * violet, the colour of whatever is chosen. The
 * capsule slides along the bar to the tab chosen, so the change of tab is
 * seen moving, not only found. That is all that moves: the bar is the most
 * used control there is, and what is used all day arrives and stops. A tab
 * gives a little under the finger, as every button in the app does, and
 * moving to another gives the light tick of a selection. Somebody who has
 * asked for less motion gets neither the give nor the slide: the capsule is
 * simply behind the tab they are on.
 *
 * Your own picture is the Profile tab, ringed while you are on it.
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
 * It is last in the tree, with a z-index and, for Android, where elevation
 * decides what draws on top, an elevation above anything a screen raises.
 * The strip either side of it and under it lets touches through to the page.
 *
 * While the keyboard is up the bar is put away. On Android the window
 * shrinks to make room for the keys, and a bar that floats over the bottom
 * of the window would ride up with it and sit over the list being filtered,
 * just above the keys, where a thumb aiming for a letter finds a tab.
 */
export function TabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { messages, counts, refresh } = useUnread();
  // the signed-in session, for the picture on the profile tab
  const { user } = useAuth();

  const mirrored = dir.row === 'row-reverse';
  const typing = useKeyboardShown();

  // moving between tabs is a good moment to make sure the badges are current
  useEffect(() => {
    refresh({ soon: true });
  }, [state.index, refresh]);

  /*
   * The capsule behind the tab you are on: one shape, a tab wide, moved
   * along the bar on a transform. The row's width is measured once it is
   * laid out; until then there is nothing to place it by and it is not
   * drawn. It arrives where it belongs with no slide the first time, and
   * slides there on the interface's own spring after that (no bounce, there
   * within 300 ms) — straight there under Reduce Motion.
   */
  const [rowWidth, setRowWidth] = useState(0);
  const slot = rowWidth > 0 ? rowWidth / state.routes.length : 0;
  // counted from the left whichever way the tabs run
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
      <View style={[styles.bar, floating.raised, { backgroundColor: colors.barFill, shadowColor: colors.softShadow }]}>
        <View
          style={[styles.row, { flexDirection: dir.row }]}
          accessibilityRole="tablist"
          onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}
        >
          {slot > 0 ? (
            <Animated.View
              pointerEvents="none"
              testID="tab-pill"
              // a faint wash of the violet the chosen tab is written in, so the place you are on is one thing: its capsule, glyph and word
              style={[styles.capsule, { width: slot, backgroundColor: `${colors.primary}1F`, transform: [{ translateX: capsuleX }] }]}
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
            // a screen reader gets the name, and what is waiting
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
            return (
              <TabButton
                key={route.key}
                name={name}
                word={full}
                spoken={spoken}
                focused={focused}
                ink={ink}
                onPress={onPress}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              >
                {name === 'Profile' && user ? (
                  /*
                    Your own face on your own tab: every other tab is a glyph for
                    a place, and this one is a person. The photo comes off the
                    session that is already loaded, so it costs no request;
                    without one it is your coloured initials.
                  */
                  <View style={[styles.ring, { borderColor: focused ? colors.primary : 'transparent' }]}>
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

/** One tab: its whole share of the bar is the target; its glyph and word give under the finger as any button does (`usePressScale`), and do nothing more. */
function TabButton({
  name,
  word,
  spoken,
  focused,
  ink,
  onPress,
  onLongPress,
  children,
}: {
  name: TabName;
  /** the tab's name, under its glyph */
  word: string;
  spoken: string;
  focused: boolean;
  ink: string;
  onPress: () => void;
  onLongPress: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  // still under Reduce Motion, where the tab's own change of shape is the answer
  const press = usePressScale();
  return (
    <Pressable
      // the tab bar is outside anything that scrolls, so it answers the moment it is touched
      pressDelay={0}
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
          // a word in a share of the bar that cannot grow with it
          maxFontSizeMultiplier={fontScaleCap.fixedBox}
        >
          {word}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // over every screen: last in the tree, and raised for Android, where
  // elevation rather than order decides what draws on top
  dock: { position: 'absolute', left: TAB_BAR_SIDE, right: TAB_BAR_SIDE, zIndex: 10, elevation: 12 },
  bar: { height: TAB_BAR_HEIGHT, borderRadius: radii.pill, padding: PAD },
  row: { flex: 1, alignItems: 'stretch' },
  // behind the tabs, free to travel along the bar, and as tall as the row
  capsule: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radii.pill },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  face: { alignItems: 'center', gap: 3 },
  glyph: { width: GLYPH + 4, height: GLYPH + 2, alignItems: 'center', justifyContent: 'center' },
  word: { fontSize: typography.ios.tabLabel, lineHeight: 13, textAlign: 'center' },
  // the ring sits round the picture with a hairline of air between them
  ring: {
    width: AVATAR + 5,
    height: AVATAR + 5,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // the initials inside a small avatar: the smallest size text is drawn at, and two letters still fit
  avatarText: { fontSize: 11 },
  badge: {
    position: 'absolute',
    top: -5,
    left: 16,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // over the glyph's leading shoulder in a mirrored bar, as the platform puts it
  badgeMirrored: { left: undefined, right: 16 },
  badgeText: { fontSize: typography.ios.tabLabel, fontWeight: typography.weights.bold, lineHeight: 13 },
  dot: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: radii.pill, borderWidth: 2 },
  dotMirrored: { right: undefined, left: -2 },
});
