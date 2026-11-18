import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radii, spacing } from './tokens';
import { useTheme } from './ThemeProvider';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useI18n } from '../i18n/I18nContext';

/**
 * The light crossing every skeleton on screen: one value and one loop for all of them, started by the first and
 * stopped with the last, so a list sweeps together at the cost of one animation. It loops only while something loads.
 */
const SWEEP_MS = 1600;
/** The website's wait before showing placeholders, so the two apps feel the same. */
const REVEAL_AFTER_MS = 120;
const sweep = new Animated.Value(0);
let watching = 0;
let loop: Animated.CompositeAnimation | null = null;

function watchSweep(): () => void {
  watching += 1;
  if (watching === 1) {
    sweep.setValue(0);
    // Never an "interaction": a loop holding one would delay list rendering for as long as it ran.
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
 * A skeleton placeholder: a soft block in the shape of what is coming, with a narrow band of light passing over it
 * on the native driver. Under Reduce Motion the light is removed and the block stays. Hidden from screen readers; the
 * screen announces loading itself.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = radii.sm,
  raised = false,
  style,
}: {
  width?: DimensionValue;
  /** A number, or '100%' to fill a box with its own shape (a square picture). */
  height?: DimensionValue;
  radius?: number;
  /** Drawn on a card already in the block's grey (a profile card): one step up, so the shape still shows. */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const alive = useMotionAlive();
  const [w, setW] = useState(0);
  /*
   * Grey only once the wait is noticeable, so an instant answer does not flash a page of grey. The shape takes its
   * room from the first frame, so nothing moves when it appears.
   */
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShown(true), REVEAL_AFTER_MS);
    return () => clearTimeout(id);
  }, []);

  // A skeleton behind another tab, or in a backgrounded app, does not keep the shared sweep running.
  useEffect(() => {
    if (!alive) return;
    return watchSweep();
  }, [alive]);

  const band = Math.max(24, w * 0.6);
  // Rests off the far edge for the end of each pass, so it reads as one sweep rather than a bouncing band.
  const translateX = sweep.interpolate({ inputRange: [0, 0.7, 1], outputRange: [-band, w + band * 0.2, w + band * 0.2] });
  const light = scheme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.55)';
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      // How tests, and checks of a screen's loading state against its loaded one, find the blocks.
      testID="skeleton"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[
        { width, height, borderRadius: radius, backgroundColor: raised ? colors.selectedFill : colors.controlTrack, overflow: 'hidden', opacity: shown ? 1 : 0 },
        style,
      ]}
    >
      {!!alive && w > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.band, { width: band, transform: [{ translateX }] }]}>
          <LinearGradient colors={['transparent', light, 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A text line's height at `size` with no explicit line height: about 1.2 times the size on system faces (17 → 20, 15 → 18, 13 → 16), within a point or two. */
export function lineOf(size: number): number {
  return Math.round(size * 1.2);
}

/**
 * One grey text line: as tall as the line it stands for, with a letter-height bar centred in it, so a stack matches
 * the paragraph and each bar sits where the words will. `align` is the bar's starting edge: the reading edge
 * (`start`, mirrored by the caller in Soranî) or the centre for centred text.
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
  /** The style's own line height, when it sets one. */
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

/** A list-row skeleton: a round avatar and two text lines. */
function SkeletonRow({ avatar = true }: { avatar?: boolean }): React.JSX.Element {
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

/** Text-line skeletons of varying widths, for article and detail bodies. */
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

/** Skeleton rows, the default loading state for list and feed screens. */
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
