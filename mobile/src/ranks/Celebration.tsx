import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, StyleSheet, Text, Vibration, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { DarkScheme } from '../theme/ThemeProvider';
import { display, sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { confettiPlan, revealPlan, type Fleck } from './motion';

/** The tick as the emblem lands — the lightest the platforms give, the same as a gift's. */
const HAPTIC_MS = 15;
/** The night the moment is staged on, in either scheme. */
const STAGE = '#07080c';

/**
 * A moment on its own stage: a new division, a new tier, a first placement,
 * a badge. Night-dark whatever the scheme (the art is light on dark), the
 * thing earned rising into a glow in its own colour with a slow turn of rays
 * behind it, a few flecks drifting down once, one light tick — and the words.
 * Under Reduce Motion it is a fade: no rays, no flecks, no tick.
 *
 * Nothing here asks for anything back. One button continues, and the
 * backdrop does not trap anybody: the system back closes it too.
 */
export function Celebration({
  art,
  glow,
  flecks,
  fleckColours,
  seed,
  kicker,
  title,
  subtitle,
  detail,
  note,
  actions,
  announce,
  onClose,
}: {
  /** the emblem or medallion, drawn at ~168pt */
  art: ReactNode;
  /** the glow behind it */
  glow: string;
  /** how many flecks fall (0 for none) */
  flecks: number;
  fleckColours: string[];
  /** keeps the same moment looking the same */
  seed: number;
  /** "NEW TIER" */
  kicker: string;
  /** "Gir I" */
  title: string;
  /** "Hill" */
  subtitle?: string | null;
  /** what earned it: "+26 · you beat a higher-ranked player" */
  detail?: string | null;
  /** a line under it: the shield, a badge's tier */
  note?: string | null;
  /** buttons; a Continue is the caller's to give */
  actions: ReactNode;
  /** what a screen reader hears as it opens */
  announce: string;
  onClose: () => void;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const plan = revealPlan(reduce);
  const { width, height } = useWindowDimensions();
  const rise = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;
  const turn = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = Animated.parallel([
      Animated.timing(rise, {
        toValue: 1,
        duration: plan.emblemMs,
        easing: reduce ? Easing.linear : Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
      Animated.timing(words, { toValue: 1, duration: reduce ? 200 : 420, delay: plan.textDelayMs, useNativeDriver: true }),
    ]);
    run.start();
    const tick = plan.hapticAtMs === null ? null : setTimeout(() => Vibration.vibrate(HAPTIC_MS), plan.hapticAtMs);
    AccessibilityInfo.announceForAccessibility?.(announce);
    let spin: Animated.CompositeAnimation | null = null;
    if (plan.rays) {
      spin = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 24000, easing: Easing.linear, useNativeDriver: true }));
      spin.start();
    }
    return () => {
      run.stop();
      spin?.stop();
      if (tick) clearTimeout(tick);
    };
    // the moment plays once, as it opens
  }, []);

  const scale = reduce ? 1 : rise.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const lift = reduce ? 0 : words.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const stage = Math.min(width, 420);
  const fall = useMemo(() => (plan.confetti && flecks > 0 ? confettiPlan(flecks, seed, fleckColours.length) : []), [plan.confetti, flecks, seed, fleckColours.length]);

  return (
    <Modal visible transparent animationType={reduce ? 'none' : 'fade'} onRequestClose={onClose} statusBarTranslucent>
      <DarkScheme>
        <View style={[styles.backdrop, { backgroundColor: STAGE }]} accessibilityViewIsModal>
          <View style={styles.flecks} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {fall.map((f, i) => (
              <FallingFleck key={i} fleck={f} colour={fleckColours[f.colour] ?? glow} width={width} height={height} />
            ))}
          </View>
          <View style={[styles.column, { maxWidth: 420 }]}>
            <View style={[styles.artStage, { width: stage, height: Math.min(stage, 300) }]}>
              <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Glow colour={glow} size={Math.min(stage, 300)} />
              </View>
              {plan.rays ? (
                <Animated.View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, styles.center, { transform: [{ rotate }], opacity: rise }]}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                >
                  <Rays colour={glow} size={Math.min(stage, 300)} />
                </Animated.View>
              ) : null}
              <Animated.View style={{ opacity: rise, transform: [{ scale }] }}>{art}</Animated.View>
            </View>
            <Animated.View style={[styles.words, { opacity: words, transform: [{ translateY: lift }] }]}>
              <Text style={[sectionLabel, styles.kicker, { color: glow }]}>{kicker}</Text>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              {detail ? (
                <View style={styles.detail}>
                  <Text style={styles.detailText}>{detail}</Text>
                </View>
              ) : null}
              {note ? <Text style={styles.note}>{note}</Text> : null}
              <View style={styles.actions}>{actions}</View>
            </Animated.View>
          </View>
        </View>
      </DarkScheme>
    </Modal>
  );
}

/** A soft round glow in the moment's colour. */
function Glow({ colour, size }: { colour: string; size: number }): React.JSX.Element {
  return (
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="celebrate-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colour} stopOpacity={0.55} />
            <Stop offset="0.45" stopColor={colour} stopOpacity={0.18} />
            <Stop offset="1" stopColor={colour} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} fill="url(#celebrate-glow)" />
      </Svg>
    </View>
  );
}

/** Twelve thin rays round the middle, faint, turned slowly by the parent. */
function Rays({ colour, size }: { colour: string; size: number }): React.JSX.Element {
  const c = size / 2;
  const d: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const half = 0.05;
    const r0 = size * 0.2;
    const r1 = size * 0.5;
    d.push(
      `M${(c + Math.cos(a - half) * r0).toFixed(1)},${(c + Math.sin(a - half) * r0).toFixed(1)}` +
        `L${(c + Math.cos(a) * r1).toFixed(1)},${(c + Math.sin(a) * r1).toFixed(1)}` +
        `L${(c + Math.cos(a + half) * r0).toFixed(1)},${(c + Math.sin(a + half) * r0).toFixed(1)}Z`,
    );
  }
  return (
    <Svg width={size} height={size}>
      <Path d={d.join('')} fill={colour} fillOpacity={0.16} />
    </Svg>
  );
}

function FallingFleck({ fleck, colour, width, height }: { fleck: Fleck; colour: string; width: number; height: number }): React.JSX.Element {
  const p = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);
  useEffect(() => {
    const run = Animated.timing(p, { toValue: 1, duration: fleck.duration, delay: fleck.delay, easing: Easing.out(Easing.quad), useNativeDriver: true });
    run.start(({ finished }) => finished && setDone(true));
    return () => run.stop();
  }, [p, fleck]);
  if (done) return <View />;
  const translateY = p.interpolate({ inputRange: [0, 1], outputRange: [-24, height * fleck.fall] });
  const translateX = p.interpolate({ inputRange: [0, 1], outputRange: [0, fleck.drift] });
  const rotate = p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${fleck.spin}deg`] });
  const opacity = p.interpolate({ inputRange: [0, 0.08, 0.75, 1], outputRange: [0, 0.95, 0.85, 0] });
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: fleck.x * width,
        top: 0,
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
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  flecks: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  column: { width: '100%', alignItems: 'center' },
  artStage: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  words: { alignItems: 'center', alignSelf: 'stretch', gap: spacing.xs },
  kicker: { letterSpacing: 2 },
  title: { ...display(typography.sizes.xxl + 6), color: '#FFFFFF', textAlign: 'center' },
  subtitle: { fontSize: typography.sizes.lg, color: 'rgba(255,255,255,0.78)', textAlign: 'center' },
  detail: { marginTop: spacing.md, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.08)' },
  detailText: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold, color: '#FFFFFF', textAlign: 'center' },
  note: { fontSize: typography.sizes.sm, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginTop: spacing.sm, maxWidth: 320 },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.xl },
});
