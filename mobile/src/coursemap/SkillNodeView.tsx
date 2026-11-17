import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import Svg, { Defs, Ellipse, RadialGradient, Stop as GradientStop } from 'react-native-svg';
import { PATH_GEOMETRY, PATH_MOTION, PATH_RETURN, PATH_STOP_ART, type PathStop, type PathStopLook, type RingChange, type UnitTone } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useDirection } from '../reports/direction';
import { springTo, timing } from '../theme/animate';
import { Icon, type IconName } from '../theme/Icon';
import { duration } from '../theme/motion';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { FACE_INK, REST, ringAt, ringOf, stopLook, type ToneColors } from './path';
import { STOP_FACE, StopArt, TOKEN_HEIGHT } from './PathWorld';
import { RoundStars, TopicRing } from './TopicRing';
import type { SkillNode } from './types';

const { node: NODE } = PATH_GEOMETRY;
/** How far the face goes down into its base under a finger (shared `PATH_STOP_ART.press`). */
const PRESS = PATH_STOP_ART.press;

type Stop = PathStop<SkillNode>;

/**
 * What coming back from a lesson changed about this stop, to show rather than
 * only draw (shared `pathChanges`, timed by `PATH_RETURN`): its ring moved on
 * (`ring`: a piece filled, or a round made whole and a star earned), finished
 * (it pops and turns gold from how it looked, `wasLook`), opened (the lock
 * gives way to its number, and it pops), the bubble's new place, or a unit's
 * prize won (its story, or its chest: it wobbles, then bursts open).
 */
export interface StopChange {
  ring?: RingChange;
  finishing?: boolean;
  wasLook?: PathStopLook;
  opening?: boolean;
  arriving?: boolean;
  unlocking?: boolean;
}

/** How far a stop swells as it pops. */
const POP = 1.12;
/** How far the current skill's pool of light swells, once, and how long after the path opens — when the page has scrolled to it. */
const PULSE = 1.08;
const PULSE_AT_MS = 700;

/**
 * One stop on the lesson path: a chunky raised disc in its unit's colour —
 * the shared drawing, its face over a darker base with one highlight — with
 * what it is said by its glyph as well as its colour: a gold coin when done,
 * with a star on it for each round of its lessons played (one to three, and a
 * small review sign once a refresh would help), the number of an open skill,
 * a padlock when closed, review's arrows. Round every skill is its ring, a
 * piece for each lesson (TopicRing): violet as they are finished in the round
 * being played, and gold all round once all three rounds are. A chapter's
 * story closes it as its prize, rolled up on stone until the chapter is done
 * and open on gold from then on (a unit without a story ends at its chest),
 * and the first skill of a later unit that can be jumped to is the gate the
 * jump goes through. Pressed, the face sinks into its base.
 *
 * The current skill stands higher, in a soft pool of its unit's light, with
 * the learner standing on it (LessonPath's LearnerToken); over them the
 * "Start" (or "Continue") flag, which opens its next lesson in one tap. The
 * whole of it bobs gently while the path is in front (`bob`), and stands
 * still for anyone who has asked their phone for less motion. Its pool of
 * light swells once as the path opens on it.
 *
 * Back from a lesson, a stop shows what the lesson did to it (`change`): the
 * ring's piece fills, a finished stop pops as it turns gold and its star
 * drops in, a round made whole on a gold stop earns the next star, an opened
 * one trades its padlock for its number with a pop and a light knock, a
 * chapter's prize wobbles and bursts open, and the flag arrives last. Under
 * Reduce Motion there is no `change`: the path is simply as it now is.
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
  // how it looked before it turned gold: drawn over the gold until the stop pops
  const was = finishing && change?.wasLook && change.wasLook !== look ? change.wasLook : null;
  // a prize won by the lesson: shut as it was until it has wobbled, then open
  const shutLook: PathStopLook = stop.kind === 'story' ? 'storyLocked' : 'chest';

  // a pop as it finishes or opens; an opened stop's padlock gives way to its number
  const pop = useRef(new Animated.Value(1)).current;
  const lock = useRef(new Animated.Value(opening ? 1 : 0)).current;
  const shut = useRef(new Animated.Value(unlocking ? 1 : 0)).current;
  const before = useRef(new Animated.Value(was ? 1 : 0)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  // a stop already on the path when the change arrives starts from how it was, from the first frame it is drawn changing
  const seen = useRef(change);
  if (seen.current !== change) {
    seen.current = change;
    lock.setValue(opening ? 1 : 0);
    shut.setValue(unlocking ? 1 : 0);
    before.setValue(was ? 1 : 0);
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
      // it turns gold as it pops
      ...(finishing ? [timing(before, 0, half, { delay: at })] : []),
    ]);
    run.start();
    const knock = opening ? setTimeout(() => haptic('tap'), at) : null;
    return () => {
      run.stop();
      if (knock) clearTimeout(knock);
    };
  }, [change, finishing, opening, unlocking, pop, lock, shut, before, wobble]);

  const glyph = glyphOf(stop, look, tone, FACE_INK[scheme]);
  const tilt = wobble.interpolate({ inputRange: [-1, 1], outputRange: [`${-PATH_MOTION.wobble}deg`, `${PATH_MOTION.wobble}deg`] });
  const lifted = rise ? { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [PATH_MOTION.rise, 0] }) }] } : null;
  // its ring, as it is now and, coming back from a lesson that moved it on, as it was
  const ring = near ? ringOf(stop) : null;
  const moved = change?.ring && stop.kind === 'skill' ? change.ring : null;
  const roundDone = !!moved && moved.to.rounds > moved.from.rounds;
  // the stars on a finished skill's coin; the one the lesson earned drops in
  const stars = stop.kind === 'skill' && stop.state === 'done' && stop.rounds > 0 ? stop.rounds : 0;

  return (
    <Animated.View style={[styles.stop, { left, top }, lifted]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, bob ? { transform: [{ translateY: bob }] } : null]} pointerEvents="box-none">
        {callout && onStart ? <Callout text={callout.text} label={callout.label} arriving={!!change?.arriving} bobbing={bobbing} onPress={onStart} /> : null}
        {jump ? <Callout text={jump.text} label={label} arriving={false} bobbing={false} onPress={onPress} /> : null}
        {raised && stop.kind === 'skill' ? <Glow fill={tone.fill} /> : null}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: pop }, { rotate: tilt }] }]} pointerEvents="none">
          {ring && stop.kind === 'skill' ? (
            <TopicRing
              // a return gives the ring a new start
              key={moved ? 'moving' : 'still'}
              ring={ring}
              from={moved ? ringAt(stop, moved.from) : null}
              roundDone={roundDone}
              locked={stop.state === 'locked'}
              mirrored={dir.rtl}
            />
          ) : null}
          {near ? <StopArt look={look} tone={unitTone} part="base" near={near} /> : <View style={[styles.plainLip, { backgroundColor: plainColour(look, tone, rest).lip }]} />}
          {opening && near ? (
            // the closed stone it was, over it until it opens
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: lock }]}>
              <StopArt look="locked" tone={unitTone} part="base" near />
            </Animated.View>
          ) : null}
          {was && near ? (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: before }]}>
              <StopArt look={was} tone={unitTone} part="base" near />
            </Animated.View>
          ) : null}
          {unlocking && near ? (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: shut }]}>
              <StopArt look={shutLook} tone={unitTone} part="base" near />
            </Animated.View>
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
                  <StopArt look={look} tone={unitTone} part="face" near />
                  <Animated.View style={[StyleSheet.absoluteFill, { opacity: shut }]}>
                    <StopArt look={shutLook} tone={unitTone} part="face" near />
                  </Animated.View>
                </>
              ) : opening ? (
                <>
                  <StopArt look={look} tone={unitTone} part="face" near />
                  <Animated.View style={[StyleSheet.absoluteFill, { opacity: lock }]}>
                    <StopArt look="locked" tone={unitTone} part="face" near />
                  </Animated.View>
                </>
              ) : was ? (
                <>
                  <StopArt look={look} tone={unitTone} part="face" near />
                  <Animated.View style={[StyleSheet.absoluteFill, { opacity: before }]}>
                    <StopArt look={was} tone={unitTone} part="face" near />
                  </Animated.View>
                </>
              ) : (
                <StopArt look={look} tone={unitTone} part="face" near />
              )
            ) : (
              <View style={[styles.plainFace, { backgroundColor: plainColour(look, tone, rest).face }]} />
            )}
            {opening && !glyph ? (
              // the stop to do now: its padlock goes, and the learner arrives on it
              <Animated.View style={[styles.glyph, { opacity: lock }]} pointerEvents="none">
                <Icon name="lock" size={26} color={FACE_INK[scheme].stone} />
              </Animated.View>
            ) : null}
            {stars > 0 ? <RoundStars rounds={stars} earned={roundDone} /> : null}
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

/**
 * The glyph on a stop's face, by what it is: a skill's number or padlock,
 * review's arrows. A finished skill's coin carries its stars instead (one for
 * each round played; a check only on a map too old to count them), the
 * current skill the learner standing on it, and the drawn stops their own.
 */
function glyphOf(stop: Stop, look: string, tone: ToneColors, ink: (typeof FACE_INK)['dark']): { icon?: IconName; number?: number; colour: string } | null {
  if (stop.kind === 'review') return { icon: 'review', colour: ink.paper(tone) };
  if (stop.kind !== 'skill' || look === 'jump') return null;
  switch (stop.state) {
    // cream on a finished stop's gold, whatever the chapter: what was earned looks the same everywhere
    case 'done':
      return stop.rounds > 0 ? null : { icon: 'check', colour: DONE_INK };
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
  if (look === 'done' || look === 'strong' || look === 'refresh' || look === 'story') return { face: GOLD_TOKEN.face, lip: GOLD_TOKEN.lip };
  if (look === 'current') return { face: tone.fill, lip: tone.lip };
  return { face: rest.fill, lip: rest.lip };
}

/** A finished stop's gold token and its glyph (shared art/path-land.ts), for a stop drawn plain while far from the screen. */
const GOLD_TOKEN = { face: '#e9a93b', lip: '#b8781f' } as const;
const DONE_INK = '#fffaf0';

/** A stable name per kind of stop, for tests and for the screenshots that check the path. */
function testName(stop: Stop): string {
  if (stop.kind !== 'skill') return stop.kind;
  return stop.state;
}

/** The soft pool of the unit's light the current skill stands in. */
const GLOW = { rx: 66, ry: 32 } as const;

/**
 * The soft pool of its unit's light the current skill stands in, which swells
 * once as the path opens on it, so the eye finds it. Opacity and scale only,
 * on the native driver, and still under Reduce Motion.
 */
function Glow({ fill }: { fill: string }): React.JSX.Element {
  const reduce = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.sequence([Animated.delay(PULSE_AT_MS), timing(pulse, PULSE + 0.06, duration.quick + 40), springTo(pulse, 1, 'bouncy')]);
    run.start();
    return () => run.stop();
    // once, as it is first drawn
  }, []);
  return (
    <Animated.View style={[styles.glow, { transform: [{ scale: pulse }] }]} pointerEvents="none">
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
  arriving,
  bobbing,
  onPress,
}: {
  text: string;
  label: string;
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
  // by day the valley's ink with cream words; by evening a cream pill with the ink
  const pill = scheme === 'dark' ? { face: '#fffaf0', edge: '#d6c7a6', words: '#3d2a1f' } : { face: '#3d2a1f', edge: '#24170f', words: '#fffaf0' };
  return (
    <Animated.View style={[styles.calloutWrap, { opacity: shown }]} pointerEvents="box-none" testID={bobbing ? 'lp-callout-bobbing' : undefined}>
      <View style={[styles.calloutLip, { backgroundColor: pill.edge }]}>
        <PressableScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={[styles.callout, { backgroundColor: pill.face }]}>
          <Text style={[styles.calloutText, { color: pill.words }]}>{text}</Text>
        </PressableScale>
      </View>
      <View style={[styles.calloutTip, { backgroundColor: pill.face }]} />
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
  calloutWrap: {
    position: 'absolute',
    // over the learner standing on the stop: the face's middle, less the token, less a little air
    bottom: STOP_HEIGHT - STOP_FACE.y + TOKEN_HEIGHT + 6 + spacing.xs,
    left: (NODE - CALLOUT_WIDTH) / 2,
    width: CALLOUT_WIDTH,
    alignItems: 'center',
  },
  calloutLip: { borderRadius: radii.pill, paddingBottom: 3 },
  callout: {
    minHeight: 38,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutText: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  calloutTip: {
    width: 12,
    height: 12,
    marginTop: -9,
    transform: [{ rotate: '45deg' }],
  },
});
