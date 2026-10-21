import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, spacing } from './tokens';
import { useTheme } from './ThemeProvider';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useI18n } from '../i18n/I18nContext';

/**
 * The light that crosses every skeleton on the screen: one value and one loop
 * for all of them, started by the first that appears and stopped with the
 * last, so the sweep passes over a whole list together — and costs one
 * animation however many blocks there are. It is the only thing in the app
 * that loops, and only while something is loading.
 */
const SWEEP_MS = 1600;
/** what the browser waits before showing its placeholders, so the two apps feel the same */
const REVEAL_AFTER_MS = 120;
const sweep = new Animated.Value(0);
let watching = 0;
let loop: Animated.CompositeAnimation | null = null;

function watchSweep(): () => void {
  watching += 1;
  if (watching === 1) {
    sweep.setValue(0);
    // never an "interaction": a loop that held one would keep lists waiting to render for as long as it ran
    loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.inOut(Easing.quad), useNativeDriver: true, isInteraction: false }));
    loop.start();
  }
  return () => {
    watching -= 1;
    if (watching === 0) {
      loop?.stop();
      loop = null;
    }
  };
}

/**
 * Skeleton placeholder: a soft block in the shape of what is coming, with a
 * narrow band of light passing over it — a transform on the native driver, so
 * a screen full of them costs nothing. Under Reduce Motion the light is taken
 * away and the block stays: the shape is the useful half. Hidden from screen
 * readers (it's decorative; the screen announces "loading" via the boundary).
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = radii.sm,
  raised = false,
  style,
}: {
  width?: DimensionValue;
  /** a number, or '100%' to fill a box that has its own shape (a square picture) */
  height?: DimensionValue;
  radius?: number;
  /**
   * Drawn on a card that already has the block's own grey (a profile's card):
   * one step up, so the shape still shows.
   */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);
  /*
   * Grey only once the wait is long enough to notice. An answer that comes
   * back at once would otherwise flash a page of grey for a frame or two; the
   * shape still takes its room from the first frame, so nothing moves when
   * it does appear.
   */
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), REVEAL_AFTER_MS);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (reduce) return;
    return watchSweep();
  }, [reduce]);

  const band = Math.max(24, w * 0.6);
  // rests off the far edge for the last part of each pass, so it reads as one sweep rather than a band bouncing
  const translateX = sweep.interpolate({ inputRange: [0, 0.7, 1], outputRange: [-band, w + band * 0.2, w + band * 0.2] });
  const light = scheme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.55)';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // how a test, or a check of a screen's loading state against its loaded one, finds the blocks
      testID="skeleton"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        { width, height, borderRadius: radius, backgroundColor: raised ? colors.selectedFill : colors.controlTrack, overflow: 'hidden', opacity: shown ? 1 : 0 },
        style,
      ]}
    >
      {!reduce && w > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.band, { width: band, transform: [{ translateX }] }]}>
          <LinearGradient colors={['transparent', light, 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * How tall a line of text at `size` stands when the style gives it no line
 * height of its own: about 1.2 times the size on the platforms' own faces
 * (17 → 20, 15 → 18, 13 → 16). Near enough that a placeholder built from it
 * lands within a point or two of the words that replace it.
 */
export function lineOf(size: number): number {
  return Math.round(size * 1.2);
}

/**
 * One line of text, in grey: as tall as the line it stands for, with a bar
 * about as tall as its letters centred in it — so a stack of these is exactly
 * as tall as the paragraph, and each bar sits where the words will.
 *
 * `align` is which edge the bar starts from: the reading edge (`start`, the
 * right in Soranî when the caller mirrors), or the middle for centred text.
 */
export function SkeletonText({
  size,
  lineHeight,
  width = '100%',
  align = 'flex-start',
  raised = false,
  style,
}: {
  size: number;
  /** the style's own line height, when it sets one */
  lineHeight?: number;
  width?: DimensionValue;
  align?: 'flex-start' | 'center' | 'flex-end';
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View style={[{ height: lineHeight ?? lineOf(size), justifyContent: 'center', alignItems: align }, style]}>
      <Skeleton width={width} height={Math.max(8, Math.round(size * 0.68))} raised={raised} />
    </View>
  );
}

/** A skeleton mimicking a list row: a circular avatar + two text lines. */
export function SkeletonRow({ avatar = true }: { avatar?: boolean }): React.JSX.Element {
  return (
    <View style={styles.row}>
      {avatar ? <Skeleton width={40} height={40} radius={radii.pill} /> : null}
      <View style={styles.rowLines}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="82%" height={11} />
      </View>
    </View>
  );
}

/** A stack of text-line skeletons of varying widths — for article/detail bodies. */
export function SkeletonLines({ count = 3, style }: { count?: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const widths = ['70%', '92%', '85%', '78%', '60%'];
  const { t } = useI18n();
  return (
    <View style={[styles.lines, style]} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} width={widths[i % widths.length] as DimensionValue} height={13} />
      ))}
    </View>
  );
}

/** A stack of skeleton rows — the default "loading" state for list/feed screens. */
export function SkeletonList({ count = 6, avatar = true, style }: { count?: number; avatar?: boolean; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { t } = useI18n();
  return (
    <View style={[styles.list, style]} accessibilityLabel={t('common.loading')}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} avatar={avatar} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  list: { gap: spacing.lg, paddingVertical: spacing.md },
  lines: { gap: spacing.sm, paddingVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowLines: { flex: 1, gap: spacing.sm },
});
