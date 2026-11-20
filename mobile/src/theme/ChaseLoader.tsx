import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { CHASE, CHASE_APPLE, CHASE_VIEW, chaseArt } from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useDrawingIds } from '../characters/drawingIds';
import { useTheme } from './ThemeProvider';

/** The ground under him, a warm line on a light page and a soft one on a dark page. */
const GROUND = { light: '#ddd5c8', dark: '#3a3448' } as const;

/** Where the apple's bob and drift are sampled along their loops; they move smoothly between. */
const SAMPLES = Array.from({ length: 13 }, (_, i) => i / 12);

/**
 * Hevalo galloping after a winged apple (shared chase.ts), for a page that is on its way. The stride's drawings are
 * each laid once and shown in turn by one value looping on the native driver, and the apple bobs, drifts and beats
 * its wings on its own loops, so nothing is redrawn while it runs. It runs only while its screen is in front, and
 * under Reduce Motion he stands mid-stride with the apple still. Screen readers hear `label`.
 */
export function ChaseLoader({ width = 200, label, style }: { width?: number; label: string; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const ids = useDrawingIds('chase');
  const art = useMemo(() => chaseArt({ ground: GROUND[colors.scheme === 'dark' ? 'dark' : 'light'], idPrefix: ids }), [colors.scheme, ids]);
  const alive = useMotionAlive();
  const stride = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const beat = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!alive) {
      stride.setValue(0);
      drift.setValue(0);
      beat.setValue(0.6);
      return;
    }
    const linear = (value: Animated.Value, ms: number) => Animated.loop(Animated.timing(value, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));
    // Each wingbeat: down quickly, then up more slowly.
    const wings = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, { toValue: 0, duration: CHASE.beatMs * CHASE.beatDown, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(beat, { toValue: 1, duration: CHASE.beatMs * (1 - CHASE.beatDown), easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const loops = [linear(stride, CHASE.strideMs), linear(drift, CHASE.driftMs), wings];
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [alive, stride, drift, beat]);

  const height = (width * CHASE_VIEW.h) / CHASE_VIEW.w;
  const unit = width / CHASE_VIEW.w;
  const motion = useMemo(() => {
    const n = CHASE.frames;
    // Each drawing shown for its share of the stride and hidden for the rest, switching within a hair of its edges.
    const e = 1e-4;
    const frames = art.frames.map((_, i) => {
      const from = i / n;
      const to = (i + 1) / n;
      if (i === 0) return stride.interpolate({ inputRange: [0, to - e, to, 1], outputRange: [1, 1, 0, 0] });
      if (i === n - 1) return stride.interpolate({ inputRange: [0, from - e, from, 1], outputRange: [0, 0, 1, 1] });
      return stride.interpolate({ inputRange: [0, from - e, from, to - e, to, 1], outputRange: [0, 0, 1, 1, 0, 0] });
    });
    const wave = (value: Animated.Value, size: number, sign: number) =>
      value.interpolate({ inputRange: SAMPLES, outputRange: SAMPLES.map((t) => sign * size * unit * Math.sin(2 * Math.PI * t)) });
    const at = (p: { x: number; y: number }): string =>
      `${(((p.x - CHASE_VIEW.x) / CHASE_VIEW.w) * 100).toFixed(2)}% ${(((p.y - CHASE_VIEW.y) / CHASE_VIEW.h) * 100).toFixed(2)}%`;
    const wing = (scale: number) =>
      beat.interpolate({ inputRange: [0, 1], outputRange: [`${CHASE.beatFrom * scale}deg`, `${CHASE.beatTo * scale}deg`] });
    return {
      frames,
      apple: { transform: [{ translateX: wave(drift, CHASE.drift, 1) }, { translateY: wave(stride, CHASE.bob, -1) }] },
      nearWing: { transformOrigin: at(CHASE_APPLE.nearWing), transform: [{ rotate: wing(1) }] },
      farWing: { transformOrigin: at(CHASE_APPLE.farWing), transform: [{ rotate: wing(0.9) }] },
    };
  }, [art, stride, drift, beat, unit]);

  const layer = (xml: string) => <SvgXml xml={xml} width={width} height={height} style={StyleSheet.absoluteFill} />;
  return (
    <View style={[styles.centre, style]} accessible accessibilityRole="progressbar" accessibilityLabel={label} testID="chase-loader">
      <View style={{ width, height }}>
        {layer(art.ground)}
        {art.frames.map((xml, i) => (
          <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: motion.frames[i] }]}>
            {layer(xml)}
          </Animated.View>
        ))}
        <Animated.View style={[StyleSheet.absoluteFill, motion.apple]}>
          <Animated.View style={[StyleSheet.absoluteFill, motion.farWing]}>{layer(art.farWing)}</Animated.View>
          {layer(art.apple)}
          <Animated.View style={[StyleSheet.absoluteFill, motion.nearWing]}>{layer(art.nearWing)}</Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignSelf: 'center', alignItems: 'center' },
});
