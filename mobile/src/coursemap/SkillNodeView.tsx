import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop as GradientStop } from 'react-native-svg';
import { PATH_GEOMETRY, PATH_MOTION, PATH_RETURN, PATH_STOP_ART, type PathStop, type UnitTone } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useDirection } from '../reports/direction';
import { ease, springTo, timing } from '../theme/animate';
import { Icon, type IconName } from '../theme/Icon';
import { duration } from '../theme/motion';
import { DrawnCheck, PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { FACE_INK, REST, stopLook, type ToneColors } from './path';
import { STOP_FACE, StopArt, TOKEN_HEIGHT } from './PathWorld';
import type { SkillNode } from './types';

const { node: NODE } = PATH_GEOMETRY;
/** How far the face goes down into its base under a finger (shared `PATH_STOP_ART.press`). */
const PRESS = PATH_STOP_ART.press;

type Stop = PathStop<SkillNode>;

/**
 * What coming back from a lesson changed about this stop, to show rather than
 * only draw (shared `pathChanges`, timed by `PATH_RETURN`): its ring filled
 * on from `ringFrom`, finished (it pops and its check draws in), opened (the
 * lock gives way to its number, and it pops), the bubble's new place, or a
 * unit's chest earned (it wobbles, then bursts open).
 */
export interface StopChange {
  ringFrom?: number;
  finishing?: boolean;
  opening?: boolean;
  arriving?: boolean;
  unlocking?: boolean;
}

/** How far a stop swells as it pops. */
const POP = 1.12;
/** How far the current skill's ring swells, once, and how long after the path opens — when the page has scrolled to it. */
const PULSE = 1.08;
const PULSE_AT_MS = 700;

/**
 * One stop on the lesson path: a chunky raised disc in its unit's colour —
 * the shared drawing, its face over a darker base with one highlight — with
 * what it is said by its glyph as well as its colour: a check when done (a
 * star with a gold rim once strong, a small review sign once a refresh would
 * help), the number of an open skill, a padlock when closed, review's arrows.
 * The guide is an open book, the unit's end its chest (open once earned), and
 * the first skill of a later unit that can be jumped to is the gate the jump
 * goes through. Pressed, the face sinks into its base.
 *
 * The current skill stands higher, in a soft pool of its unit's light, with
 * a ring for its lessons round its foot and the learner standing on it
 * (LessonPath's LearnerToken); over them the "Start" (or "Continue") flag,
 * which opens its next lesson in one tap. The whole of it bobs gently while
 * the path is in front (`bob`), and stands still for anyone who has asked
 * their phone for less motion. Its ring swells once as the path opens on it.
 *
 * Back from a lesson, a stop shows what the lesson did to it (`change`): the
 * ring fills on, a finished stop pops as its check draws in, an opened one
 * trades its padlock for its number with a pop and a light knock, a unit's
 * chest wobbles and bursts open, and the flag arrives last. Under Reduce
 * Motion there is no `change`: the path is simply as it now is.
 */
export function SkillNodeView({
  stop,
  left,
  top,
  tone,
  unitTone,
  label,
  callout,
  change,
  jump,
  near = true,
  bob = null,
  bobbing = false,
  rise = null,
  onPress,
  onStart,
}: {
  stop: Stop;
  /** where the stop's round sits in its unit's path, in points */
  left: number;
  top: number;
  tone: ToneColors;
  /** the unit's colour by name, for the shared drawing */
  unitTone: UnitTone;
  /** everything the stop is, for a screen reader */
  label: string;
  /** the word over the current skill, and what a screen reader says for it */
  callout?: { text: string; label: string };
  /** what coming back from a lesson changed here, played once */
  change?: StopChange | null;
  /** the first stop of a unit that can be jumped to, and the words over it */
  jump?: { text: string };
  /** drawn in full; a stop far from the screen is a plain round in its colour */
  near?: boolean;
  /** the current stop's bob, shared with the learner standing on it */
  bob?: Animated.Value | null;
  /** the bob is running (for a test to tell a stop that moves from one that stands still) */
  bobbing?: boolean;
  /** its rise as its unit first comes into view: 0 under the ground, 1 in place */
  rise?: Animated.AnimatedInterpolation<number> | null;
  onPress: () => void;
  onStart?: () => void;
}): React.JSX.Element {
  const { scheme } = useTheme();
  const dir = useDirection();
  const rest = REST[scheme];
  const look = stopLook(stop, !!jump);
  const raised = stop.kind === 'skill' && stop.state === 'current';
  const finishing = !!change?.finishing;
  const opening = !!change?.opening;
  const unlocking = !!change?.unlocking;

  // a pop as it finishes or opens; an opened stop's padlock gives way to its number
  const pop = useRef(new Animated.Value(1)).current;
  const lock = useRef(new Animated.Value(opening ? 1 : 0)).current;
  // a chest earned: shut until it has wobbled, then open
  const shut = useRef(new Animated.Value(unlocking ? 1 : 0)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  // a stop already on the path when the change arrives starts from its padlock, from the first frame it is drawn opening
  const seen = useRef(change);
  if (seen.current !== change) {
    seen.current = change;
    lock.setValue(opening ? 1 : 0);
    shut.setValue(unlocking ? 1 : 0);
  }
  useEffect(() => {
    if (!finishing && !opening && !unlocking) return;
    const half = PATH_RETURN.popMs / 2;
    if (unlocking) {
      const at = PATH_MOTION.wobbleAtMs;
      const step = PATH_MOTION.wobbleMs / 6;
      const run = Animated.sequence([
        Animated.delay(at),
        ...[1, -1, 0.8, -0.6, 0.3, 0].map((v) => timing(wobble, v, step)),
        Animated.parallel([timing(shut, 0, 80), Animated.sequence([timing(pop, POP + 0.06, half), springTo(pop, 1, 'bouncy')])]),
      ]);
      run.start();
      const knock = setTimeout(() => haptic('celebrate'), at + PATH_MOTION.wobbleMs);
      return () => {
        run.stop();
        clearTimeout(knock);
      };
    }
    const at = finishing ? PATH_RETURN.finishAtMs : PATH_RETURN.openAtMs;
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
  }, [change, finishing, opening, unlocking, pop, lock, shut, wobble]);

  const glyph = glyphOf(stop, look, tone, FACE_INK[scheme]);
  const tilt = wobble.interpolate({ inputRange: [-1, 1], outputRange: [`${-PATH_MOTION.wobble}deg`, `${PATH_MOTION.wobble}deg`] });
  const lifted = rise ? { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [PATH_MOTION.rise, 0] }) }] } : null;

  return (
    <Animated.View style={[styles.stop, { left, top }, lifted]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, bob ? { transform: [{ translateY: bob }] } : null]} pointerEvents="box-none">
        {callout && onStart ? <Callout text={callout.text} label={callout.label} tone={tone} arriving={!!change?.arriving} bobbing={bobbing} onPress={onStart} /> : null}
        {jump ? <Callout text={jump.text} label={label} tone={tone} arriving={false} bobbing={false} onPress={onPress} /> : null}
        {raised && stop.kind === 'skill' ? <Progress done={stop.lessonsDone} total={stop.lessonsTotal} from={change?.ringFrom} fill={tone.fill} lights={false} /> : null}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: pop }, { rotate: tilt }] }]} pointerEvents="none">
          {near ? <StopArt look={look} tone={unitTone} part="base" near={near} /> : <View style={[styles.plainLip, { backgroundColor: plainColour(look, tone, rest).lip }]} />}
          {raised && stop.kind === 'skill' ? <Progress done={stop.lessonsDone} total={stop.lessonsTotal} from={change?.ringFrom} fill={tone.fill} glow={false} /> : null}
          {finishing && change?.ringFrom !== undefined && stop.kind === 'skill' ? (
            // the lights it had as the current skill come on to the full, and go as the stop pops
            <Progress done={stop.lessonsDone} total={stop.lessonsTotal} from={change.ringFrom} fill={tone.fill} goneAt={PATH_RETURN.finishAtMs} glow={false} />
          ) : null}
        </Animated.View>
        <Animated.View style={[styles.popped, { transform: [{ scale: pop }, { rotate: tilt }] }]} pointerEvents="box-none">
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            testID={`lp-node-${jump ? 'jump' : testName(stop)}`}
            hitSlop={4}
            style={({ pressed }) => [styles.face, { transform: [{ translateY: pressed ? PRESS : 0 }] }]}
          >
            {near ? (
              unlocking ? (
                <>
                  <StopArt look="chestOpen" tone={unitTone} part="face" near />
                  <Animated.View style={[StyleSheet.absoluteFill, { opacity: shut }]}>
                    <StopArt look="chest" tone={unitTone} part="face" near />
                  </Animated.View>
                </>
              ) : (
                <StopArt look={look} tone={unitTone} part="face" near />
              )
            ) : (
              <View style={[styles.plainFace, { backgroundColor: plainColour(look, tone, rest).face }]} />
            )}
            {glyph ? (
              <View style={styles.glyph} pointerEvents="none">
                {stop.kind === 'skill' && stop.state === 'available' && opening ? (
                  // the padlock it had, giving way to its number
                  <>
                    <Animated.View style={[styles.glyphLayer, { opacity: lock }]}>
                      <Icon name="lock" size={26} color={FACE_INK[scheme].stone} />
                    </Animated.View>
                    <Animated.Text style={[styles.number, { color: glyph.colour, opacity: lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
                      {stop.number}
                    </Animated.Text>
                  </>
                ) : glyph.number !== undefined ? (
                  <Text style={[styles.number, { color: glyph.colour }]}>{glyph.number}</Text>
                ) : finishing && glyph.icon === 'check' ? (
                  <DrawnCheck size={28} color={glyph.colour} delayMs={PATH_RETURN.finishAtMs} />
                ) : glyph.icon ? (
                  <Icon name={glyph.icon} size={28} color={glyph.colour} style={glyph.icon === 'skip-forward' ? dir.flip : undefined} />
                ) : null}
              </View>
            ) : null}
            {stop.kind === 'skill' && stop.finish === 'refresh' ? (
              <View style={[styles.badge, { backgroundColor: tone.ink === '#ffffff' ? '#ffffff' : '#fbf5e6', borderColor: tone.fill }]} pointerEvents="none">
                <Icon name="review" size={14} color={tone.text} />
              </View>
            ) : null}
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/** The glyph on a stop's face, by what it is: a skill's check, star, number or padlock, review's arrows; the drawn stops carry their own. */
function glyphOf(stop: Stop, look: string, tone: ToneColors, ink: (typeof FACE_INK)['dark']): { icon?: IconName; number?: number; colour: string } | null {
  if (stop.kind === 'review') return { icon: 'review', colour: ink.paper(tone) };
  if (stop.kind !== 'skill' || look === 'jump') return null;
  switch (stop.state) {
    case 'done':
      return { icon: stop.finish === 'strong' ? 'star-fill' : 'check', colour: tone.ink };
    // the learner stands on the current skill: their picture is its glyph
    case 'current':
      return null;
    case 'available':
      return { number: stop.number, colour: ink.paper(tone) };
    case 'locked':
      return { icon: 'lock', colour: ink.stone };
  }
}

/** A stop far from the screen, drawn as a plain round in the colour its drawing has. */
function plainColour(look: string, tone: ToneColors, rest: (typeof REST)['dark']): { face: string; lip: string } {
  if (look === 'done' || look === 'strong' || look === 'current' || look === 'refresh') return { face: tone.fill, lip: tone.lip };
  return { face: rest.fill, lip: rest.lip };
}

/** A stable name per kind of stop, for tests and for the screenshots that check the path. */
function testName(stop: Stop): string {
  if (stop.kind !== 'skill') return stop.kind;
  return stop.state;
}

/** The soft pool of the unit's light the current skill stands in. */
const GLOW = { rx: 66, ry: 32 } as const;
/** The lights along the disc's side, one for each of its lessons: how big, and how far apart at most. */
const PIP = { size: 8, gap: 13, most: 8 } as const;

/**
 * How far into the current skill: a light along the front of the disc's side
 * for each of its lessons, lit in gold as each is done — read at a glance,
 * like a board game's counters — and under it the soft pool of its unit's
 * light, which swells once as the path opens on it. Back from a lesson the
 * lights come on from where they stood (`from`) once the page has settled; a
 * skill just finished keeps them, full, until its stop pops (`goneAt`).
 * Opacity and scale only, on the native driver.
 */
function Progress({
  done,
  total,
  from,
  goneAt,
  fill,
  glow = true,
  lights = true,
}: {
  done: number;
  total: number;
  /** the share it fills on from, coming back from a lesson */
  from?: number;
  /** a finished skill's lights, full, go when its stop pops (ms into the return) */
  goneAt?: number;
  fill: string;
  /** the pool of light under the stop, drawn behind its base */
  glow?: boolean;
  /** the lights along its side, drawn over its base */
  lights?: boolean;
}): React.JSX.Element {
  const { colors, scheme } = useTheme();
  const share = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  const reduce = useReducedMotion();
  const shown = useRef(new Animated.Value(from ?? share)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (from !== undefined || reduce) return;
    const run = Animated.sequence([Animated.delay(PULSE_AT_MS), timing(pulse, PULSE + 0.06, duration.quick + 40), springTo(pulse, 1, 'bouncy')]);
    run.start();
    return () => run.stop();
    // once, as it is first drawn
  }, []);
  useEffect(() => {
    if (from === undefined) {
      shown.setValue(share);
      return;
    }
    shown.setValue(from);
    const run = Animated.parallel([
      timing(shown, share, PATH_RETURN.ringMs, { delay: PATH_RETURN.settleMs, easing: ease.emphasis }),
      ...(goneAt !== undefined ? [timing(opacity, 0, PATH_RETURN.popMs, { delay: goneAt })] : []),
    ]);
    run.start();
    return () => run.stop();
  }, [from, share, goneAt, shown, opacity]);
  const count = Math.min(total, PIP.most);
  const gap = count > 1 ? Math.min(PIP.gap, (2 * PATH_STOP_ART.rx - 22) / (count - 1)) : 0;
  const side = PATH_STOP_ART.raised;
  const unlit = scheme === 'dark' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.3)';
  const outline = scheme === 'dark' ? '#3a2016' : '#4a2a1a';
  return (
    <>
      {glow ? (
        <Animated.View style={[styles.glow, { opacity, transform: [{ scale: pulse }] }]} pointerEvents="none">
          <Svg width={2 * GLOW.rx} height={2 * GLOW.ry}>
            <Defs>
              <RadialGradient id="lpGlow" cx="50%" cy="50%" r="50%">
                <GradientStop offset="0" stopColor={fill} stopOpacity={0.6} />
                <GradientStop offset="0.55" stopColor={fill} stopOpacity={0.28} />
                <GradientStop offset="1" stopColor={fill} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={GLOW.rx} cy={GLOW.ry} rx={GLOW.rx} ry={GLOW.ry} fill="url(#lpGlow)" />
          </Svg>
        </Animated.View>
      ) : null}
      {lights && count > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none" aria-hidden testID="lp-lights">
          {Array.from({ length: count }, (_, k) => {
            const dx = (k - (count - 1) / 2) * gap;
            const y = STOP_FACE.y + PATH_STOP_ART.ry * Math.sqrt(Math.max(0, 1 - (dx / PATH_STOP_ART.rx) ** 2)) + side / 2;
            const at = { left: STOP_FACE.x + dx - PIP.size / 2, top: y - PIP.size / 2 };
            const lit = shown.interpolate({ inputRange: [k / count, (k + 1) / count], outputRange: [0, 1], extrapolate: 'clamp' });
            return (
              <View key={k} style={[styles.pip, at, { backgroundColor: unlit, borderColor: outline }]}>
                <Animated.View style={[styles.pipLit, { backgroundColor: colors.gold, opacity: lit }]} />
              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </>
  );
}

/**
 * "Start" over the current skill, over the learner standing on it: a chunky
 * flag in the unit's colour on its darker lip, outlined like the stops. It
 * moves with the stop's bob (`bobbing` says so, for a test), which stops the
 * moment the screen is not the one in view, the app is not in front, or the
 * phone asks for less motion. It gives under the finger as every button
 * does. "Jump here?" over a later unit stands over the gate, still, from the
 * first: it is an offer, not the next step.
 */
function Callout({
  text,
  label,
  tone,
  arriving,
  bobbing,
  onPress,
}: {
  text: string;
  label: string;
  tone: ToneColors;
  /** it has just moved here from the stop before: it fades in once the rest of the path has moved */
  arriving: boolean;
  bobbing: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const shown = useRef(new Animated.Value(arriving && !reduce ? 0 : 1)).current;
  useEffect(() => {
    if (reduce || !arriving) {
      shown.setValue(1);
      return;
    }
    const run = timing(shown, 1, PATH_RETURN.bubbleMs, { delay: PATH_RETURN.bubbleAtMs });
    run.start();
    return () => run.stop();
  }, [reduce, arriving, shown]);
  const outline = scheme === 'dark' ? '#3a2016' : '#4a2a1a';
  return (
    <Animated.View style={[styles.calloutWrap, { opacity: shown }]} pointerEvents="box-none" testID={bobbing ? 'lp-callout-bobbing' : undefined}>
      <View style={[styles.calloutLip, { backgroundColor: tone.lip, borderColor: outline }]}>
        <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={[styles.callout, { backgroundColor: tone.fill, borderColor: outline }]}>
          <Text style={[styles.calloutText, { color: tone.ink }]}>{text}</Text>
        </PressableScale>
      </View>
      <View style={[styles.calloutTip, { backgroundColor: tone.lip, borderColor: outline }]} />
    </Animated.View>
  );
}

const CALLOUT_WIDTH = 200;
const STOP_HEIGHT = NODE + PATH_STOP_ART.raised;

const styles = StyleSheet.create({
  stop: { position: 'absolute', width: NODE, height: STOP_HEIGHT },
  popped: { position: 'absolute', top: 0, left: 0, width: NODE, height: NODE },
  face: { position: 'absolute', top: 0, left: 0, width: NODE, height: NODE },
  plainFace: {
    position: 'absolute',
    left: STOP_FACE.x - PATH_STOP_ART.rx,
    top: STOP_FACE.y - PATH_STOP_ART.ry,
    width: 2 * PATH_STOP_ART.rx,
    height: 2 * PATH_STOP_ART.ry,
    borderRadius: radii.pill,
  },
  plainLip: {
    position: 'absolute',
    left: STOP_FACE.x - PATH_STOP_ART.rx,
    top: STOP_FACE.y - PATH_STOP_ART.ry + PATH_STOP_ART.side,
    width: 2 * PATH_STOP_ART.rx,
    height: 2 * PATH_STOP_ART.ry,
    borderRadius: radii.pill,
  },
  glyph: {
    position: 'absolute',
    left: 0,
    width: NODE,
    top: STOP_FACE.y - PATH_STOP_ART.ry,
    height: 2 * PATH_STOP_ART.ry,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphLayer: { position: 'absolute' },
  number: { fontSize: typography.sizes.xl, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
  badge: {
    position: 'absolute',
    top: STOP_FACE.y - PATH_STOP_ART.ry - 8,
    end: -6,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: { position: 'absolute', left: STOP_FACE.x - GLOW.rx, top: STOP_FACE.y + PATH_STOP_ART.raised + 4 - GLOW.ry },
  pip: { position: 'absolute', width: PIP.size, height: PIP.size, borderRadius: radii.pill, borderWidth: 1.5, overflow: 'hidden' },
  pipLit: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  calloutWrap: {
    position: 'absolute',
    // over the learner standing on the stop: the face's middle, less the token, less a little air
    bottom: STOP_HEIGHT - STOP_FACE.y + TOKEN_HEIGHT + 6 + spacing.xs,
    left: (NODE - CALLOUT_WIDTH) / 2,
    width: CALLOUT_WIDTH,
    alignItems: 'center',
  },
  calloutLip: { borderRadius: radii.md, borderWidth: 2, paddingBottom: 4 },
  callout: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md - 2,
    borderBottomWidth: 2,
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
    marginTop: -8,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
});
