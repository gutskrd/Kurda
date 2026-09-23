import { useEffect, useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../theme/Icon';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
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
  const { t } = useI18n();
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
  /*
   * The same glass the cards are made of.
   *
   * This used to paint its own two colours, and in dark mode the fill was
   * `rgba(14,14,16,0.55)` — a darker layer over an already dark screen, where
   * the palette's own `glassFill` is `rgba(255,255,255,0.05)`, a lighter one.
   * A pane darker than what is behind it does not read as glass; it reads as
   * a bar. The blur was doing its work and nothing was showing it off.
   */
  const barBg = colors.glassFill;
  const border = colors.glassBorder;
  /**
   * The bubble under the active tab.
   *
   * Brighter than the pane it sits in, and with an edge, so it reads as a
   * lozenge resting in the glass rather than a patch where the glass happens
   * to be lighter. It was 0.10 white on a pane that was darker than the
   * screen — a difference you had to look for.
   */
  const pillColor = dark ? 'rgba(255,255,255,0.13)' : 'rgba(20,20,20,0.07)';
  const pillEdge = dark ? 'rgba(255,255,255,0.10)' : 'rgba(20,20,20,0.05)';
  const activeText = colors.primary; // brand near-black / near-white, full strength
  const inactiveText = colors.textSecondary;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { left: TAB_BAR_MARGIN, right: TAB_BAR_MARGIN, bottom: Math.max(insets.bottom, TAB_BAR_MARGIN) }]}
    >
      <View style={[styles.island, { shadowColor: dark ? '#000000' : '#3E5147' }]}>
        <View style={styles.clip}>
          <BlurView intensity={colors.blurStrong} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, styles.tint, { backgroundColor: barBg, borderColor: border }]} />
          {/*
            The catch-light, which is what makes a pane look like one. Runs from
            the top-left corner and fades out before the middle, the same way
            `GlassCard`'s does, so the island and the cards above it are lit
            from the same place.
          */}
          <LinearGradient
            colors={[colors.glassHighlight, 'transparent']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.sheen, { pointerEvents: 'none' }]}
          />

          <View style={styles.row} onLayout={(e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width)}>
            {tabWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pill,
                  { width: tabWidth - PILL_INSET_X * 2, backgroundColor: pillColor, borderColor: pillEdge, transform: [{ translateX }] },
                ]}
              />
            ) : null}

            {state.routes.map((route, i) => {
              const tab = TABS.find((x) => x.name === route.name);
              // the bar speaks the reader's language like everything behind it
              const label = tab ? t(tab.labelKey) : route.name;
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
                  accessibilityLabel={label}
                  style={styles.item}
                >
                  <Icon name={tab?.icon ?? 'home'} size={22} color={color} />
                  <Text numberOfLines={1} style={[styles.label, { color, fontWeight: focused ? '700' : '500' }]}>
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  // half the island, so the light falls off before the middle
  sheen: { bottom: undefined, height: TAB_BAR_HEIGHT / 2, opacity: 0.5 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 4, paddingHorizontal: 2 },
  label: { fontSize: typography.ios.tabLabel, letterSpacing: 0.1 },
});
