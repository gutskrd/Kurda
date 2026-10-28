import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { layout, spacing, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';

/** How long, in points of scrolling, the bar's title takes to fade in as the large one goes under it. */
const SWAP = 12;

/** How much bigger the large title grows when the list is pulled down past its top, at most, as iOS's does. */
const PULL_GROWTH = 0.08;

/**
 * A large title that collapses into the bar as its list scrolls: made by
 * `useCollapsingTitle`, read by `TitleBar` and `LargeTitle`, fed by the list's
 * `onScroll` (an `Animated.event` on the native driver, so nothing waits for
 * the JS thread while the list moves).
 */
export interface CollapsingTitle {
  y: Animated.Value;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** where the large title's bottom edge sits in the list, once it is laid out */
  bottom: number;
  onLayout: (e: LayoutChangeEvent) => void;
}

/** The scroll a tab's collapsing title follows; give `onScroll` to an Animated list with `scrollEventThrottle={16}`. */
export function useCollapsingTitle(): CollapsingTitle {
  const y = useRef(new Animated.Value(0)).current;
  const onScroll = useMemo(() => Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true }), [y]);
  const [bottom, setBottom] = useState<number>(MIN_TOUCH_TARGET);
  return {
    y,
    onScroll,
    bottom,
    onLayout: (e) => {
      const { y: top, height } = e.nativeEvent.layout;
      setBottom(Math.round(top + height));
    },
  };
}

/**
 * The head of a tab, which is not a nav bar.
 *
 * A pushed screen gets `ScreenHeader`: a 44pt bar with the title centred
 * between a back button and whatever sits opposite it. A tab has no back
 * button and nothing to balance against, so it gets a large title instead —
 * big, aligned to the reading edge, sitting above the content rather than in
 * a bar.
 *
 * Three tabs wrote one and they disagreed about how big: two at 34, one at
 * 26. The same word set in two sizes on two tabs of the same app is the kind
 * of difference nobody can name and everybody can see when they switch.
 *
 * No top inset here. The screens reserve it differently — one on a list's
 * content container, others on the screen — and each of those is right for
 * what it wraps, so this stays out of it.
 *
 * Given `collapse`, it is the first thing in a list under a `TitleBar`, as
 * iOS draws a tab: it scrolls away with the content and the bar takes over
 * its name, and pulled down past the top it grows a little, from its reading
 * edge.
 */
export function LargeTitle({
  title,
  subtitle,
  left,
  right,
  collapse,
  style,
}: {
  title: string;
  /** The line under it, where a tab has something worth saying about itself. */
  subtitle?: string;
  /** A leading control, before the title. */
  left?: ReactNode;
  /** A trailing action, on the title's own line (Messages' new-message pencil). */
  right?: ReactNode;
  /** The scroll it collapses with, under a `TitleBar` that shares it. */
  collapse?: CollapsingTitle;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const grow =
    collapse && !reduce
      ? collapse.y.interpolate({ inputRange: [-120, 0], outputRange: [1 + PULL_GROWTH, 1], extrapolate: 'clamp' })
      : 1;

  return (
    <View style={style} onLayout={collapse?.onLayout}>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        {left ?? null}
        <Animated.Text
          style={[
            styles.title,
            dir.text,
            { color: colors.textPrimary, transform: [{ scale: grow }], transformOrigin: dir.row === 'row-reverse' ? 'right center' : 'left center' },
          ]}
          numberOfLines={1}
          accessibilityRole="header"
        >
          {title}
        </Animated.Text>
        {right ?? null}
      </View>
      {subtitle ? <Text style={[styles.subtitle, dir.text, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
    </View>
  );
}

/**
 * The bar over a tab whose large title scrolls (`LargeTitle` with
 * `collapse`): 44 points under the status bar, holding the tab's actions so
 * they stay in reach however far the list goes.
 *
 * While the large title shows, the bar is part of the page — no title, no
 * line, the scroll edge as iOS draws it. Once the large title has gone under
 * it, the name comes back here, centred, at 17 points semibold, rising a
 * little as it fades in, and a hairline marks where the list now passes
 * beneath. Scrolled back to the top, both go again. Under Reduce Motion the
 * name does not rise: it is simply swapped in.
 *
 * The name here is for the eye; a screen reader already has the large title
 * as the screen's header, and is not told it twice.
 */
export function TitleBar({ title, collapse, right }: { title: string; collapse: CollapsingTitle; right?: ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dir = useDirection();
  const reduce = useReducedMotion();
  const end = collapse.bottom;
  const start = reduce ? end - 1 : end - SWAP;
  const shown = collapse.y.interpolate({ inputRange: [start, end], outputRange: [0, 1], extrapolate: 'clamp' });
  const rise = reduce ? 0 : collapse.y.interpolate({ inputRange: [start, end], outputRange: [6, 0], extrapolate: 'clamp' });

  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={[styles.barRow, { flexDirection: dir.row }]}>
        <View style={styles.side} />
        <Animated.Text
          style={[styles.inline, { color: colors.textPrimary, opacity: shown, transform: [{ translateY: rise }] }]}
          numberOfLines={1}
          aria-hidden
        >
          {title}
        </Animated.Text>
        <View style={[styles.side, { flexDirection: dir.row, justifyContent: 'flex-end' }]}>{right}</View>
      </View>
      <Animated.View style={[styles.hairline, { backgroundColor: colors.separator, opacity: shown }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // the title takes the space, so a leading control sits before it and a
  // trailing one is pushed to the end — rather than all three spreading out
  row: { alignItems: 'center', gap: spacing.md, minHeight: 44 },
  // 34, the large-title size
  title: { ...display(typography.sizes.xxl), flex: 1 },
  subtitle: { fontSize: typography.sizes.sm, marginTop: 2 },
  bar: { paddingHorizontal: layout.gutter },
  barRow: { alignItems: 'center', minHeight: MIN_TOUCH_TARGET, gap: spacing.sm },
  // equal shares either side, so the name is centred whatever the actions hold
  side: { flex: 1, alignItems: 'center' },
  inline: { fontSize: typography.ios.row, fontWeight: typography.weights.semibold, flexShrink: 1, textAlign: 'center' },
  hairline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth },
});
