import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';

import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { fitted, radii, typography } from '../theme/tokens';
import { duration } from '../theme/motion';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { useUnread } from '../messages/unread';
import { haptic } from '../feedback/haptics';
import { springTo, timing, usePressScale } from '../theme/animate';
import { TAB_BAR_SCROLL, TAB_CAPSULE } from '@kurda/shared';
import { TAB_BAR_HEIGHT, TAB_BAR_SIDE, tabBarLift, useKeyboardShown } from './tabBarLayout';
import { resetTabBar, useTabBarCompact } from './tabBarScroll';
import { TABS, type TabName } from './tabs';
import { Avatar, ownAvatarUrl } from '../profile/Avatar';
import { useAuth } from '../auth/AuthContext';
import { GlassFill, useGlassShape } from '../theme/LiquidGlass';

/** The glyphs, and your picture, as large as a glyph within its ring. */
const GLYPH = 24;
const AVATAR = 22;
/** The ring round your picture on its tab, in the chosen colour. */
const RING = 2;
const RING_GAP = 0;
/** The bar's padding around the tabs, which is the air round the capsule behind the chosen tab. */
const PAD = 5;
/** A tab's name under its glyph: the interface's text size shrunk to fit a bar that cannot grow, as on the website. */
const LABEL_FIT = 0.6875;
/** How much of the capsule's colour shows: a darker glass inset in the bar, by night and by day. */
const CAPSULE_FILL = { dark: 0.34, light: 0.07 } as const;

/**
 * The tab bar: four places in one pill of neutral glass floating over the page's foot (LiquidGlass.tsx), each a filled
 * glyph with its name under it (screens leave room with `useTabBarInset`). The chosen tab wears the chosen colour on its
 * glyph and name, cross-fading as it changes, or a ring round your picture, over a darker capsule of glass that
 * stretches as it slides to it, so colour is never the only sign. Something new waiting (unread messages and requests, a
 * gift to unwrap) is a small red dot at the glyph's foot, said in words to a screen reader; tapping the current tab
 * scrolls it to the top (`useScrollToTop`).
 *
 * While the page scrolls down the bar shrinks out of the way and comes back as it scrolls up (tabBarScroll.ts); under
 * Reduce Motion it stays its size, the capsule moves without sliding and the colour changes at once. It is last in the
 * tree with a z-index and an Android elevation above anything a screen raises, and is hidden while the keyboard is up,
 * since on Android the window shrinks and the bar would ride up over the list.
 */
export function TabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element | null {
  const { colors, scheme } = useTheme();
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

  // Moving between tabs is a good moment to refresh the badges, and the new page starts with the bar full size.
  useEffect(() => {
    refresh({ soon: true });
    resetTabBar();
  }, [state.index, refresh]);

  const compact = useTabBarCompact() && !reduceMotion;
  const size = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const run = springTo(size, compact ? TAB_BAR_SCROLL.compactScale : 1, 'arrive');
    run.start();
    return () => run.stop();
  }, [compact, size]);

  /*
   * The capsule behind the chosen tab, by its two ends (shared `TAB_CAPSULE`). Moving to another tab, the end in front
   * springs there first, a little past it, and the one behind follows, so the capsule stretches toward the tab and
   * settles round it, lifting larger and lighter on the way. It is drawn once the row has been measured and arrives
   * without a slide the first time.
   */
  const [row, setRow] = useState({ width: 0, height: 0 });
  const slot = row.width > 0 ? row.width / state.routes.length : 0;
  // Counted from the left whichever way the tabs run.
  const place = mirrored ? state.routes.length - 1 - state.index : state.index;
  const start = useRef(new Animated.Value(0)).current;
  const end = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const placed = useRef<number | null>(null);
  useEffect(() => {
    if (slot <= 0) return;
    const from = place * slot;
    const to = from + slot;
    const was = placed.current;
    placed.current = place;
    if (reduceMotion || was === null || was === place) {
      start.setValue(from);
      end.setValue(to);
      lift.setValue(0);
      return;
    }
    const forward = place > was;
    const rise = Math.round(TAB_CAPSULE.liftMs / 3);
    const run = Animated.parallel([
      springTo(forward ? end : start, forward ? to : from, 'tabLead'),
      springTo(forward ? start : end, forward ? from : to, 'tabFollow'),
      Animated.sequence([timing(lift, 1, rise), timing(lift, 0, TAB_CAPSULE.liftMs - rise)]),
    ]);
    run.start();
    return () => run.stop();
  }, [place, slot, reduceMotion, start, end, lift]);

  if (typing) return null;

  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: tabBarLift(insets.bottom) }]}>
      <Animated.View style={[styles.bar, ...glass, { transform: [{ scale: size }] }]} testID="tab-bar">
        <GlassFill lift="raised" />
        <View
          style={[styles.row, { flexDirection: dir.row }]}
          accessibilityRole="tablist"
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setRow((had) => (had.width === width && had.height === height ? had : { width, height }));
          }}
        >
          {slot > 0 && row.height > 0 ? (
            <Capsule start={start} end={end} lift={lift} width={row.width} slot={slot} height={row.height} ink={colors.tabCapsule} fill={CAPSULE_FILL[scheme]} />
          ) : null}
          {state.routes.map((route, i) => {
            const tab = TABS.find((x) => x.name === route.name);
            const name = (tab?.name ?? route.name) as TabName;
            const full = tab ? t(tab.labelKey) : route.name;
            const focused = state.index === i;
            const unread = name === 'Messages' && messages > 0;
            const gift = name === 'Profile' && counts.gifts > 0;
            // A screen reader gets the name and what is waiting.
            const spoken = unread ? t('nav.tabUnread', { tab: full, count: messages }) : gift ? t('nav.tabWaiting', { tab: full }) : full;
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
                spoken={spoken}
                focused={focused}
                onPress={onPress}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              >
                <TabFace focused={focused} label={full} reduce={reduceMotion} rest={colors.textPrimary} chosen={colors.tabChosen}>
                  {(color) =>
                    name === 'Profile' && user ? (
                      // Your own face on your own tab, from the session already loaded so it costs no request.
                      <View style={[styles.ring, { borderColor: color === colors.tabChosen ? color : 'transparent' }]}>
                        <Avatar name={user.username} size={AVATAR} photoUrl={ownAvatarUrl(user)} />
                      </View>
                    ) : (
                      <Icon name={tab?.activeIcon ?? tab?.icon ?? 'home'} size={GLYPH} color={color} />
                    )
                  }
                </TabFace>
                {unread || gift ? (
                  <View
                    style={[
                      styles.dot,
                      name === 'Profile' ? styles.dotOnFace : null,
                      mirrored ? styles.dotMirrored : null,
                      { backgroundColor: colors.notice, borderColor: colors.barFill },
                    ]}
                    pointerEvents="none"
                    testID={`tab-${name}-dot`}
                  />
                ) : null}
              </TabButton>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

/**
 * A tab's glyph over its name, drawn twice, at rest and chosen, the chosen one fading in over the other as the tab is
 * chosen and out as it is left, so the colour cross-fades on the native driver; at once under Reduce Motion.
 */
function TabFace({
  focused,
  label,
  reduce,
  rest,
  chosen,
  children,
}: {
  focused: boolean;
  label: string;
  reduce: boolean;
  rest: string;
  chosen: string;
  children: (color: string) => React.ReactNode;
}): React.JSX.Element {
  const shown = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      shown.setValue(focused ? 1 : 0);
      return;
    }
    const run = timing(shown, focused ? 1 : 0, duration.base);
    run.start();
    return () => run.stop();
  }, [focused, reduce, shown]);
  const face = (color: string) => (
    <>
      <View style={styles.glyph}>{children(color)}</View>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </>
  );
  return (
    // Drawn, not said: the tab's own name says it once.
    <View style={styles.face} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      <Animated.View style={[styles.layer, { opacity: Animated.subtract(1, shown) }]}>{face(rest)}</Animated.View>
      <Animated.View style={[styles.layer, styles.over, { opacity: shown }]}>{face(chosen)}</Animated.View>
    </View>
  );
}

/**
 * The capsule, drawn as two round ends and the span between them so its ends stay round however far it stretches.
 * The pieces are solid ink under one shared opacity, so where they overlap the tint does not double. Its ends stop at
 * the bar's, so running past an end tab squeezes it against the wall instead of out of the bar.
 */
function Capsule({
  start,
  end,
  lift,
  width,
  slot,
  height,
  ink,
  fill,
}: {
  start: Animated.Value;
  end: Animated.Value;
  lift: Animated.Value;
  width: number;
  slot: number;
  height: number;
  ink: string;
  fill: number;
}): React.JSX.Element {
  const pieces = useMemo(() => {
    const wall = { inputRange: [0, width], outputRange: [0, width], extrapolate: 'clamp' as const };
    const left = start.interpolate(wall);
    const right = end.interpolate(wall);
    const span = Animated.add(Animated.subtract(right, left), new Animated.Value(-height));
    return {
      left,
      endCap: Animated.add(right, new Animated.Value(-height)),
      // The span is `slot` wide as drawn, scaled about its middle to reach from one end's centre to the other's.
      spanX: Animated.add(Animated.multiply(Animated.add(left, right), 0.5), new Animated.Value(-slot / 2)),
      spanScale: span.interpolate({ inputRange: [0, slot], outputRange: [0, 1], extrapolateLeft: 'clamp' }),
      grow: lift.interpolate({ inputRange: [0, 1], outputRange: [1, TAB_CAPSULE.liftScale] }),
      tint: lift.interpolate({ inputRange: [0, 1], outputRange: [fill, fill * TAB_CAPSULE.liftFill] }),
    };
  }, [start, end, lift, width, slot, height, fill]);
  const piece = { height, backgroundColor: ink };
  const cap = { width: height, borderRadius: radii.pill };
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: pieces.tint }]} needsOffscreenAlphaCompositing testID="tab-pill">
      <Animated.View style={[styles.piece, piece, cap, { transform: [{ translateX: pieces.left }, { scale: pieces.grow }] }]} />
      <Animated.View style={[styles.piece, piece, cap, { transform: [{ translateX: pieces.endCap }, { scale: pieces.grow }] }]} />
      <Animated.View style={[styles.piece, piece, { width: slot, transform: [{ translateX: pieces.spanX }, { scaleX: pieces.spanScale }, { scaleY: pieces.grow }] }]} />
    </Animated.View>
  );
}

/**
 * One tab: its whole share of the bar is the target, and its glyph gives under the finger (`usePressScale`). Every
 * tab also reaches across the bar's padding to its top and bottom edges, and the end tabs to its rounded ends, so no
 * part of the bar is dead.
 */
function TabButton({
  name,
  leftmost,
  rightmost,
  spoken,
  focused,
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
  spoken: string;
  focused: boolean;
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
      <Animated.View style={[styles.press, { transform: [{ scale: press.scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

const FACE = AVATAR + 2 * (RING + RING_GAP);

const styles = StyleSheet.create({
  // Over every screen: last in the tree, and raised for Android, where elevation rather than order decides what draws
  // on top.
  dock: { position: 'absolute', left: TAB_BAR_SIDE, right: TAB_BAR_SIDE, zIndex: 10, elevation: 12 },
  bar: { height: TAB_BAR_HEIGHT, borderRadius: radii.pill, padding: PAD },
  row: { flex: 1, alignItems: 'stretch' },
  // The capsule's pieces, from the row's left edge, as tall as the row.
  piece: { position: 'absolute', left: 0, top: 0 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  // The pressed part: the glyph and its name together, with the dot over them.
  press: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  // A tab's two faces, at rest and chosen, one over the other.
  face: { alignSelf: 'stretch', alignItems: 'center' },
  layer: { alignItems: 'center', gap: 1 },
  over: { position: 'absolute', top: 0, left: 0, right: 0 },
  // One box for every glyph and for your picture in its ring, so the ring coming and going moves nothing.
  glyph: { width: FACE, height: FACE, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: fitted(typography.sizes.text, LABEL_FIT), lineHeight: 13, fontWeight: typography.weights.semibold, letterSpacing: 0.1 },
  ring: {
    width: FACE,
    height: FACE,
    borderRadius: radii.pill,
    borderWidth: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // At the glyph's foot on the trailing side, as phones put it, ringed in the bar's own fill so it sits on the glyph.
  dot: { position: 'absolute', top: FACE - 10, left: '50%', marginLeft: GLYPH / 2 - 7, width: 10, height: 10, borderRadius: radii.pill, borderWidth: 1.5 },
  // On your picture, at the edge of its ring.
  dotOnFace: { top: FACE - 9 },
  dotMirrored: { marginLeft: -GLYPH / 2 - 3 },
});
