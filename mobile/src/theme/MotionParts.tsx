import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo, timing, useEnter, usePop, usePressScale, useShake } from './animate';
import { ENTRANCE, duration } from './motion';
import { Icon } from './Icon';
import { radii } from './tokens';

/**
 * The shared moving parts: a row rising into a list, a card that gives under
 * a finger, a check drawn in, a menu arriving, an answer popping or shaking,
 * a heart filling with a tiny burst. Each one honours Reduce Motion by itself
 * (see animate.ts), and moves only transform and opacity. A bottom sheet's
 * arrival is BottomSheet's own.
 *
 * Not `Motion.tsx`: beside `motion.ts` (the tokens) that name differs only in
 * case, which a case-insensitive disk — a Mac's, by default — cannot tell apart.
 */

/**
 * One row of a list that has just arrived: it fades in and rises 8 points,
 * a beat after the row above it. `delay` comes from `useListEntrance`; null
 * means "just be there", which is every row after the first screenful and
 * every row on a later visit.
 */
export function Rise({ delay, children, style }: { delay: number | null; children: ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const p = useEnter(delay !== null, delay ?? 0, duration.slow);
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [ENTRANCE.distance, 0] });
  return <Animated.View style={[style, { opacity: p, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A card or a tile that can be pressed: it gives a little under the finger
 * (to 0.97) and springs back. Everything else — the press, the role, the
 * label, the style and its layout — is exactly a Pressable's, so a card can
 * swap one for the other. Under Reduce Motion it does not move, and dims a
 * little while held instead.
 */
export function PressableScale({
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; children: ReactNode }): React.JSX.Element {
  const reduce = useReducedMotion();
  const press = usePressScale(!disabled);
  const [held, setHeld] = useState(false);
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        press.onPressIn();
        if (reduce) setHeld(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        press.onPressOut();
        if (reduce) setHeld(false);
        onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale: press.scale }] }, held && { opacity: 0.8 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * A check mark that draws in, left to right, as an answer is accepted — a
 * window over the glyph that opens, both halves on the native driver. Under
 * Reduce Motion it is simply there.
 */
export function DrawnCheck({ size, color, delayMs = 60 }: { size: number; color: string; delayMs?: number }): React.JSX.Element {
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      p.setValue(1);
      return;
    }
    const run = timing(p, 1, duration.base + 60, { delay: delayMs });
    run.start();
    return () => run.stop();
  }, [p, reduce, delayMs]);
  // the window slides in from the left while the glyph inside it slides the other way, so the glyph stays put
  const open = p.interpolate({ inputRange: [0, 1], outputRange: [-size, 0] });
  const hold = p.interpolate({ inputRange: [0, 1], outputRange: [size, 0] });
  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={{ width: size, height: size, overflow: 'hidden', transform: [{ translateX: open }] }}>
        <Animated.View style={{ transform: [{ translateX: hold }] }}>
          <Icon name="check" size={size} color={color} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** A menu or a small dialog's arrival: it grows from just under full size and fades in. A fade alone under Reduce Motion. */
export function MenuIn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const reduce = useReducedMotion();
  const p = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = reduce ? timing(p, 1, duration.base) : springTo(p, 1, 'standard');
    run.start();
    return () => run.stop();
  }, [reduce, p]);
  const scale = reduce ? 1 : p.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const opacity = p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' });
  return <Animated.View style={[style, { opacity, transform: [{ scale }] }]}>{children}</Animated.View>;
}

/**
 * Something an answer was given with — an option, a field, a set of cards —
 * that answers back once it is graded: a gentle pop when it was right, a short
 * shake when it was not. It plays as the verdict arrives and never again;
 * under Reduce Motion it stays still and the colour says it alone.
 */
export function AnswerMotion({
  verdict,
  onMount = false,
  children,
  style,
}: {
  verdict: 'right' | 'wrong' | null;
  /** play for the verdict it is first shown with, too (a verdict that arrives as its own screen) */
  onMount?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const shake = useShake();
  const pop = usePop();
  const last = useRef(onMount ? null : verdict);
  useEffect(() => {
    if (verdict === last.current) return;
    last.current = verdict;
    if (verdict === 'right') pop.run();
    else if (verdict === 'wrong') shake.run();
  }, [verdict, pop, shake]);
  return <Animated.View style={[style, { transform: [{ translateX: shake.translateX }, { scale: pop.scale }] }]}>{children}</Animated.View>;
}

/**
 * A pop, once each time `when` turns true after mounting: a reaction chosen,
 * a pair made. Nothing on the first render and nothing under Reduce Motion.
 */
export function Pop({ when, children, style }: { when: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const pop = usePop();
  const last = useRef(when);
  useEffect(() => {
    if (when && !last.current) pop.run();
    last.current = when;
  }, [when, pop]);
  return <Animated.View style={[style, { transform: [{ scale: pop.scale }] }]}>{children}</Animated.View>;
}

/** Where the six sparks of a like fly to, round the heart. */
const SPARKS = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(a), y: Math.sin(a) };
});

/**
 * A heart that pops with a tiny burst when it is liked: the glyph squashes and
 * springs back larger than it was for an instant, and six small sparks in its
 * colour fly a few points out and fade. Played each time `fired` goes up —
 * the press itself, so it answers the finger before the server does. Still
 * under Reduce Motion, where the fill changing colour is the answer.
 */
export function HeartBurst({ fired, color, size, children }: { fired: number; color: string; size: number; children: ReactNode }): React.JSX.Element {
  const reduce = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const spark = useRef(new Animated.Value(1)).current;
  const seen = useRef(fired);
  useEffect(() => {
    if (fired === seen.current) return;
    seen.current = fired;
    if (reduce) return;
    scale.setValue(0.72);
    spark.setValue(0);
    Animated.parallel([springTo(scale, 1, 'bouncy'), timing(spark, 1, duration.slow + 80)]).start();
  }, [fired, reduce, scale, spark]);
  const reach = size * 0.9;
  const opacity = spark.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {SPARKS.map((p, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: 'absolute',
            width: 4,
            height: 4,
            borderRadius: radii.pill,
            backgroundColor: color,
            opacity,
            transform: [
              { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [p.x * size * 0.35, p.x * reach] }) },
              { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [p.y * size * 0.35, p.y * reach] }) },
            ],
          }}
        />
      ))}
      <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>
    </View>
  );
}
