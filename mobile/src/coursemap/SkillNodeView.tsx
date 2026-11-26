import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop as GradientStop } from 'react-native-svg';
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
import { STOP_FACE, StopArt } from './PathWorld';
import { RoundStars, TopicRing } from './TopicRing';
import type { SkillNode } from './types';

const { node: NODE } = PATH_GEOMETRY;
/** How far the face sinks into its base when pressed (shared `PATH_STOP_ART.press`). */
const PRESS = PATH_STOP_ART.press;

type Stop = PathStop<SkillNode>;

/**
 * What a return from a lesson changed about this stop (shared `pathChanges`, timed by `PATH_RETURN`): its ring
 * moved on (`ring`), it finished and turns gold from `wasLook`, it opened, the bubble moved here, or a unit's prize
 * was won.
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
/** How far the current skill's glow swells, once, and how long after the path opens, when the page has scrolled to it. */
const PULSE = 1.08;
const PULSE_AT_MS = 700;

/**
 * One stop on the lesson path: a raised disc in its unit's colour (shared drawing) whose glyph says what it is, a
 * gold coin with one to three stars when done, a number when open, a padlock when locked, arrows for review. Skills
 * wear a ring with one piece per lesson (TopicRing). A chapter ends at its story, and a jumpable unit's first stop
 * is drawn as a gate. Pressed, the face sinks into its base.
 *
 * The current skill is the road's main button: it stands higher in a glow of its unit's colour, breathes out a ring of
 * it, wears a star and its ring in that colour, and a bubble of the course's own words floats above it; now and then a
 * glint sweeps it and sparks wink on it. It bobs while the path is in view, and every stop squishes under a finger.
 * None of it moves under Reduce Motion.
 *
 * After a lesson, `change` animates what it did to the stop: the ring fills, the stop pops and turns gold, a star
 * drops in, a padlock gives way to a number, a prize bursts open, and the flag arrives last. Under Reduce Motion
 * there is no `change`.
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
  expanded,
  onPress,
  onStart,
}: {
  stop: Stop;
  /** The stop's position across its unit's path, in points. */
  left: number;
  top: number;
  tone: ToneColors;
  /** The unit's colour by name, for the shared drawing. */
  unitTone: UnitTone;
  /** The stop's full screen-reader label. */
  label: string;
  /** The bubble's words over the current skill, in the course's own language, and its screen-reader label. */
  callout?: { text: string; label: string };
  /** What a return from a lesson changed here, played once. */
  change?: StopChange | null;
  /** The flag text over the first stop of a unit that can be jumped to. */
  jump?: { text: string };
  /** Drawn in full; far from the screen it is a plain round in its colour. */
  near?: boolean;
  /** The current stop's bob. */
  bob?: Animated.Value | null;
  /** Whether the bob is running, so tests can tell. */
  bobbing?: boolean;
  /** Its rise as its unit first comes into view: 0 under the ground, 1 in place. */
  rise?: Animated.AnimatedInterpolation<number> | null;
  /** Whether its card is open under it; undefined where a press opens something else. */
  expanded?: boolean;
  onPress: () => void;
  onStart?: () => void;
}): React.JSX.Element {
  const { scheme, colors } = useTheme();
  const dir = useDirection();
  const rest = REST[scheme];
  const look = stopLook(stop, !!jump);
  const raised = stop.kind === 'skill' && stop.state === 'current';
  const finishing = !!change?.finishing;
  const opening = !!change?.opening;
  const unlocking = !!change?.unlocking;
  // Its look before turning gold, drawn over the gold until the stop pops.
  const was = finishing && change?.wasLook && change.wasLook !== look ? change.wasLook : null;
  // A prize won by the lesson stays shut until it has wobbled, then opens.
  const shutLook: PathStopLook = stop.kind === 'story' ? 'storyLocked' : 'chest';

  // A pop as it finishes or opens; an opened stop's padlock gives way to its number.
  const pop = useRef(new Animated.Value(1)).current;
  const lock = useRef(new Animated.Value(opening ? 1 : 0)).current;
  const shut = useRef(new Animated.Value(unlocking ? 1 : 0)).current;
  const before = useRef(new Animated.Value(was ? 1 : 0)).current;
  const wobble = useRef(new Animated.Value(0)).current;
  // A stop already drawn when the change arrives starts from its old look, from the first frame.
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
      // It turns gold as it pops.
      ...(finishing ? [timing(before, 0, half, { delay: at })] : []),
    ]);
    run.start();
    const knock = opening ? setTimeout(() => haptic('tap'), at) : null;
    return () => {
      run.stop();
      if (knock) clearTimeout(knock);
    };
  }, [change, finishing, opening, unlocking, pop, lock, shut, before, wobble]);

  const glyph = glyphOf(stop, look, tone, FACE_INK[scheme], tone.ink);
  const squish = useSquish();
  const tilt = wobble.interpolate({ inputRange: [-1, 1], outputRange: [`${-PATH_MOTION.wobble}deg`, `${PATH_MOTION.wobble}deg`] });
  const lifted = rise ? { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [PATH_MOTION.rise, 0] }) }] } : null;
  // Its ring now, and as it was before a lesson that moved it on.
  const ring = near ? ringOf(stop) : null;
  const moved = change?.ring && stop.kind === 'skill' ? change.ring : null;
  const roundDone = !!moved && moved.to.rounds > moved.from.rounds;
  // The stars on a finished skill's coin; the one this lesson earned drops in.
  const stars = stop.kind === 'skill' && stop.state === 'done' && stop.rounds > 0 ? stop.rounds : 0;

  return (
    <Animated.View style={[styles.stop, { left, top }, lifted]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, bob ? { transform: [{ translateY: bob }] } : null]} pointerEvents="box-none">
        {callout && onStart ? (
          <Callout text={callout.text} label={callout.label} tone={tone} arriving={!!change?.arriving} bobbing={bobbing} onPress={onStart} />
        ) : null}
        {jump ? <Callout text={jump.text} label={label} tone={tone} arriving={false} bobbing={false} onPress={onPress} /> : null}
        {raised && stop.kind === 'skill' ? <Glow fill={tone.fill} live={bobbing} /> : null}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: pop }, { rotate: tilt }] }]} pointerEvents="none">
          {/* The ring is the topic in hand: the one to do now, or one a return is filling. */}
          {ring && stop.kind === 'skill' && (raised || moved) ? (
            <TopicRing
              // A return remounts the ring so it starts again.
              key={moved ? 'moving' : 'still'}
              ring={ring}
              from={moved ? ringAt(stop, moved.from) : null}
              roundDone={roundDone}
              tint={raised ? tone.fill : undefined}
              mirrored={dir.rtl}
            />
          ) : null}
          {near ? <StopArt look={look} tone={unitTone} part="base" near={near} /> : <View style={[styles.plainLip, { backgroundColor: plainColour(look, tone, rest).lip }]} />}
          {opening && near ? (
            // The locked stone it was, over it until it opens.
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
            accessibilityState={expanded === undefined ? undefined : { expanded }}
            testID={`lp-node-${jump ? 'jump' : testName(stop)}`}
            hitSlop={4}
            onPressIn={squish.onPressIn}
            onPressOut={squish.onPressOut}
            style={styles.face}
          >
            <Animated.View style={[StyleSheet.absoluteFill, squish.style]}>
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
              // The current stop: its padlock goes and the learner arrives on it.
              <Animated.View style={[styles.glyph, { opacity: lock }]} pointerEvents="none">
                <Icon name="lock" size={26} color={FACE_INK[scheme].stone} />
              </Animated.View>
            ) : null}
            {raised && near ? <Shine /> : null}
            {stars > 0 ? <RoundStars rounds={stars} earned={roundDone} /> : null}
            {glyph ? (
              <View style={styles.glyph} pointerEvents="none">
                {stop.kind === 'skill' && stop.state === 'available' && opening ? (
                  // The padlock it had, giving way to its number.
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
              <View style={[styles.badge, { backgroundColor: colors.background, borderColor: tone.fill }]} pointerEvents="none">
                <Icon name="review" size={14} color={tone.text} />
              </View>
            ) : null}
            </Animated.View>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * The glyph on a stop's face: a skill's number or padlock, or review's arrows. A finished coin carries its stars
 * instead (a check only on a map too old to count them), the current skill a star in its unit's ink, and
 * the drawn stops carry their own.
 */
function glyphOf(stop: Stop, look: string, tone: ToneColors, ink: (typeof FACE_INK)['dark'], onNow: string): { icon?: IconName; number?: number; colour: string } | null {
  if (stop.kind === 'review') return { icon: 'review', colour: ink.paper(tone) };
  if (stop.kind !== 'skill' || look === 'jump') return null;
  switch (stop.state) {
    // Cream on gold in every chapter, so what was earned looks the same everywhere.
    case 'done':
      return stop.rounds > 0 ? null : { icon: 'check', colour: DONE_INK };
    case 'current':
      return { icon: 'star-fill', colour: onNow };
    case 'available':
      return { number: stop.number, colour: ink.paper(tone) };
    case 'locked':
      return { icon: 'lock', colour: ink.stone };
  }
}

/** A stop far from the screen, as a plain round in its drawing's colour. */
function plainColour(look: string, tone: ToneColors, rest: (typeof REST)['dark']): { face: string; lip: string } {
  if (look === 'done' || look === 'strong' || look === 'refresh' || look === 'story') return { face: GOLD_TOKEN.face, lip: GOLD_TOKEN.lip };
  if (look === 'current' || look === 'available' || look === 'review' || look === 'jump') return { face: tone.fill, lip: tone.lip };
  return { face: rest.fill, lip: rest.lip };
}

/** A finished stop's gold and glyph colours (shared art/path-land.ts), for drawing it plain. */
const GOLD_TOKEN = { face: '#e9a93b', lip: '#b8781f' } as const;
const DONE_INK = '#fffaf0';

/** A stable name per kind of stop, for tests and the screenshots that check the path. */
function testName(stop: Stop): string {
  if (stop.kind !== 'skill') return stop.kind;
  return stop.state;
}

/** The stop's face in its 72-point button (shared PATH_STOP_ART: radii 36 by 31 about `STOP_FACE`). */
const FACE = { left: STOP_FACE.x - 36, top: STOP_FACE.y - 31, width: 72, height: 62 } as const;
/** How often the glint crosses the stop to do now, how long it takes, and where its sparks wink after it. */
const GLINT = { everyMs: 3600, crossMs: 1300, firstMs: 1000 } as const;
const SPARKS = [
  { x: 22, y: 18, size: 11, at: 500 },
  { x: 46, y: 24, size: 8, at: 700 },
  { x: 36, y: 40, size: 7, at: 900 },
] as const;
/** A four-pointed spark, 10 units square. */
const SPARK_PATH = 'M5 0L6.1 3.9L10 5L6.1 6.1L5 10L3.9 6.1L0 5L3.9 3.9Z';

/**
 * Now and then a glint of light sweeps the face of the stop to do now, and a few sparks wink on it after, as on the
 * website. Native driver; none of it under Reduce Motion.
 */
function Shine(): React.JSX.Element | null {
  const reduce = useReducedMotion();
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.loop(
      Animated.sequence([timing(sweep, 1, GLINT.crossMs), Animated.delay(GLINT.everyMs - GLINT.crossMs), timing(sweep, 0, 0)]),
    );
    const start = setTimeout(() => run.start(), GLINT.firstMs);
    return () => {
      clearTimeout(start);
      run.stop();
    };
  }, [reduce, sweep]);
  if (reduce) return null;
  const crossAt = GLINT.crossMs / GLINT.everyMs;
  return (
    <View style={[styles.shine, FACE]} pointerEvents="none">
      <Animated.View
        style={[
          styles.glint,
          { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-48, FACE.width + 24] }) }, { rotate: '20deg' }] },
        ]}
      />
      {SPARKS.map((spark) => {
        // Each spark grows and goes in a moment after the glint has passed.
        const at = Math.min(0.99, crossAt * (spark.at / GLINT.crossMs) + crossAt * 0.4);
        const scale = sweep.interpolate({ inputRange: [0, at, at + 0.04, at + 0.1, 1], outputRange: [0, 0, 1, 0, 0], extrapolate: 'clamp' });
        return (
          <Animated.View key={`${spark.x}-${spark.y}`} style={[styles.spark, { left: spark.x - spark.size / 2, top: spark.y - spark.size / 2, transform: [{ scale }] }]}>
            <Svg width={spark.size} height={spark.size} viewBox="0 0 10 10">
              <Path d={SPARK_PATH} fill="#ffffff" />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

/** The size of the glow the current skill stands in, and of the ring it breathes out. */
const GLOW = { rx: 66, ry: 32 } as const;
const BREATH = { everyMs: 2200, grow: 0.6 } as const;

/**
 * The glow under the current skill in its unit's colour, which swells once as the path opens so the eye finds it, and
 * a ring of the same colour the stop breathes out, over and over, while the path is in view. Native driver; still
 * under Reduce Motion.
 */
function Glow({ fill, live }: { fill: string; live: boolean }): React.JSX.Element {
  const reduce = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  const breath = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.sequence([Animated.delay(PULSE_AT_MS), timing(pulse, PULSE + 0.06, duration.quick + 40), springTo(pulse, 1, 'bouncy')]);
    run.start();
    return () => run.stop();
    // Once, on first draw.
  }, []);
  useEffect(() => {
    if (reduce || !live) {
      breath.setValue(0);
      return;
    }
    const run = Animated.loop(timing(breath, 1, BREATH.everyMs, { easing: Easing.out(Easing.quad) }));
    run.start();
    return () => run.stop();
  }, [reduce, live, breath]);
  return (
    <>
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
      {!reduce && live ? (
        <Animated.View
          style={[
            styles.breath,
            { borderColor: fill, opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }), transform: [{ scale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1 + BREATH.grow] }) }] },
          ]}
          pointerEvents="none"
          testID="lp-breath"
        />
      ) : null}
    </>
  );
}

/**
 * A stop squished down into its base under a finger, springing back up with a little bounce as it is let go. Under
 * Reduce Motion it simply sinks.
 */
function useSquish(): { style: object; onPressIn: () => void; onPressOut: () => void } {
  const reduce = useReducedMotion();
  const press = useRef(new Animated.Value(0)).current;
  return {
    style: {
      transform: [
        { translateY: press.interpolate({ inputRange: [0, 1], outputRange: [0, PRESS] }) },
        { scaleX: press.interpolate({ inputRange: [0, 1], outputRange: [1, reduce ? 1 : 1.06] }) },
        { scaleY: press.interpolate({ inputRange: [0, 1], outputRange: [1, reduce ? 1 : 0.92] }) },
      ],
    },
    onPressIn: () => {
      press.stopAnimation();
      if (reduce) press.setValue(1);
      else timing(press, 1, 60).start();
    },
    onPressOut: () => {
      if (reduce) press.setValue(0);
      else springTo(press, 0, 'bouncy').start();
    },
  };
}

/**
 * The bubble over the current skill: the course's own words ("Ji vir dest pê bike!") on the page's ground inside an
 * edge of its unit's colour, its words in that colour, on a lip of it, floating gently above the stop while the screen
 * is in view and the app is in front, never under Reduce Motion. It gives under a finger like every button. "Jump
 * here?" over a later unit wears the same in its own unit's colour, and stays still, since it is an offer rather than
 * the next step.
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
  /** It just moved here from the previous stop, so it fades in once the rest of the path has moved. */
  arriving: boolean;
  bobbing: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const shown = useRef(new Animated.Value(arriving && !reduce ? 0 : 1)).current;
  const float = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !arriving) {
      shown.setValue(1);
      return;
    }
    const run = timing(shown, 1, PATH_RETURN.bubbleMs, { delay: PATH_RETURN.bubbleAtMs });
    run.start();
    return () => run.stop();
  }, [reduce, arriving, shown]);
  useEffect(() => {
    if (reduce || !bobbing) {
      float.setValue(0);
      return;
    }
    const half = FLOAT.periodMs / 2;
    const run = Animated.loop(
      Animated.sequence([
        timing(float, 1, half, { easing: Easing.inOut(Easing.sin) }),
        timing(float, 0, half, { easing: Easing.inOut(Easing.sin) }),
      ]),
    );
    run.start();
    return () => run.stop();
  }, [reduce, bobbing, float]);
  const lift = float.interpolate({ inputRange: [0, 1], outputRange: [0, -FLOAT.rise] });
  return (
    <Animated.View
      style={[styles.calloutWrap, { opacity: shown, transform: [{ translateY: lift }] }]}
      pointerEvents="box-none"
      testID={bobbing ? 'lp-callout-bobbing' : undefined}
    >
      <View style={[styles.calloutLip, { backgroundColor: tone.lip }]}>
        <PressableScale
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={6}
          style={[styles.callout, { backgroundColor: colors.background, borderColor: tone.fill }]}
        >
          <Text style={[styles.calloutText, { color: tone.text }]}>{text}</Text>
        </PressableScale>
      </View>
      <View style={[styles.calloutTip, { backgroundColor: colors.background, borderColor: tone.fill }]} />
    </Animated.View>
  );
}

/** How far the bubble floats up and back, and how long once round. */
const FLOAT = { rise: 6, periodMs: 3600 } as const;

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
  number: { fontSize: typography.sizes.title, fontWeight: typography.weights.bold, fontVariant: ['tabular-nums'] },
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
  // Clipped to the face: a pill on its box, within a point of the oval at every edge.
  shine: { position: 'absolute', overflow: 'hidden', borderRadius: radii.pill },
  glint: { position: 'absolute', top: -20, width: 18, height: 104, backgroundColor: 'rgba(255, 255, 255, 0.45)' },
  spark: { position: 'absolute' },
  glow: { position: 'absolute', left: STOP_FACE.x - GLOW.rx, top: STOP_FACE.y + PATH_STOP_ART.raised + 4 - GLOW.ry },
  breath: { position: 'absolute', left: FACE.left, top: FACE.top, width: FACE.width, height: FACE.height, borderRadius: radii.pill, borderWidth: 4 },
  calloutWrap: {
    position: 'absolute',
    // Above the stop and the ring round it, with a little air.
    bottom: STOP_HEIGHT + 20,
    left: (NODE - CALLOUT_WIDTH) / 2,
    width: CALLOUT_WIDTH,
    alignItems: 'center',
  },
  calloutLip: { borderRadius: radii.md, paddingBottom: 4 },
  callout: {
    minHeight: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutText: {
    fontSize: typography.sizes.text,
    fontWeight: typography.weights.bold,
  },
  // The tail pointing down at the stop, its edge in the unit's colour.
  calloutTip: {
    width: 14,
    height: 14,
    marginTop: -10,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
});
