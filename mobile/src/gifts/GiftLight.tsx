import { useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { GIFT_MOMENT_MS, giftGlow, giftRaysPath, giftSeed, giftSparkles, type GiftMomentLook, type GiftSparkle } from '@kurda/shared';

/**
 * The light behind a gift as it is opened (shared gift-moment.ts): a round glow in the gift's own colour, a ring of
 * light rays turning slowly behind it and light sparkles drifting up. The rays are one path, turned by a transform on
 * the native driver, so nothing is drawn again as they move; `lit` brings them up to full as the gift comes out, and
 * `still` (Reduce Motion) keeps everything where it is. Decorative: the words beside it say what happened.
 */
export function GiftLight({
  sku,
  look,
  art,
  lit,
  still,
  children,
}: {
  sku: string;
  look: GiftMomentLook;
  /** the picture's size in the middle, in points */
  art: number;
  lit: boolean;
  still: boolean;
  children: ReactNode;
}): React.JSX.Element {
  const { width } = useWindowDimensions();
  const glow = giftGlow(sku);
  const size = Math.round(art * look.halo);
  const raysSize = Math.min(width, 600);
  const rays = useMemo(() => giftRaysPath(look.rays, look.reach), [look.rays, look.reach]);
  const sparkles = useMemo(() => giftSparkles(look.sparkles, giftSeed(sku)), [look.sparkles, sku]);
  const spin = useRef(new Animated.Value(0)).current;
  const up = useRef(new Animated.Value(lit ? 1 : 0)).current;

  // One slow turn after another, for as long as the moment is up.
  useEffect(() => {
    if (still) return;
    const turning = Animated.loop(Animated.timing(spin, { toValue: 1, duration: look.turnMs, easing: Easing.linear, useNativeDriver: true }));
    turning.start();
    return () => turning.stop();
  }, [still, look.turnMs, spin]);

  useEffect(() => {
    if (still) {
      up.setValue(lit ? 1 : 0);
      return;
    }
    const rise = Animated.timing(up, { toValue: lit ? 1 : 0, duration: GIFT_MOMENT_MS.raysIn, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    rise.start();
    return () => rise.stop();
  }, [lit, still, up]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const opacity = up.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const scale = up.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  // ids of their own, since two lights can be up at once (a gift sent while one is open)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const rayId = `gift-rays-${uid}`;
  const glowId = `gift-glow-${uid}`;

  return (
    <View style={[styles.light, { width: size, height: size }]} testID="gift-light">
      <View style={styles.layer} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={{ width: raysSize, height: raysSize, opacity, transform: [{ rotate }, { scale }] }} testID="gift-rays">
          <Svg width={raysSize} height={raysSize} viewBox="-100 -100 200 200">
            <Defs>
              <RadialGradient id={rayId} cx="0" cy="0" r="100" gradientUnits="userSpaceOnUse">
                <Stop offset="0.1" stopColor={glow} stopOpacity={look.rayStrength} />
                <Stop offset="1" stopColor={glow} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Path d={rays} fill={`url(#${rayId})`} />
          </Svg>
        </Animated.View>
      </View>
      <View style={styles.layer} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={glow} stopOpacity={look.glow} />
              <Stop offset="0.55" stopColor={glow} stopOpacity={look.glow * 0.45} />
              <Stop offset="1" stopColor={glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${glowId})`} />
        </Svg>
      </View>
      {sparkles.map((s, i) => (
        <Sparkle key={i} sparkle={s} radius={size / 2} colour={lighter(glow)} still={still} />
      ))}
      {children}
    </View>
  );
}

/** One sparkle: it rises a little from its place round the gift, brightening then fading, over and over. */
function Sparkle({ sparkle, radius, colour, still }: { sparkle: GiftSparkle; radius: number; colour: string; still: boolean }): React.JSX.Element {
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const run = Animated.sequence([
      // set off part of the way through, so they do not all rise together
      Animated.delay(Math.round(sparkle.offset * GIFT_MOMENT_MS.sparkle)),
      Animated.loop(Animated.timing(drift, { toValue: 1, duration: GIFT_MOMENT_MS.sparkle, easing: Easing.inOut(Easing.sin), useNativeDriver: true })),
    ]);
    run.start();
    return () => run.stop();
  }, [still, drift, sparkle.offset]);
  const rise = -sparkle.rise * radius;
  const style = still
    ? { opacity: 0.8 }
    : {
        opacity: drift.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
        transform: [
          { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, rise] }) },
          { scale: drift.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.5, 1, 0.6] }) },
        ],
      };
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="gift-sparkle"
      style={[
        styles.sparkle,
        { left: radius + sparkle.x * radius - sparkle.size / 2, top: radius + sparkle.y * radius - sparkle.size / 2, width: sparkle.size, height: sparkle.size },
        style,
      ]}
    >
      <Svg width={sparkle.size} height={sparkle.size} viewBox="-1 -1 2 2">
        <Path d="M0 -1L0.24 -0.24L1 0L0.24 0.24L0 1L-0.24 0.24L-1 0L-0.24 -0.24Z" fill={colour} />
      </Svg>
    </Animated.View>
  );
}

/** The gift's colour taken most of the way to white, for the sparkles' light. */
function lighter(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v: number): number => Math.round(v + (255 - v) * 0.65);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

const styles = StyleSheet.create({
  light: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  sparkle: { position: 'absolute' },
});
