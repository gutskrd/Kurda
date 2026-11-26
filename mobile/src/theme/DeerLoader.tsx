import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  DEER_BREATH_LOW,
  DEER_BREATH_MS,
  DEER_CURL_STEPS,
  DEER_LOOP_MS,
  DEER_MARK_EYES_FROM,
  DEER_MARK_VIEW,
  deerCurlPath,
  deerLoopAt,
  deerLoopTrack,
} from '@kurda/shared';
import { useScreenAwake } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from './ThemeProvider';

/** The loop sampled for the native driver's tables: its moments, and the turn, squash and drop at each. */
const TRACK = deerLoopTrack(60);

/**
 * Hevalo's mark as the loader (shared deer-mark.ts): he curls into a ball and spins back out, in the ink. The
 * turn and squash run on the native driver; the curl is redrawn from the same clock as it passes each step, so a busy
 * JavaScript thread may hold the shape a moment but never stops the roll. Under Reduce Motion it only breathes in
 * opacity, and nothing moves while its screen is behind another or the app is in the background. To assistive
 * technology it is hidden: the caller says what is loading.
 */
export function DeerLoader({ size = 48, style }: { size?: number; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const awake = useScreenAwake();
  const reduce = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(1)).current;
  const [step, setStep] = useState(0);
  const eyes = size >= DEER_MARK_EYES_FROM;

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
    const id = phase.addListener(({ value }) => setStep(Math.round(deerLoopAt(value).curl * DEER_CURL_STEPS)));
    const loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration: DEER_LOOP_MS, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => {
      loop.stop();
      phase.removeListener(id);
      phase.setValue(0);
      setStep(0);
    };
  }, [awake, reduce, phase, breath]);

  const transform = useMemo(() => {
    const along = (pick: (pose: (typeof TRACK.poses)[number]) => number) => phase.interpolate({ inputRange: TRACK.at, outputRange: TRACK.poses.map(pick) });
    return [
      { translateY: along((pose) => (pose.drop * size) / DEER_MARK_VIEW) },
      { scaleX: along((pose) => pose.scaleX) },
      { scaleY: along((pose) => pose.scaleY) },
      { rotate: phase.interpolate({ inputRange: TRACK.at, outputRange: TRACK.poses.map((pose) => `${pose.turn}deg`) }) },
    ];
  }, [phase, size]);

  const d = useMemo(() => deerCurlPath(step / DEER_CURL_STEPS, { eyes }), [step, eyes]);

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
