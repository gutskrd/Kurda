import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../theme/Pressable';
import Svg, { Defs, Ellipse, RadialGradient, Stop as GradientStop } from 'react-native-svg';
import {
  PATH_GEOMETRY,
  PATH_GOLD,
  PATH_MILESTONE_ART,
  PATH_MOTION,
  PATH_RETURN,
  PATH_STAMP_MOMENT,
  PATH_STAMP_REPRESS,
  PATH_STOP_ART,
  TOPIC_STARS,
  pathWaxColours,
  type LessonKind,
  type PathStop,
  type PathStopLook,
  type RingChange,
  type UnitTone,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useDirection } from '../reports/direction';
import { springTo, timing } from '../theme/animate';
import { Icon, type IconName } from '../theme/Icon';
import { duration } from '../theme/motion';
import { PressableScale } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { FACE_INK, REST, barAt, barOf, stopLook, type ToneColors } from './path';
import { MilestoneArt, STOP_FACE, StopArt } from './PathWorld';
import { WaxSeal, stampTrack } from './WaxSeal';
import { TopicBar } from './TopicBar';
import type { SkillNode } from './types';

const { node: NODE } = PATH_GEOMETRY;
/** How far the face sinks into its base when pressed (shared `PATH_STOP_ART.press`). */
const PRESS = PATH_STOP_ART.press;

type Stop = PathStop<SkillNode>;

/**
 * What a return from a lesson changed about this stop (shared `pathChanges`, timed by `PATH_RETURN`): its bar moved
 * on (`ring`), it finished (and became its wax seal, `WaxSeal`) from `wasLook`, it opened, the bubble moved here, or a unit's
 * prize was won.
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
 * How a finished topic's wax seal shows: `pressing` plays its sealing once after `delay` (shared `PATH_STAMP_MOMENT`), a
 * light tap felt as the stamp presses, then `onStamped`; otherwise it is simply there, in its tile's place.
 */
export interface StopStamp {
  pressing: boolean;
  delay: number;
  onStamped: () => void;
}

/**
 * One stop on the lesson path: a thick tile in its unit's colour (shared drawing) whose glyph says what its next lesson
 * is (or its number), a round wax seal in its place once done, a slate stone with a padlock when locked, arrows for
 * review. The topic in hand wears a slim bar over its tile with one piece per lesson (TopicBar). A chapter ends at its
 * milestone, a seal on a stone drum with the chapter's number, and a jumpable unit's first stop is drawn as a gate.
 * Pressed, the face sinks into its base.
 *
 * The current skill is the road's main button: it stands higher in a glow of its unit's colour under its bar, and a
 * bubble of the course's own words floats above them; now and then a glint sweeps it. It bobs while the path is in
 * view, and every stop squishes under a finger. None of it moves under Reduce Motion.
 *
 * After a lesson, `change` animates what it did to the stop: the bar fills, the stop becomes its wax seal (`stamp`), a
 * padlock gives way to a glyph, a prize bursts open, and the flag arrives last. Under Reduce Motion there is no
 * `change`, and the seal is simply there.
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
  milestone = null,
  stamp = null,
  near = true,
  live = false,
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
  /** A unit's last stop, its milestone: the unit's number, written on its seal. */
  milestone?: { number: string } | null;
  /** A finished topic's stamp, shown or being pressed; null while it waits for its moment. */
  stamp?: StopStamp | null;
  /** Drawn in full; far from the screen it is a plain round in its colour. */
  near?: boolean;
  /** Its unit is in view and the app in front, so a gold tile may glint. */
  live?: boolean;
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
  const reduce = useReducedMotion();
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
    if (!opening && !unlocking) return;
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
    const at = PATH_RETURN.openAtMs;
    const run = Animated.parallel([Animated.sequence([Animated.delay(at), timing(pop, POP, half), springTo(pop, 1, 'bouncy')]), timing(lock, 0, PATH_RETURN.glyphMs, { delay: at })]);
    run.start();
    const knock = setTimeout(() => haptic('tap'), at);
    return () => {
      run.stop();
      clearTimeout(knock);
    };
  }, [change, opening, unlocking, pop, lock, shut, wobble]);
  // A finished stop it was before, from the first frame until it is stamped.
  useEffect(() => {
    if (!finishing) return;
    const run = timing(before, 0, PATH_RETURN.popMs / 2, { delay: PATH_RETURN.finishAtMs });
    run.start();
    return () => run.stop();
  }, [change, finishing, before]);

  // The stamping moment, once: the tile squashes under the stamp as it lands, felt as a light tap.
  const moment = useRef(new Animated.Value(0)).current;
  const pressing = !!stamp?.pressing;
  const stamped = useRef(stamp?.onStamped);
  stamped.current = stamp?.onStamped;
  const pressDelay = stamp?.delay ?? 0;
  // Sealed in its moment just now: with three suns, its wax warms into gold.
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (!pressing) return;
    moment.setValue(0);
    const { ms, pressAt } = PATH_STAMP_MOMENT;
    const run = Animated.timing(moment, { toValue: 1, duration: ms, delay: pressDelay, easing: Easing.linear, useNativeDriver: true, isInteraction: false });
    run.start(({ finished }) => {
      if (!finished) return;
      setFresh(true);
      stamped.current?.();
    });
    const knock = setTimeout(() => haptic('tap'), pressDelay + ms * pressAt);
    return () => {
      run.stop();
      clearTimeout(knock);
    };
  }, [pressing, pressDelay, moment]);

  const glyph = glyphOf(stop, look, tone, FACE_INK[scheme], tone.ink);
  // A stop's drawing, base or face: a tile, or for the unit's last stop its milestone, won once open.
  const art = (l: PathStopLook, part: 'base' | 'face'): React.JSX.Element =>
    milestone ? (
      <MilestoneArt won={l === 'story' || l === 'chestOpen'} part={part} near />
    ) : (
      <StopArt look={l} tone={unitTone} part={part} near />
    );
  const squish = useSquish();
  const tilt = wobble.interpolate({ inputRange: [-1, 1], outputRange: [`${-PATH_MOTION.wobble}deg`, `${PATH_MOTION.wobble}deg`] });
  const lifted = rise ? { opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [PATH_MOTION.rise, 0] }) }] } : null;
  // Its bar now, and as it was before a lesson that moved it on.
  const bar = near ? barOf(stop) : null;
  const moved = change?.ring && stop.kind === 'skill' ? change.ring : null;
  const roundDone = !!moved && moved.to.rounds > moved.from.rounds;
  // A round made whole on a stop already sealed: the stamp comes back as the stop finishes and presses the new sun in,
  // felt as a light tap; until then it shows the suns it had.
  const again = useRef(new Animated.Value(0)).current;
  const three = (n: number): number => Math.min(TOPIC_STARS, Math.max(1, n));
  const pressFrom = roundDone && moved && moved.from.rounds >= 1 && !!stamp && !pressing && !reduce ? three(moved.from.rounds) : null;
  const [pressingAgain, setPressingAgain] = useState(pressFrom !== null);
  useEffect(() => {
    if (pressFrom === null) return;
    setPressingAgain(true);
    again.setValue(0);
    const { ms, pressAt } = PATH_STAMP_REPRESS;
    const at = PATH_RETURN.finishAtMs;
    const run = Animated.timing(again, { toValue: 1, duration: ms, delay: at, easing: Easing.linear, useNativeDriver: true, isInteraction: false });
    run.start(({ finished }) => finished && setPressingAgain(false));
    const knock = setTimeout(() => haptic('tap'), at + ms * pressAt);
    return () => {
      run.stop();
      clearTimeout(knock);
    };
  }, [pressFrom, again]);
  const suns = stop.kind === 'skill' ? three(stop.rounds) : 1;
  // Squashed under the stamp in its moment, or a little as it presses again.
  const squashOf = (t: Animated.Value, squash: readonly (readonly [number, number])[]) => ({
    transformOrigin: '50% 85%',
    transform: [{ scaleX: stampTrack(t, squash.map(([at, v]) => [at, 2 - v] as const)) }, { scaleY: stampTrack(t, squash) }],
  });
  const squashed = pressing ? squashOf(moment, PATH_STAMP_MOMENT.squash) : pressFrom !== null && pressingAgain ? squashOf(again, PATH_STAMP_REPRESS.squash) : null;
  // Its third sun pressed in now: once the stamp has lifted, the wax warms into gold. Under Reduce Motion it is simply gold.
  const warmAt =
    suns < TOPIC_STARS || reduce ? null : fresh ? 0 : pressFrom !== null && pressFrom < TOPIC_STARS ? PATH_RETURN.finishAtMs + PATH_STAMP_REPRESS.ms : null;
  // Once sealed its tile and glyph are gone, the seal in their place; in the moment they melt under the spreading wax.
  const sealed = !!stamp && !pressing;
  const melt = PATH_STAMP_MOMENT.melt.map(([at, v]) => [at, 1 - v] as const);
  const glyphShown = pressing ? stampTrack(moment, melt) : stamp ? 0 : 1;
  const slump = (k: number): Array<readonly [number, number]> => PATH_STAMP_MOMENT.melt.map(([at, v]) => [at, 1 + k * v] as const);
  const melting = pressing
    ? {
        transformOrigin: '50% 90%',
        opacity: stampTrack(moment, melt),
        transform: [{ scaleX: stampTrack(moment, slump(0.12)) }, { scaleY: stampTrack(moment, slump(-0.45)) }],
      }
    : null;
  const tile = (drawing: React.JSX.Element): React.JSX.Element | null =>
    sealed ? null : melting ? <Animated.View style={[StyleSheet.absoluteFill, melting]}>{drawing}</Animated.View> : drawing;
  // Drawn plain far off: a seal in its wax, else its tile's colours.
  const wax = pathWaxColours(scheme === 'dark', suns >= TOPIC_STARS);
  const plain = stamp ? { face: wax.face, lip: wax.shade } : plainColour(look, tone, rest);

  return (
    <Animated.View style={[styles.stop, { left, top }, lifted]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, bob ? { transform: [{ translateY: bob }] } : null]} pointerEvents="box-none">
        {callout && onStart ? (
          <Callout text={callout.text} label={callout.label} tone={tone} arriving={!!change?.arriving} bobbing={bobbing} onPress={onStart} />
        ) : null}
        {jump ? <Callout text={jump.text} label={label} tone={tone} arriving={false} bobbing={false} onPress={onPress} /> : null}
        {raised && stop.kind === 'skill' ? <Glow fill={tone.fill} /> : null}
        {/* The bar is the topic in hand: the one to do now, or one a return is filling. */}
        {bar && stop.kind === 'skill' && (raised || moved) ? (
          <TopicBar
            // A return remounts the bar so it starts again.
            key={moved ? 'moving' : 'still'}
            bar={bar}
            from={moved ? barAt(stop, moved.from) : null}
            roundDone={roundDone}
            tint={tone.fill}
            mirrored={dir.rtl}
          />
        ) : null}
        <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ scale: pop }, { rotate: tilt }] }, squashed]} pointerEvents="none">
          {near ? tile(art(look, 'base')) : <View style={[styles.plainLip, { backgroundColor: plain.lip }]} />}
          {opening && near ? (
            // The locked stone it was, over it until it opens.
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: lock }]}>
              <StopArt look="locked" tone={unitTone} part="base" near />
            </Animated.View>
          ) : null}
          {was && near
            ? tile(
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: before }]}>
                  <StopArt look={was} tone={unitTone} part="base" near />
                </Animated.View>,
              )
            : null}
          {unlocking && near ? <Animated.View style={[StyleSheet.absoluteFill, { opacity: shut }]}>{art(shutLook, 'base')}</Animated.View> : null}
        </Animated.View>
        <Animated.View style={[styles.popped, { transform: [{ scale: pop }, { rotate: tilt }] }, squashed]} pointerEvents="box-none">
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
                  {art(look, 'face')}
                  <Animated.View style={[StyleSheet.absoluteFill, { opacity: shut }]}>{art(shutLook, 'face')}</Animated.View>
                </>
              ) : opening ? (
                <>
                  <StopArt look={look} tone={unitTone} part="face" near />
                  <Animated.View style={[StyleSheet.absoluteFill, { opacity: lock }]}>
                    <StopArt look="locked" tone={unitTone} part="face" near />
                  </Animated.View>
                </>
              ) : was ? (
                tile(
                  <>
                    <StopArt look={look} tone={unitTone} part="face" near />
                    <Animated.View style={[StyleSheet.absoluteFill, { opacity: before }]}>
                      <StopArt look={was} tone={unitTone} part="face" near />
                    </Animated.View>
                  </>,
                )
              ) : (
                tile(art(look, 'face'))
              )
            ) : (
              <View style={[styles.plainFace, { backgroundColor: plain.face }]} />
            )}
            {opening && !glyph ? (
              // The current stop: its padlock goes and the learner arrives on it.
              <Animated.View style={[styles.glyph, { opacity: lock }]} pointerEvents="none">
                <Icon name="lock" size={26} color={FACE_INK[scheme].stone} />
              </Animated.View>
            ) : null}
            {raised && near ? <Shine /> : null}
            {milestone ? (
              <View style={styles.milestoneNumber} pointerEvents="none">
                {unlocking ? (
                  <>
                    <Text style={[styles.number, { color: PATH_GOLD[scheme].ink }]}>{milestone.number}</Text>
                    <Animated.Text style={[styles.number, styles.glyphLayer, { color: rest.ink, opacity: shut }]}>{milestone.number}</Animated.Text>
                  </>
                ) : (
                  <Text style={[styles.number, { color: look === 'story' || look === 'chestOpen' ? PATH_GOLD[scheme].ink : rest.ink }]}>{milestone.number}</Text>
                )}
              </View>
            ) : null}
            {glyph ? (
              <Animated.View style={[styles.glyph, { opacity: glyphShown }]} pointerEvents="none">
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
              </Animated.View>
            ) : null}
            {stamp && near && stop.kind === 'skill' ? (
              <WaxSeal
                stopKey={stop.key}
                dark={scheme === 'dark'}
                suns={suns}
                gold={!pressing && suns >= TOPIC_STARS}
                warmAt={warmAt}
                worn={stop.finish === 'refresh'}
                live={live && !reduce}
                moment={pressing ? moment : null}
                again={pressFrom !== null && pressingAgain ? { t: again, from: pressFrom } : null}
              />
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
 * The glyph on a stop's face, in its unit's ink: what a topic's next lesson is (letters for new words, a conversation,
 * practice), or from a server too old to say, its number (a star on the stop to do now); a padlock on a shut stone, and
 * review's arrows. A finished tile's glyph melts away with it into its seal; the drawn stops carry their own.
 */
function glyphOf(stop: Stop, look: string, tone: ToneColors, ink: (typeof FACE_INK)['dark'], onNow: string): { icon?: IconName; number?: number; colour: string } | null {
  if (stop.kind === 'review') return { icon: 'review', colour: ink.paper(tone) };
  if (stop.kind !== 'skill' || look === 'jump') return null;
  switch (stop.state) {
    case 'done':
      return stop.launchKind ? { icon: KIND_GLYPH[stop.launchKind], colour: ink.paper(tone) } : null;
    case 'current':
      return { icon: KIND_GLYPH[stop.launchKind ?? 'none'], colour: onNow };
    case 'available':
      return stop.launchKind ? { icon: KIND_GLYPH[stop.launchKind], colour: ink.paper(tone) } : { number: stop.number, colour: ink.paper(tone) };
    case 'locked':
      return { icon: 'lock', colour: ink.stone };
  }
}

/** What a topic's next lesson is, as its glyph. */
const KIND_GLYPH: Record<LessonKind | 'none', IconName> = { words: 'lesson-words', talk: 'lesson-talk', practice: 'lesson-practice', none: 'star-fill' };

/** A stop far from the screen, as a plain round in its drawing's colour. */
function plainColour(look: string, tone: ToneColors, rest: (typeof REST)['dark']): { face: string; lip: string } {
  if (look === 'strong' || look === 'story') return { face: GOLD_TOKEN.face, lip: GOLD_TOKEN.lip };
  if (look === 'current' || look === 'available' || look === 'review' || look === 'jump' || look === 'done' || look === 'refresh') return { face: tone.fill, lip: tone.lip };
  return { face: rest.fill, lip: rest.lip };
}

/** A won milestone's gold (shared art/path-land.ts), for drawing it plain. */
const GOLD_TOKEN = { face: '#e9a93b', lip: '#b8781f' } as const;

/** A stable name per kind of stop, for tests and the screenshots that check the path. */
function testName(stop: Stop): string {
  if (stop.kind !== 'skill') return stop.kind;
  return stop.state;
}

/** The stop's face in its 72-point button (shared PATH_STOP_ART: radii 36 by 31 about `STOP_FACE`). */
const FACE = { left: STOP_FACE.x - 36, top: STOP_FACE.y - 31, width: 72, height: 62 } as const;
/** How often the glint crosses the stop to do now, and how long it takes. */
const GLINT = { everyMs: 3600, crossMs: 1300, firstMs: 1000 } as const;

/** Now and then a glint of light sweeps the face of the stop to do now, as on the website. Native driver; none under Reduce Motion. */
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
  return (
    <View style={[styles.shine, FACE]} pointerEvents="none">
      <Animated.View
        style={[
          styles.glint,
          { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-48, FACE.width + 24] }) }, { rotate: '20deg' }] },
        ]}
      />
    </View>
  );
}

/** The size of the glow the current skill stands in. */
const GLOW = { rx: 66, ry: 32 } as const;

/**
 * The glow under the current skill in its unit's colour, which swells once as the path opens so the eye finds it.
 * Native driver; still under Reduce Motion.
 */
function Glow({ fill }: { fill: string }): React.JSX.Element {
  const reduce = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return;
    const run = Animated.sequence([Animated.delay(PULSE_AT_MS), timing(pulse, PULSE + 0.06, duration.quick + 40), springTo(pulse, 1, 'bouncy')]);
    run.start();
    return () => run.stop();
    // Once, on first draw.
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
  // On the milestone's seal: its middle, in the button's points (shared PATH_MILESTONE_ART).
  milestoneNumber: {
    position: 'absolute',
    left: 0,
    width: NODE,
    top: PATH_MILESTONE_ART.y + PATH_MILESTONE_ART.cy - 18,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  glow: { position: 'absolute', left: STOP_FACE.x - GLOW.rx, top: STOP_FACE.y + PATH_STOP_ART.raised + 4 - GLOW.ry },
  calloutWrap: {
    position: 'absolute',
    // Above the stop and the bar over it, its tail clear of the bar.
    bottom: STOP_HEIGHT + 28,
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
