import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  DEER_BREATH_LOW,
  DEER_BREATH_MS,
  DEER_LOOP_MS,
  DEER_MARK_FULL_FROM,
  DEER_MARK_VIEW,
  deerFormKey,
  deerFormPath,
  deerLoopAt,
  deerLoopTrack,
  type DeerLoopPose,
} from '@kurda/shared';
import { useScreenAwake } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from './ThemeProvider';

/** The loop sampled for the native driver's table: its moments and the turn at each, finely enough to stay smooth. */
const TRACK = deerLoopTrack();

/** The first frame's pose: the deer, upright. */
const REST = deerLoopAt(0);

/**
 * Hevalo's mark as the loader (shared deer-mark.ts): he curls into a ball, spins as a ring and spins back out, in the
 * ink. The turn runs on the native driver; the shape is drawn exactly for each moment that clock reports, never in
 * steps. A path cannot be animated on the native driver itself, so a busy JavaScript thread may hold the shape a moment
 * but never stops the turn. Under Reduce Motion it only breathes in
 * opacity, and nothing moves while its screen is behind another or the app is in the background. To assistive
 * technology it is hidden: the caller says what is loading.
 */
export function DeerLoader({ size = 48, style }: { size?: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const awake = useScreenAwake();
  const reduce = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(1)).current;
  const [form, setForm] = useState<DeerLoopPose>(REST);
  const small = size < DEER_MARK_FULL_FROM;

  useEffect(() => {
    if (!awake) return;
    if (reduce) {
      const half = { duration: DEER_BREATH_MS / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
      const inOut = Animated.sequence([Animated.timing(breath, { ...half, toValue: DEER_BREATH_LOW }), Animated.timing(breath, { ...half, toValue: 1 })]);
      const loop = Animated.loop(inOut);
      loop.start();
      return () => {
        loop.stop();
        breath.setValue(1);
      };
    }
    let drawn = deerFormKey(REST);
    const id = phase.addListener(({ value }) => {
      const pose = deerLoopAt(value);
      const key = deerFormKey(pose);
      if (key === drawn) return;
      drawn = key;
      setForm(pose);
    });
    const loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration: DEER_LOOP_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      phase.removeListener(id);
      phase.setValue(0);
      setForm(REST);
    };
  }, [awake, reduce, phase, breath]);

  const transform = useMemo(
    () => [{ rotate: phase.interpolate({ inputRange: TRACK.at, outputRange: TRACK.poses.map((pose) => `${pose.turn}deg`) }) }],
    [phase],
  );

  const d = useMemo(() => deerFormPath(form, { small }), [form, small]);

  return (
    <Animated.View
      style={[{ width: size, height: size, opacity: breath }, !reduce && { transform }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="deer-loader"
    >
      <Svg width={size} height={size} viewBox={`0 0 ${DEER_MARK_VIEW} ${DEER_MARK_VIEW}`}>
        <Path d={d} fill={colors.primary} />
      </Svg>
    </Animated.View>
  );
}
