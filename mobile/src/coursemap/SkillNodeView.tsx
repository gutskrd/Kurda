import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { PATH_GEOMETRY, type PathStop } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { GOLD_INK, GOLD_LIP, REST, mix, type ToneColors } from './path';
import type { SkillNode } from './types';

const { node: NODE } = PATH_GEOMETRY;
/** the darker edge under a stop, which makes it read as something to press; deeper under the current one */
const LIP = 5;
const LIP_RAISED = 7;
/** the ring round the current skill, for how many of its lessons are done */
const RING_GAP = 9;
const RING_STROKE = 6;
const RING = NODE + 2 * (RING_GAP + RING_STROKE);

type Stop = PathStop<SkillNode>;

/**
 * One stop on the lesson path: a round button, its shape and glyph saying
 * what it is as well as its colour — a check when done (a star with a gold rim
 * once strong, a small review sign once a refresh would help), the number of
 * an open skill (raised, with a ring for its lessons, on the current one), a
 * padlock when closed, review's arrows, a unit's trophy.
 *
 * Over the current skill floats "Start" (or "Continue"), which opens its next
 * lesson in one tap; it bobs gently, and stands still for anyone who has asked
 * their phone for less motion.
 */
export function SkillNodeView({
  stop,
  left,
  top,
  tone,
  label,
  callout,
  onPress,
  onStart,
}: {
  stop: Stop;
  /** where the stop's round sits in its unit's path, in points */
  left: number;
  top: number;
  tone: ToneColors;
  /** everything the stop is, for a screen reader */
  label: string;
  /** the word over the current skill, and what a screen reader says for it */
  callout?: { text: string; label: string };
  onPress: () => void;
  onStart?: () => void;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const rest = REST[scheme];
  const look = lookOf(stop, tone, rest, colors.surfaceRaised, colors.gold, GOLD_LIP[scheme]);
  const raised = stop.kind === 'skill' && stop.state === 'current';
  const lip = raised ? LIP_RAISED : LIP;

  return (
    <View style={[styles.stop, { left, top }]} pointerEvents="box-none">
      {callout && onStart ? <Callout text={callout.text} label={callout.label} tone={tone} onPress={onStart} /> : null}
      {raised && stop.kind === 'skill' ? (
        <Ring done={stop.lessonsDone} total={stop.lessonsTotal} fill={tone.fill} track={rest.line} />
      ) : null}
      <View style={[styles.lip, { top: lip, backgroundColor: look.lip }]} />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={`lp-node-${testName(stop)}`}
        hitSlop={4}
        style={({ pressed }) => [
          styles.face,
          look.ring ? styles.faceRinged : null,
          { backgroundColor: look.face, borderColor: look.ring ?? 'transparent', transform: [{ translateY: pressed ? lip - 2 : 0 }] },
        ]}
      >
        {stop.kind === 'skill' && (stop.state === 'current' || stop.state === 'available') ? (
          <Text style={[styles.number, { color: look.glyph }]}>{stop.number}</Text>
        ) : (
          <Icon name={look.icon} size={30} color={look.glyph} />
        )}
        {stop.kind === 'skill' && stop.finish === 'strong' ? <View style={[styles.goldRim, { borderColor: colors.gold }]} pointerEvents="none" /> : null}
        {stop.kind === 'skill' && stop.finish === 'refresh' ? (
          <View style={[styles.badge, { backgroundColor: colors.surfaceRaised, borderColor: tone.fill }]} pointerEvents="none">
            <Icon name="review" size={14} color={tone.text} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** What a stop is drawn with, by what it is. */
function lookOf(
  stop: Stop,
  tone: ToneColors,
  rest: (typeof REST)['dark'],
  surface: string,
  gold: string,
  goldLip: string,
): { face: string; lip: string; glyph: string; icon: IconName; ring?: string } {
  if (stop.kind === 'review') return { face: surface, lip: rest.lip, glyph: tone.text, icon: 'review', ring: tone.fill };
  if (stop.kind === 'trophy') {
    return stop.earned
      ? { face: gold, lip: goldLip, glyph: GOLD_INK, icon: 'trophy' }
      : { face: rest.fill, lip: rest.lip, glyph: rest.ink, icon: 'trophy' };
  }
  switch (stop.state) {
    case 'done':
      return {
        // ready for a refresh: still done, a little faded
        face: stop.finish === 'refresh' ? mix(tone.fill, rest.fill, 0.45) : tone.fill,
        lip: tone.lip,
        glyph: tone.ink,
        icon: stop.finish === 'strong' ? 'star-fill' : 'check',
      };
    case 'current':
      return { face: tone.fill, lip: tone.lip, glyph: tone.ink, icon: 'check' };
    case 'available':
      return { face: surface, lip: tone.lip, glyph: tone.text, icon: 'check', ring: tone.fill };
    case 'locked':
      return { face: rest.fill, lip: rest.lip, glyph: rest.ink, icon: 'lock' };
  }
}

/** A stable name per kind of stop, for tests and for the screenshots that check the path. */
function testName(stop: Stop): string {
  if (stop.kind !== 'skill') return stop.kind;
  return stop.state;
}

/** How far into the current skill: a ring that fills as its lessons are done, from the top, clockwise. */
function Ring({ done, total, fill, track }: { done: number; total: number; fill: string; track: string }): React.JSX.Element {
  const r = NODE / 2 + RING_GAP + RING_STROKE / 2;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  return (
    <View style={styles.ring} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={RING} height={RING}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={track} strokeWidth={RING_STROKE} fill="none" />
        {share > 0 ? (
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={fill}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * share} ${c}`}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        ) : null}
      </Svg>
    </View>
  );
}

/**
 * "Start" over the current skill, bobbing gently unless the phone asks for less
 * motion — a few times as the path appears, then still. A bob that never
 * stops is something moving at the edge of the eye for as long as the screen
 * is open, long after it has said where to tap.
 */
function Callout({ text, label, tone, onPress }: { text: string; label: string; tone: ToneColors; onPress: () => void }): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      lift.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lift, { toValue: -5, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(lift, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
      { iterations: BOBS },
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, lift]);

  return (
    <Animated.View style={[styles.calloutWrap, { transform: [{ translateY: lift }] }]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        style={[styles.callout, { backgroundColor: colors.surfaceRaised, borderColor: tone.fill }]}
      >
        <Text style={[styles.calloutText, { color: tone.text }]}>{text}</Text>
      </Pressable>
      <View style={[styles.calloutTip, { backgroundColor: colors.surfaceRaised, borderColor: tone.fill }]} />
    </Animated.View>
  );
}

const CALLOUT_WIDTH = 180;
/** How many times "Start" bobs before it rests where it is. */
const BOBS = 3;

const styles = StyleSheet.create({
  stop: { position: 'absolute', width: NODE, height: NODE + LIP_RAISED },
  lip: { position: 'absolute', left: 0, width: NODE, height: NODE, borderRadius: radii.pill },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: NODE,
    height: NODE,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceRinged: { borderWidth: 4 },
  number: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  goldRim: { position: 'absolute', top: -7, left: -7, right: -7, bottom: -7, borderRadius: radii.pill, borderWidth: 3 },
  badge: {
    position: 'absolute',
    top: -4,
    end: -4,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', left: (NODE - RING) / 2, top: (NODE - RING) / 2 },
  calloutWrap: {
    position: 'absolute',
    bottom: NODE + LIP_RAISED + spacing.md,
    left: (NODE - CALLOUT_WIDTH) / 2,
    width: CALLOUT_WIDTH,
    alignItems: 'center',
  },
  callout: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  calloutTip: {
    width: 12,
    height: 12,
    marginTop: -7,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
});
