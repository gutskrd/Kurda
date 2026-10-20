import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { springTo, timing } from './animate';
import { burstPlan, celebrationPlan, type CelebrationPlan, type Fleck } from './celebration';
import { radii } from './tokens';

/**
 * The parts of a celebration (celebration.ts says how it goes): the art's
 * arrival, the ring, the burst, the words — driven by four values on the
 * native driver, so the whole moment plays even while the JS thread is busy
 * loading what comes next, and a skip is four `setValue(1)`s.
 */
export interface Celebrating {
  plan: CelebrationPlan;
  /** 0 → 1: the art (a spring under full motion, so it may pass 1 a little) */
  art: Animated.Value;
  /** 0 → 1: the ring widening once */
  ring: Animated.Value;
  /** 0 → 1: the whole burst; each fleck takes its own slice */
  burst: Animated.Value;
  /** 0 → 1: the words */
  details: Animated.Value;
  /** still playing; false once it has ended or been skipped */
  playing: boolean;
  /** jump to the end */
  skip: () => void;
}

/**
 * Play a celebration once, as the component mounts. It is felt as the art
 * lands — `haptic('celebrate')`, which the pacing in haptics.ts keeps to one
 * buzz however many moments arrive together.
 */
export function useCelebration({ feel = true }: { feel?: boolean } = {}): Celebrating {
  const reduce = useReducedMotion();
  const plan = useMemo(() => celebrationPlan(reduce), [reduce]);
  const art = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const details = useRef(new Animated.Value(0)).current;
  const [playing, setPlaying] = useState(true);
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const felt = useRef(false);
  const tick = useRef<ReturnType<typeof setTimeout> | null>(null);

  const feelIt = useCallback(() => {
    if (felt.current || !feel) return;
    felt.current = true;
    haptic('celebrate');
  }, [feel]);

  useEffect(() => {
    const parts: Animated.CompositeAnimation[] = [];
    if (plan.travel) {
      parts.push(springTo(art, 1, 'bouncy'));
      parts.push(timing(ring, 1, plan.ringMs, { delay: plan.ringDelayMs, easing: Easing.out(Easing.quad) }));
      parts.push(Animated.timing(burst, { toValue: 1, duration: plan.burstMs, delay: plan.burstDelayMs, easing: Easing.linear, useNativeDriver: true }));
    } else {
      parts.push(timing(art, 1, plan.artMs));
      ring.setValue(1);
      burst.setValue(1);
    }
    parts.push(timing(details, 1, plan.detailsMs, { delay: plan.detailsDelayMs }));
    const run = Animated.parallel(parts);
    running.current = run;
    run.start(({ finished }) => {
      if (finished) setPlaying(false);
    });
    tick.current = setTimeout(feelIt, plan.hapticAtMs);
    return () => {
      run.stop();
      if (tick.current) clearTimeout(tick.current);
    };
    // the Reduce Motion answer can arrive a moment late; then it simply plays again, as a fade
  }, [plan, art, ring, burst, details, feelIt]);

  const skip = useCallback(() => {
    running.current?.stop();
    if (tick.current) clearTimeout(tick.current);
    // skipped before it landed: the moment still happened, and is still felt
    feelIt();
    art.setValue(1);
    ring.setValue(1);
    burst.setValue(1);
    details.setValue(1);
    setPlaying(false);
  }, [art, ring, burst, details, feelIt]);

  return { plan, art, ring, burst, details, playing, skip };
}

/** A soft round glow in the moment's colour, behind the art, still. */
export function SoftGlow({ colour, size, id = 'celebrate-glow' }: { colour: string; size: number; id?: string }): React.JSX.Element {
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colour} stopOpacity={0.5} />
            <Stop offset="0.45" stopColor={colour} stopOpacity={0.16} />
            <Stop offset="1" stopColor={colour} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The ring of light that widens once from behind the art and is gone. */
export function GlowRing({ progress, colour, size }: { progress: Animated.Value; colour: string; size: number }): React.JSX.Element {
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.45] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.65, 0] });
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: radii.pill,
          borderWidth: 3,
          borderColor: colour,
          opacity,
          transform: [{ scale }],
        }}
      />
    </View>
  );
}

/**
 * The flecks, thrown out from the middle of the art and falling away. One
 * value drives them all; each fleck reads its own slice of it.
 */
export function ConfettiBurst({
  progress,
  count,
  seed,
  colours,
  reach,
}: {
  progress: Animated.Value;
  count: number;
  seed: number;
  colours: string[];
  reach: number;
}): React.JSX.Element | null {
  const flecks = useMemo(() => burstPlan(count, seed, colours.length, reach), [count, seed, colours.length, reach]);
  if (flecks.length === 0 || colours.length === 0) return null;
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {flecks.map((f, i) => (
        <BurstFleck key={i} fleck={f} progress={progress} colour={colours[f.colour] ?? colours[0]!} />
      ))}
    </View>
  );
}

function BurstFleck({ fleck, progress, colour }: { fleck: Fleck; progress: Animated.Value; colour: string }): React.JSX.Element {
  const { start, end } = fleck;
  // thrown out fast over the first third of its time, then falling for the rest
  const out = start + (end - start) * 0.32;
  const translateX = progress.interpolate({ inputRange: [start, out, end], outputRange: [0, fleck.dx, fleck.dx * 1.12], extrapolate: 'clamp' });
  const translateY = progress.interpolate({ inputRange: [start, out, end], outputRange: [0, fleck.dy, fleck.dy + fleck.fall], extrapolate: 'clamp' });
  const rotate = progress.interpolate({ inputRange: [start, end], outputRange: ['0deg', `${fleck.spin}deg`], extrapolate: 'clamp' });
  const opacity = progress.interpolate({
    inputRange: [start, start + 0.02, start + (end - start) * 0.7, end],
    outputRange: [0, 1, 0.9, 0],
    extrapolate: 'clamp',
  });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: fleck.w,
        height: fleck.h,
        borderRadius: radii.xs / 3,
        backgroundColor: colour,
        opacity,
        transform: [{ translateX }, { translateY }, { rotate }],
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
