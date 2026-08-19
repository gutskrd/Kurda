import { useEffect, useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../theme/Icon';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { TAB_BAR_HEIGHT, TAB_BAR_MARGIN } from './tabBarLayout';
import { TABS } from './tabs';

const PILL_INSET_Y = 8;
const PILL_INSET_X = 6;

/**
 * Floating glass tab bar (KUR-266/268). A frosted island with an icon + label
 * per tab and a highlight pill that slides to the active tab when you switch —
 * modelled on the SCRL reference. Deliberately monochrome (not the green brand):
 * white-dominant frosted glass in light mode with a near-black active pill, and
 * black-dominant glass in dark mode with a near-white pill.
 */
export function GlassTabBar({ state, navigation }: BottomTabBarProps): React.JSX.Element {
  const { scheme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [barWidth, setBarWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const count = state.routes.length;
  const tabWidth = barWidth > 0 ? barWidth / count : 0;

  useEffect(() => {
    const to = state.index * tabWidth;
    if (reduceMotion || tabWidth === 0) {
      translateX.setValue(to);
      return;
    }
    Animated.spring(translateX, { toValue: to, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
  }, [state.index, tabWidth, reduceMotion, translateX]);

  const dark = scheme === 'dark';
  // Translucent enough that the content behind stays recognizable (the strong blur
  // does the legibility work); no opaque block, no bright frost ring.
  const barBg = dark ? 'rgba(14,14,16,0.55)' : 'rgba(255,255,255,0.58)';
  const border = colors.glassBorder;
  // The active state is a soft, translucent pill — not a high-contrast solid block.
  const pillColor = dark ? 'rgba(255,255,255,0.10)' : 'rgba(20,20,20,0.055)';
  const activeText = colors.primary; // brand near-black / near-white, full strength
  const inactiveText = colors.textSecondary;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { left: TAB_BAR_MARGIN + 8, right: TAB_BAR_MARGIN + 8, bottom: insets.bottom + TAB_BAR_MARGIN }]}
    >
      <View style={[styles.island, { shadowColor: dark ? '#000000' : '#3E5147' }]}>
        <View style={styles.clip}>
          <BlurView intensity={colors.blurStrong} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.tint, { backgroundColor: barBg, borderColor: border }]} />

          <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}>
            {tabWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.pill, { width: tabWidth - PILL_INSET_X * 2, backgroundColor: pillColor, transform: [{ translateX }] }]}
              />
            ) : null}

            {state.routes.map((route, i) => {
              const tab = TABS.find((t) => t.name === route.name);
              const focused = state.index === i;
              const color = focused ? activeText : inactiveText;
              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              };
              return (
                <Pressable
                  key={route.key}
                  onPress={onPress}
                  accessibilityRole="button"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={tab?.title}
                  style={styles.item}
                >
                  <Icon name={(tab?.icon ?? 'home') as IconName} size={22} color={color} />
                  <Text numberOfLines={1} style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]}>
                    {tab?.title}
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
  wrap: { position: 'absolute' },
  island: {
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    // a soft spatial lift, not a hard drop shadow
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 22,
    elevation: 10,
  },
  clip: { flex: 1, borderRadius: TAB_BAR_HEIGHT / 2, overflow: 'hidden' },
  tint: { borderRadius: TAB_BAR_HEIGHT / 2, borderWidth: StyleSheet.hairlineWidth },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  pill: {
    position: 'absolute',
    left: PILL_INSET_X,
    top: PILL_INSET_Y,
    bottom: PILL_INSET_Y,
    borderRadius: (TAB_BAR_HEIGHT - PILL_INSET_Y * 2) / 2,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 2 },
  label: { fontSize: 11, letterSpacing: 0.1 },
});
