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
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const reduce = useReducedMotion();
  const [w, setW] = useState(0);

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
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.controlTrack, overflow: 'hidden' }, style]}
    >
      {!reduce && w > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.band, { width: band, transform: [{ translateX }] }]}>
          <LinearGradient colors={['transparent', light, 'transparent']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
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
