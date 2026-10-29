import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { PATH_GEOMETRY, PATH_RETURN, type PathStop } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useDirection } from '../reports/direction';
import { ease, springTo, timing } from '../theme/animate';
import { Icon, type IconName } from '../theme/Icon';
import { DrawnCheck } from '../theme/MotionParts';
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
 * What coming back from a lesson changed about this stop, to show rather than
 * only draw (shared `pathChanges`, timed by `PATH_RETURN`): its ring filled
 * on from `ringFrom`, finished (it pops and its check draws in), opened (the
 * lock gives way to its number, and it pops), or the bubble's new place.
 */
export interface StopChange {
  ringFrom?: number;
  finishing?: boolean;
  opening?: boolean;
  arriving?: boolean;
}

/** How far a stop swells as it pops. */
const POP = 1.12;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
 *
 * The first stop of a later unit that can be jumped to (`jump`) is drawn in its
 * unit's colour with a skip-forward glyph rather than grey with a padlock, and
 * "Jump here?" stands over it, still: both open the offer.
 *
 * Back from a lesson, a stop shows what the lesson did to it (`change`): the
 * ring fills on, a finished stop pops as its check draws in, an opened one
 * trades its padlock for its number with a pop and a light knock, and the
 * bubble arrives last. Under Reduce Motion there is no `change`: the path is
 * simply as it now is.
 */
export function SkillNodeView({
  stop,
  left,
  top,
  tone,
  label,
  callout,
  change,
  jump,
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
  /** what coming back from a lesson changed here, played once */
  change?: StopChange | null;
  /** the first stop of a unit that can be jumped to, and the words over it */
  jump?: { text: string };
  onPress: () => void;
  onStart?: () => void;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const dir = useDirection();
  const rest = REST[scheme];
  const look = jump ? { face: tone.fill, lip: tone.lip, glyph: tone.ink, icon: 'skip-forward' as const } : lookOf(stop, tone, rest, colors.surfaceRaised, colors.gold, GOLD_LIP[scheme]);
  const raised = stop.kind === 'skill' && stop.state === 'current';
  const lip = raised ? LIP_RAISED : LIP;
  const finishing = !!change?.finishing;
  const opening = !!change?.opening;

  // a pop as it finishes or opens; an opened stop's padlock gives way to its number
  const pop = useRef(new Animated.Value(1)).current;
  const lock = useRef(new Animated.Value(opening ? 1 : 0)).current;
  // a stop already on the path when the change arrives starts from its padlock, from the first frame it is drawn opening
  const seen = useRef(change);
  if (seen.current !== change) {
    seen.current = change;
    lock.setValue(opening ? 1 : 0);
  }
  useEffect(() => {
    if (!finishing && !opening) return;
    const at = finishing ? PATH_RETURN.finishAtMs : PATH_RETURN.openAtMs;
    const half = PATH_RETURN.popMs / 2;
    const run = Animated.parallel([
      Animated.sequence([Animated.delay(at), timing(pop, POP, half), springTo(pop, 1, 'bouncy')]),
      ...(opening ? [timing(lock, 0, PATH_RETURN.glyphMs, { delay: at })] : []),
    ]);
    run.start();
    const knock = opening ? setTimeout(() => haptic('tap'), at) : null;
    return () => {
      run.stop();
      if (knock) clearTimeout(knock);
    };
  }, [change, finishing, opening, pop, lock]);

  return (
    <View style={[styles.stop, { left, top }]} pointerEvents="box-none">
      {callout && onStart ? <Callout text={callout.text} label={callout.label} tone={tone} arriving={!!change?.arriving} onPress={onStart} /> : null}
      {jump ? <Callout text={jump.text} label={label} tone={tone} arriving={false} still onPress={onPress} /> : null}
      {raised && stop.kind === 'skill' ? (
        <Ring done={stop.lessonsDone} total={stop.lessonsTotal} from={change?.ringFrom} fill={tone.fill} track={rest.line} />
      ) : finishing && change?.ringFrom !== undefined && stop.kind === 'skill' ? (
        // the ring it had as the current skill fills to the full, and goes as the stop pops
        <Ring done={stop.lessonsDone} total={stop.lessonsTotal} from={change.ringFrom} fill={tone.fill} track={rest.line} goneAt={PATH_RETURN.finishAtMs} />
      ) : null}
      <Animated.View style={[styles.lip, { top: lip, backgroundColor: look.lip, transform: [{ scale: pop }] }]} />
      <Animated.View style={[styles.popped, { transform: [{ scale: pop }] }]} pointerEvents="box-none">
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          testID={`lp-node-${jump ? 'jump' : testName(stop)}`}
          hitSlop={4}
          style={({ pressed }) => [
            styles.face,
            look.ring ? styles.faceRinged : null,
            { backgroundColor: look.face, borderColor: look.ring ?? 'transparent', transform: [{ translateY: pressed ? lip - 2 : 0 }] },
          ]}
        >
          {stop.kind === 'skill' && (stop.state === 'current' || stop.state === 'available') ? (
            opening ? (
              // the padlock it had, giving way to its number
              <>
                <Animated.View style={[styles.glyph, { opacity: lock }]}>
                  <Icon name="lock" size={30} color={look.glyph} />
                </Animated.View>
                <Animated.Text style={[styles.number, { color: look.glyph, opacity: lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
                  {stop.number}
                </Animated.Text>
              </>
            ) : (
              <Text style={[styles.number, { color: look.glyph }]}>{stop.number}</Text>
            )
          ) : finishing && look.icon === 'check' ? (
            <DrawnCheck size={30} color={look.glyph} delayMs={PATH_RETURN.finishAtMs} />
          ) : jump ? (
            // forward is the way the line is read
            <Icon name={look.icon} size={30} color={look.glyph} style={dir.flip} />
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
      </Animated.View>
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

/**
 * How far into the current skill: a ring that fills as its lessons are done,
 * from the top, clockwise. Back from a lesson it fills on from where it stood
 * (`from`) once the page has settled. A stroke along a circle is not
 * something the native driver can move, so this one short animation runs on
 * the JS thread, as the goal ring's does.
 */
function Ring({
  done,
  total,
  from,
  goneAt,
  fill,
  track,
}: {
  done: number;
  total: number;
  /** the share it fills on from, coming back from a lesson */
  from?: number;
  /** a finished skill's ring, filled, fades when its stop pops (ms into the return) */
  goneAt?: number;
  fill: string;
  track: string;
}): React.JSX.Element {
  const r = NODE / 2 + RING_GAP + RING_STROKE / 2;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const shown = useRef(new Animated.Value(from ?? share)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (from === undefined) {
      shown.setValue(share);
      return;
    }
    shown.setValue(from);
    const run = Animated.parallel([
      Animated.timing(shown, { toValue: share, duration: PATH_RETURN.ringMs, delay: PATH_RETURN.settleMs, easing: ease.emphasis, useNativeDriver: false }),
      ...(goneAt !== undefined ? [Animated.timing(opacity, { toValue: 0, duration: PATH_RETURN.popMs, delay: goneAt, useNativeDriver: false })] : []),
    ]);
    run.start();
    return () => run.stop();
  }, [from, share, goneAt, shown, opacity]);
  const offset = shown.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });
  return (
    <Animated.View style={[styles.ring, { opacity }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={RING} height={RING}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={track} strokeWidth={RING_STROKE} fill="none" />
        {share > 0 ? (
          <AnimatedCircle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={fill}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        ) : null}
      </Svg>
    </Animated.View>
  );
}

/**
 * "Start" over the current skill, bobbing gently unless the phone asks for less
 * motion — a few times as the path appears, then still. A bob that never
 * stops is something moving at the edge of the eye for as long as the screen
 * is open, long after it has said where to tap. "Jump here?" over a later
 * unit is `still` from the first: it is an offer, not the next step, and there
 * can be several on the screen at once.
 */
function Callout({
  text,
  label,
  tone,
  arriving,
  still = false,
  onPress,
}: {
  text: string;
  label: string;
  tone: ToneColors;
  /** it has just moved here from the stop before: it fades in once the rest of the path has moved */
  arriving: boolean;
  still?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const lift = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(arriving && !reduce ? 0 : 1)).current;

  useEffect(() => {
    if (reduce || still) {
      lift.setValue(0);
      shown.setValue(1);
      return;
    }
    const bob = Animated.loop(
      Animated.sequence([
        Animated.timing(lift, { toValue: -5, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(lift, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
      { iterations: BOBS },
    );
    const run = arriving ? Animated.sequence([timing(shown, 1, PATH_RETURN.bubbleMs, { delay: PATH_RETURN.bubbleAtMs }), bob]) : bob;
    run.start();
    return () => run.stop();
  }, [reduce, still, lift, shown, arriving]);

  return (
    <Animated.View style={[styles.calloutWrap, { opacity: shown, transform: [{ translateY: lift }] }]} pointerEvents="box-none">
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
  popped: { position: 'absolute', top: 0, left: 0, width: NODE, height: NODE },
  glyph: { position: 'absolute' },
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
