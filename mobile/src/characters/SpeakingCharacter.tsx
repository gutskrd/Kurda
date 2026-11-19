import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Pressable } from '../theme/Pressable';
import { SvgXml } from 'react-native-svg';
import {
  BLINK_STEPS,
  BREATH,
  CHARACTER_HABITS,
  CHARACTER_NAMES,
  HABITS,
  RESTING,
  SWAY,
  TAP_RUN_MS,
  actFor,
  between,
  characterArt,
  eyeShift,
  glanceTarget,
  keySteps,
  leanToward,
  lookToward,
  pickAct,
  reactionAct,
  speakingFrame,
  tapActs,
  voiceTimeline,
  type ActName,
  type BrowState,
  type CharacterPoint,
  type CharacterReaction,
  type CheekState,
  type EyeState,
  type Keys,
  type MouthShape,
  type RecordingVoice,
  type SpeakerId,
  type Viseme,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useScreenAwake } from '../a11y/useMotionAlive';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { Rise } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { useGaze } from './gaze';
import { useDrawingIds } from './drawingIds';
import { characterLayers, irisesMoved, type CharacterCrop, type Share } from './layers';
import type { PlaybackClock } from './voice';

export { CHARACTER_SIZE, knownVoice, type PlaybackClock } from './voice';
export type { CharacterReaction } from '@kurda/shared';

export interface SpeakingCharacterProps {
  speaker: SpeakerId;
  /** The player the screen already plays the recording with; null before it has one. */
  player: PlaybackClock | null;
  /** Whether the screen is playing this recording now; the character follows it only then. */
  playing: boolean;
  /** The recording, so that another one starts from its own timeline. */
  source?: string | null;
  voice?: RecordingVoice | null;
  /** The words said, to move the mouth from when the recording has no timeline of its own. */
  text?: string | null;
  /** The whole figure, head to waist, head and shoulders (in a rounded tile), or head and neck (at a window, HevaloWindow). */
  crop?: CharacterCrop;
  /** How wide it is drawn, in points; the height follows from the drawing. */
  size?: number;
  /** Or how tall, and the width follows. */
  height?: number;
  /** Turned the other way round, to face what lies to its left. */
  flip?: boolean;
  /**
   * A steady look, each axis from -1 to 1 in the drawing's terms (shared `lookAcross`), at its conversation
   * partner: the eyes stay on them, with no glances or finger-following, and the head leans slightly their way.
   */
  gaze?: CharacterPoint | null;
  /** Listening, not speaking: the mouth never moves with what plays; it still breathes, blinks and reacts. */
  quiet?: boolean;
  /**
   * What it has just seen: it reacts whenever this changes, and on arrival with one. `cheer` and `hmm` for
   * answers; the rest (shared `CharacterReaction`) for moments in between, each played in the character's own
   * way.
   */
  reaction?: CharacterReaction | null;
  /** Asleep where there is nothing to do yet: eyes shut, a slow breath, a drifting "z" (shared `RESTING`). */
  resting?: boolean;
  /**
   * A tap on the character: it greets, then calls this (usually to replay). Quick repeated taps escalate: a
   * giggle on the second, a start and a laugh with a light haptic on the third (shared `tapActs`).
   */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** The widest head turn, with margin: Animated maps the angle onto a string. */
const TURN_RANGE = 30;

/** A bust this wide or wider sits in the larger corner. */
const LARGE_TILE = 88;

/**
 * In a tile, the head and shoulders are drawn this much smaller and stand centred on its foot, leaving room for
 * antlers, hops, nods and ears so no part is clipped. The web tile leaves the same room.
 */
const TILE_ROOM = 0.12;

/** How long a look takes to reach what it looks at, and to come back. */
const LOOK_MS = { to: 140, back: 420, glance: 260 } as const;

/** A finger's position is compared with the character's at most this often (ms); a drag in between reuses the last. */
const REMEASURE_MS = 300;

const ease = Easing.inOut(Easing.quad);

/** The shadow under a standing figure: dark in the middle, gone at the edge. */
const shadowSvg = (colour: string, depth: number): string =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20" preserveAspectRatio="none">' +
  `<defs><radialGradient id="ground"><stop offset="0" stop-color="${colour}" stop-opacity="${depth}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient></defs>` +
  '<ellipse cx="50" cy="10" rx="50" ry="10" fill="url(#ground)"/></svg>';
const SHADOW = { light: shadowSvg('#2a1408', 0.3), dark: shadowSvg('#000000', 0.55) } as const;

/** One part of the drawing, memoised on its markup, so a mouth change does not redraw the body, head and eyes. */
const Layer = memo(function Layer({ xml, width, height }: { xml: string; width: number; height: number }) {
  return <SvgXml xml={xml} width={width} height={height} style={styles.layer} />;
});

const origin = (s: Share): string => `${s.x * 100}% ${s.y * 100}%`;
const degrees = (value: Animated.AnimatedInterpolation<number> | Animated.Value | Animated.AnimatedAddition<number>, sign = 1) =>
  value.interpolate({ inputRange: [-TURN_RANGE, TURN_RANGE], outputRange: [`${-sign * TURN_RANGE}deg`, `${sign * TURN_RANGE}deg`] });

/**
 * Hevalo, Hamo or Xezo saying the screen's recording, and idling between words. It follows the screen's own
 * player, reading the position every frame and computing mouth and nod with `speakingFrame`, as the web does.
 * Between words it breathes, blinks, glances and plays its habits (shared `HABITS`, `CHARACTER_HABITS`); its eyes
 * follow a finger (`GazeArea`) unless `gaze` fixes them on a partner. Taps, `reaction` and `quiet` are described
 * on the props.
 *
 * Movement is native-driver transforms over stacked SVG layers (body, then head parts), so only the eyes, brows,
 * cheeks and mouth redraw when their shape changes. Under Reduce Motion only the mouth, blinks and faces change.
 * Timers stop when the app is backgrounded or the character unmounts.
 */
export function SpeakingCharacter({
  speaker,
  player,
  playing,
  source = null,
  voice = null,
  text = null,
  crop = 'bust',
  size,
  height: tall,
  flip = false,
  gaze = null,
  quiet = false,
  reaction = null,
  resting = false,
  onPress,
  style,
}: SpeakingCharacterProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const finger = useGaze();
  const idPrefix = useDrawingIds('sc');
  const layers = useMemo(() => characterLayers(speaker, crop, idPrefix), [speaker, crop, idPrefix]);
  const art = characterArt(speaker);
  const rig = layers.rig;
  // The space it takes, and the drawing inside it: the same except in a tile, where the drawing leaves room.
  const boxWidth = size ?? ((tall ?? 0) * layers.frame.w) / layers.frame.h;
  const boxHeight = (boxWidth * layers.frame.h) / layers.frame.w;
  const room = crop === 'bust' ? TILE_ROOM : 0;
  const width = boxWidth * (1 - room);
  const height = boxHeight * (1 - room);
  /** Points per drawing unit. */
  const unit = width / layers.frame.w;
  // A steady look, by its value: the same look given again as a new object changes nothing.
  const steady = gaze !== null;
  const gazeX = gaze?.x ?? 0;
  const gazeY = gaze?.y ?? 0;

  // ---- What the face shows ----
  const [speech, setSpeech] = useState<Viseme>('rest');
  const [blink, setBlink] = useState<EyeState>('open');
  const [actEyes, setActEyes] = useState<EyeState | null>(null);
  const [actMouth, setActMouth] = useState<MouthShape | null>(null);
  const [actBrows, setActBrows] = useState<BrowState | null>(null);
  const [actCheeks, setActCheeks] = useState<CheekState | null>(null);
  // Where an act turns a person's eyes (the deer's pupils move on the native driver instead).
  const [actLook, setActLook] = useState<CharacterPoint | null>(null);
  // In front and on a focused screen: a character on a tab behind another has nobody to breathe for.
  const awake = useScreenAwake();

  // ---- What moves, all on the native driver ----
  const values = useRef({
    nod: new Animated.Value(0),
    sway: new Animated.Value(0),
    tilt: new Animated.Value(0),
    earLeft: new Animated.Value(0),
    earRight: new Animated.Value(0),
    sniff: new Animated.Value(1),
    rise: new Animated.Value(0),
    stretch: new Animated.Value(1),
    breathe: new Animated.Value(1),
    lookX: new Animated.Value(0),
    lookY: new Animated.Value(0),
    focus: new Animated.Value(0),
    dip: new Animated.Value(0),
    lean: new Animated.Value(0),
    wiggle: new Animated.Value(0),
    lift: new Animated.Value(0),
    hair: new Animated.Value(0),
  }).current;

  const born = useRef(Date.now());
  const shownNod = useRef(0);

  // The recording's length once the player knows it, kept with the recording it belongs to.
  const [length, setLength] = useState<{ source: string | null; ms: number } | null>(null);
  const durationMs = length && length.source === source ? length.ms : null;
  const timeline = useMemo(() => voiceTimeline(voice, text, durationMs), [voice, text, durationMs]);

  // ---- The words, unless it is listening ----
  const live = !quiet && playing && player !== null && awake;
  useEffect(() => {
    const rest = (): void => {
      setSpeech('rest');
      if (shownNod.current !== 0) values.nod.setValue(0);
      shownNod.current = 0;
    };
    if (!live || !player) {
      rest();
      return;
    }
    let frame: number | null = null;
    let measured = durationMs !== null;
    const tick = (): void => {
      const seconds = player.duration;
      if (!measured && Number.isFinite(seconds) && seconds > 0) {
        measured = true;
        setLength({ source, ms: Math.round(seconds * 1000) });
      }
      const now = speakingFrame({
        timeline,
        ms: player.currentTime * 1000,
        playing: player.playing,
        sinceMs: Date.now() - born.current,
        reducedMotion: reduce,
      });
      setSpeech(now.mouth);
      if (now.nod !== shownNod.current) values.nod.setValue(now.nod);
      shownNod.current = now.nod;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [live, player, timeline, durationMs, source, reduce, values]);

  // ---- Timers, all cleared together ----
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = useCallback((ms: number, run: () => void) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      run();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  useEffect(() => {
    const own = timers.current;
    return () => {
      own.forEach(clearTimeout);
      own.clear();
    };
  }, []);

  // ---- Looking ----
  const looking = useRef<Animated.CompositeAnimation | null>(null);
  // A look as seen, flipped for a figure drawn the other way; or, when `drawn`, already in the drawing's terms.
  const look = useCallback(
    (x: number, y: number, focus: number, ms: number, drawn = false) => {
      looking.current?.stop();
      const to = (value: Animated.Value, toValue: number) => Animated.timing(value, { toValue, duration: ms, easing: ease, useNativeDriver: true });
      looking.current = Animated.parallel([to(values.lookX, flip && !drawn ? -x : x), to(values.lookY, y), to(values.focus, focus)]);
      looking.current.start();
    },
    [values, flip],
  );
  // Where the eyes come back to: whoever it has been told to look at, or straight ahead.
  const lookBack = useCallback((ms: number) => (steady ? look(gazeX, gazeY, 1, ms, true) : look(0, 0, 0, ms)), [look, steady, gazeX, gazeY]);
  const following = useRef(false);

  // ---- Acts ----
  /** The movement under way, for habits to wait on; done before the face it holds, so holds are kept apart. */
  const acting = useRef<Animated.CompositeAnimation | null>(null);
  const holding = useRef<ReturnType<typeof setTimeout>[]>([]);
  const stopAct = useCallback(() => {
    acting.current?.stop();
    acting.current = null;
    holding.current.forEach((id) => {
      clearTimeout(id);
      timers.current.delete(id);
    });
    holding.current = [];
    setActEyes(null);
    setActMouth(null);
    setActBrows(null);
    setActCheeks(null);
    setActLook(null);
  }, []);
  const play = useCallback(
    (name: ActName) => {
      const act = actFor(speaker, name);
      stopAct();
      const tracks: Animated.CompositeAnimation[] = [];
      const run = (value: Animated.Value, keys: Keys | undefined): void => {
        if (!keys || keys.length === 0) return;
        value.setValue(keys[0]![1]);
        tracks.push(
          Animated.sequence(keySteps(keys, act.ms).map((s) => Animated.timing(value, { toValue: s.to, duration: s.ms, easing: ease, useNativeDriver: true }))),
        );
      };
      if (!reduce) {
        if (rig) {
          run(values.earLeft, act.earLeft);
          run(values.earRight, act.earRight);
          run(values.sniff, act.sniff);
        }
        run(values.rise, act.rise);
        run(values.stretch, act.stretch);
        run(values.tilt, act.tilt);
        run(values.wiggle, act.wiggle);
        if (layers.moustache) run(values.lift, act.lift);
        if (layers.hair) run(values.hair, act.hair);
      }
      const holds: ReturnType<typeof setTimeout>[] = [];
      const hold = <T,>(spans: readonly (readonly [number, number, T])[] | undefined, set: (next: (now: T | null) => T | null) => void): void => {
        for (const [from, to, value] of spans ?? []) {
          holds.push(later(from * act.ms, () => set(() => value)));
          holds.push(later(to * act.ms, () => set((now) => (now === value ? null : now))));
        }
      };
      hold(act.eyes, setActEyes);
      hold(act.mouth, setActMouth);
      hold(act.brows, setActBrows);
      hold(act.cheeks, setActCheeks);
      if (act.look && !reduce) {
        if (rig) {
          const { x, y } = act.look;
          look(x, y, 1, LOOK_MS.glance);
          holds.push(later(act.ms * 0.8, () => (following.current ? undefined : lookBack(LOOK_MS.back))));
        } else if (!steady) {
          // A person's irises are drawn where they look; back to the middle before the act ends.
          const where = act.look;
          holds.push(later(LOOK_MS.glance, () => setActLook(where)));
          holds.push(later(act.ms * 0.8, () => setActLook(null)));
        }
      }
      const anim = Animated.parallel(tracks);
      acting.current = anim;
      holding.current = holds;
      anim.start(({ finished }) => {
        if (finished && acting.current === anim) acting.current = null;
      });
    },
    [stopAct, reduce, rig, values, later, look, lookBack, speaker, layers, steady],
  );

  // The latest `play`, for effects that should run when what they watch changes and not when `play` does.
  const playRef = useRef(play);
  playRef.current = play;

  // A reaction plays when given and each time it changes, in this character's way; the deer pricks his ears on arrival.
  const arrived = useRef(false);
  useEffect(() => {
    if (reaction) {
      arrived.current = true;
      const id = later(120, () => playRef.current(reactionAct(speaker, reaction)));
      return () => clearTimeout(id);
    }
    if (arrived.current || !rig || resting) return;
    arrived.current = true;
    const id = later(160, () => playRef.current('arrive'));
    return () => clearTimeout(id);
  }, [reaction, rig, later, resting, speaker]);
  useEffect(() => stopAct, [stopAct]);

  // ---- Breathing, and the head's drift ----
  useEffect(() => {
    if (reduce || !awake) return;
    const { breathe, sway } = values;
    // Asleep, a breath is slower and deeper.
    const half = (resting ? RESTING.breathMs : BREATH.ms) / 2;
    const depth = resting ? RESTING.depth : BREATH.depth;
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1 + depth, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(breathe, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    const quarter = SWAY.ms / 4;
    const drift = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: SWAY.degrees, duration: quarter, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(sway, { toValue: -SWAY.degrees, duration: 2 * quarter, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
        Animated.timing(sway, { toValue: 0, duration: quarter, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
      ]),
    );
    breath.start();
    drift.start();
    return () => {
      breath.stop();
      drift.stop();
      breathe.setValue(1);
      sway.setValue(0);
    };
  }, [reduce, awake, values, resting]);

  // ---- Resting: the head dips to one side, and comes back up on waking ----
  useEffect(() => {
    const to = resting ? RESTING.dip : 0;
    if (reduce) {
      values.dip.setValue(to);
      return;
    }
    const settle = Animated.timing(values.dip, { toValue: to, duration: 700, easing: ease, useNativeDriver: true });
    settle.start();
    return () => settle.stop();
  }, [resting, reduce, values]);

  // ---- A steady look: the deer's pupils turn to the partner (the people's irises are drawn there) ----
  const steadied = useRef(false);
  useEffect(() => {
    // And back to centre when there is nobody to look at.
    if (!rig || (!steady && !steadied.current)) return;
    steadied.current = steady;
    following.current = false;
    lookBack(reduce ? 0 : LOOK_MS.to);
  }, [rig, steady, lookBack, reduce]);

  // ---- The head leans slightly their way: a pose, so under Reduce Motion it is just there ----
  const lean = steady ? leanToward({ x: gazeX, y: gazeY }) : 0;
  useEffect(() => {
    if (reduce) {
      values.lean.setValue(lean);
      return;
    }
    const turning = Animated.timing(values.lean, { toValue: lean, duration: LOOK_MS.back, easing: ease, useNativeDriver: true });
    turning.start();
    return () => turning.stop();
  }, [lean, reduce, values]);

  // ---- Habits: blinks for everyone, the deer's glances, and each character's own (an ear, a sniff, a moustache, a wisp of hair) ----
  useEffect(() => {
    // Asleep it is still: no blinks, glances, twitches or sniffs.
    if (!awake || resting) return;
    const habits: ReturnType<typeof setTimeout>[] = [];
    const every = (range: readonly [number, number], run: () => void): void => {
      const next = (): void => {
        habits.push(
          setTimeout(() => {
            run();
            next();
          }, between(range)),
        );
      };
      next();
    };
    const blinkOnce = (after = 0): void => {
      habits.push(setTimeout(() => setBlink('half'), after));
      habits.push(setTimeout(() => setBlink('closed'), after + BLINK_STEPS.half));
      habits.push(setTimeout(() => setBlink('half'), after + BLINK_STEPS.half + BLINK_STEPS.shut));
      habits.push(setTimeout(() => setBlink('open'), after + 2 * BLINK_STEPS.half + BLINK_STEPS.shut));
    };
    every(HABITS.blink, () => {
      blinkOnce();
      if (Math.random() < HABITS.doubleBlink) blinkOnce(2 * BLINK_STEPS.half + BLINK_STEPS.shut + 120);
    });
    if (rig && !reduce && !steady) {
      // Told where to look, it keeps its eyes there.
      every(HABITS.glance, () => {
        if (following.current || acting.current) return;
        const target = glanceTarget();
        look(target.x, target.y, 1, LOOK_MS.glance);
        habits.push(setTimeout(() => (following.current ? undefined : look(0, 0, 0, LOOK_MS.back)), between(HABITS.glanceHold)));
      });
    }
    if (!reduce) {
      for (const habit of CHARACTER_HABITS[speaker]) every(habit.every, () => (acting.current ? undefined : playRef.current(pickAct(habit))));
    }
    return () => {
      habits.forEach(clearTimeout);
      setBlink('open');
    };
  }, [awake, rig, reduce, look, resting, steady, speaker]);

  // ---- Following a finger, when it has not been told where to look ----
  const root = useRef<View>(null);
  const placed = useRef<{ x: number; y: number; w: number; h: number; at: number } | null>(null);
  useEffect(() => {
    if (!finger || steady || !rig || reduce || resting) return;
    const aim = (point: { x: number; y: number }): void => {
      const box = placed.current;
      if (!box || box.w === 0) return;
      // In a tile the drawing stands on the foot, centred, `room` smaller than the box measured.
      const inner = 1 - room;
      const eyeX = box.x + box.w * (room / 2 + (flip ? 1 - layers.eyesAt.x : layers.eyesAt.x) * inner);
      const eyeY = box.y + box.h * (room + layers.eyesAt.y * inner);
      // Measured on the screen; `look` turns it round for a character drawn facing the other way.
      const where = lookToward(point.x - eyeX, point.y - eyeY, Math.max(box.w, box.h) * 1.2);
      following.current = true;
      look(where.x, where.y, 1, LOOK_MS.to);
    };
    return finger.subscribe((point) => {
      if (!point) {
        following.current = false;
        look(0, 0, 0, LOOK_MS.back);
        return;
      }
      const now = Date.now();
      if (placed.current && now - placed.current.at < REMEASURE_MS) {
        aim(point);
        return;
      }
      root.current?.measureInWindow((x, y, w, h) => {
        placed.current = { x, y, w, h, at: Date.now() };
        aim(point);
      });
    });
  }, [finger, steady, rig, reduce, flip, layers, look, room, resting]);

  // Taps close together form one run: a greeting, then a giggle, then a start and a laugh with a light haptic.
  const taps = useRef({ count: 0, at: 0 });
  const greet = (): void => {
    const now = Date.now();
    const count = now - taps.current.at < TAP_RUN_MS ? taps.current.count + 1 : 1;
    taps.current = { count, at: now };
    const [first, then] = tapActs(speaker, count);
    // The knock of the first tap, as ever; the start on the third is felt as a tick, and nothing louder.
    if (count === 1) haptic('tap');
    else if (then) haptic('select');
    playRef.current(first ?? 'greet');
    if (first && then) later(actFor(speaker, first).ms, () => playRef.current(then));
    onPress?.();
  };

  // ---- Drawing ----
  const eyes: EyeState = actEyes ?? (resting ? 'closed' : blink);
  const mouth: MouthShape = live && speech !== 'rest' ? speech : actMouth ?? speech;
  const brows: BrowState = actBrows ?? 'neutral';
  const blush = actCheeks === 'blush' && layers.cheeks !== null;

  const figure = useMemo(
    () => ({
      transformOrigin: '50% 100%',
      transform: [
        { translateY: Animated.multiply(values.rise, -height) },
        // A giggle rocks the whole figure about its feet.
        { rotate: degrees(values.wiggle) },
        { scaleY: Animated.multiply(values.breathe, values.stretch) },
        // A crouch spreads a little and a stretch narrows, as something soft does.
        { scaleX: values.stretch.interpolate({ inputRange: [0.9, 1, 1.1], outputRange: [1.06, 1, 0.94] }) },
      ],
    }),
    [values, height],
  );
  const turn = useMemo(
    () => ({
      transformOrigin: origin(layers.pivot),
      transform: [{ rotate: degrees(Animated.add(Animated.add(Animated.add(Animated.add(values.nod, values.sway), values.tilt), values.dip), values.lean)) }],
    }),
    [layers, values],
  );
  // A person's open eyes with irises shifted to look; redrawn only when the look changes.
  const openEyes = useMemo(() => {
    if (rig) return layers.eyes.open;
    if (steady) return irisesMoved(layers.eyes.open, eyeShift(art, { x: gazeX, y: gazeY }));
    if (actLook) return irisesMoved(layers.eyes.open, eyeShift(art, actLook));
    return layers.eyes.open;
  }, [steady, rig, layers, art, gazeX, gazeY, actLook]);
  const pupils = useMemo(() => {
    const r = art.rig;
    if (!r) return null;
    const shift = (p: { rest: { x: number; y: number }; centre: { x: number; y: number } }) => ({
      transform: [
        { translateX: Animated.add(Animated.multiply(values.focus, (p.centre.x - p.rest.x) * unit), Animated.multiply(values.lookX, r.look.reach.x * unit)) },
        { translateY: Animated.add(Animated.multiply(values.focus, (p.centre.y - p.rest.y) * unit), Animated.multiply(values.lookY, r.look.reach.y * unit)) },
      ],
    });
    return { left: shift(r.look.left), right: shift(r.look.right) };
  }, [art, values, unit]);

  const shadowMotion = useMemo(
    () => ({
      opacity: values.rise.interpolate({ inputRange: [0, 0.1], outputRange: [1, 0.45], extrapolate: 'clamp' }),
      transform: [{ scaleX: values.rise.interpolate({ inputRange: [0, 0.1], outputRange: [1, 0.6], extrapolate: 'clamp' }) }],
    }),
    [values],
  );

  // The deer's ears and nose, each about its own point; made once, so a new mouth does not rebuild them.
  const parts = useMemo(
    () =>
      rig
        ? {
            earLeft: { transformOrigin: origin(rig.earLeftPivot), transform: [{ rotate: degrees(values.earLeft) }] },
            earRight: { transformOrigin: origin(rig.earRightPivot), transform: [{ rotate: degrees(values.earRight, -1) }] },
            nose: { transformOrigin: origin(rig.sniff), transform: [{ scale: values.sniff }] },
          }
        : null,
    [rig, values],
  );
  // The near end of Hamo's moustache, lifting about its root, and Xezo's loose hair, swinging about its parting.
  const moving = useMemo(
    () => ({
      end: layers.moustache ? { transformOrigin: origin(layers.moustache.pivot), transform: [{ rotate: degrees(values.lift) }] } : null,
      hair: layers.hair ? { transformOrigin: origin(layers.hair.pivot), transform: [{ rotate: degrees(values.hair) }] } : null,
    }),
    [layers, values],
  );

  const tile: ViewStyle | null =
    crop === 'bust' ? { borderRadius: boxWidth >= LARGE_TILE ? radii.lg : radii.md, backgroundColor: colors.controlTrack, overflow: 'hidden' } : null;

  const face = rig ? (
    <>
      {rig.crown ? <Layer xml={rig.crown} width={width} height={height} /> : null}
      <Animated.View style={[StyleSheet.absoluteFill, parts?.earLeft]}>
        <Layer xml={rig.earLeft} width={width} height={height} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, parts?.earRight]}>
        <Layer xml={rig.earRight} width={width} height={height} />
      </Animated.View>
      <Layer xml={rig.face} width={width} height={height} />
      <Layer xml={rig.whites} width={width} height={height} />
      <Animated.View style={[StyleSheet.absoluteFill, pupils?.left]}>
        <Layer xml={rig.pupilLeft} width={width} height={height} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, pupils?.right]}>
        <Layer xml={rig.pupilRight} width={width} height={height} />
      </Animated.View>
      {eyes === 'open' ? null : <Layer xml={eyes === 'half' ? rig.half : layers.eyes[eyes]} width={width} height={height} />}
    </>
  ) : (
    <>
      <Layer xml={layers.bare} width={width} height={height} />
      {layers.hair ? (
        <Animated.View style={[StyleSheet.absoluteFill, moving.hair]}>
          <Layer xml={layers.hair.art} width={width} height={height} />
        </Animated.View>
      ) : null}
      <Layer xml={eyes === 'open' ? openEyes : layers.eyes[eyes]} width={width} height={height} />
    </>
  );
  // The brows as they sit (the deer's lids), over the eyes, and the cheeks if they blush.
  const expression = (
    <>
      {layers.brows[brows] ? <Layer xml={layers.brows[brows]} width={width} height={height} /> : null}
      {blush && layers.cheeks ? <Layer xml={layers.cheeks} width={width} height={height} /> : null}
    </>
  );
  const overlay = layers.moustache ? (
    <>
      <Layer xml={layers.moustache.body} width={width} height={height} />
      <Animated.View style={[StyleSheet.absoluteFill, moving.end]}>
        <Layer xml={layers.moustache.end} width={width} height={height} />
      </Animated.View>
    </>
  ) : layers.overlay ? (
    rig ? (
      <Animated.View style={[StyleSheet.absoluteFill, parts?.nose]}>
        <Layer xml={layers.overlay} width={width} height={height} />
      </Animated.View>
    ) : (
      <Layer xml={layers.overlay} width={width} height={height} />
    )
  ) : null;

  const drawing = (
    <View style={[styles.frame, tile, flip && styles.flip]}>
      <View style={[styles.drawn, { left: (boxWidth - width) / 2, width, height }]}>
        {crop === 'full' ? (
          // The ground under the feet: a soft shadow that shrinks and fades as the figure leaves it.
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shadow,
              {
                width: width * 0.8,
                height: Math.max(6, height * 0.045),
                left: width * 0.1,
                bottom: -height * 0.02,
                ...shadowMotion,
              },
            ]}
          >
            <SvgXml xml={colors.scheme === 'dark' ? SHADOW.dark : SHADOW.light} width={width * 0.8} height={Math.max(6, height * 0.045)} />
          </Animated.View>
        ) : null}
        <Animated.View style={[StyleSheet.absoluteFill, figure]}>
          <Layer xml={layers.body} width={width} height={height} />
          <Animated.View style={[StyleSheet.absoluteFill, turn]}>
            {face}
            {expression}
            <Layer xml={layers.mouths[mouth]} width={width} height={height} />
            {overlay}
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );

  const label = t(resting ? 'characters.resting' : 'characters.saidBy', { name: CHARACTER_NAMES[speaker] });
  // Where the "z"s start: above and beside the head, on the side it faces away from, measured on the head (the bust).
  const inner = 1 - room;
  const eyeX = boxWidth * (room / 2 + (flip ? 1 - layers.eyesAt.x : layers.eyesAt.x) * inner);
  const eyeY = boxHeight * (room + layers.eyesAt.y * inner);
  const head = { w: art.bust.w * unit, h: art.bust.h * unit };
  const snooze = resting ? (
    <Snooze
      x={eyeX + (flip ? -1 : 1) * head.w * RESTING.zAt.x}
      y={eyeY - head.h * RESTING.zAt.y}
      rise={head.h * RESTING.zRise}
      side={flip ? -1 : 1}
      reduce={reduce}
      awake={awake}
    />
  ) : null;
  return (
    <Rise delay={reduce ? null : 0} style={[{ width: boxWidth, height: boxHeight }, style]}>
      <View
        ref={root}
        style={styles.fill}
        onLayout={() => {
          placed.current = null;
        }}
      >
        {onPress ? (
          <Pressable onPress={greet} accessibilityRole="image" accessibilityLabel={label} style={styles.fill}>
            {drawing}
          </Pressable>
        ) : (
          <View accessible accessibilityRole="image" accessibilityLabel={label} pointerEvents="none" style={styles.fill}>
            {drawing}
          </View>
        )}
        {snooze}
      </View>
    </Rise>
  );
}

/** The "z"s by a resting character's head: three at a time, each growing as it drifts up and away. */
function Snooze({ x, y, rise, side, reduce, awake }: { x: number; y: number; rise: number; side: 1 | -1; reduce: boolean; awake: boolean }): React.JSX.Element {
  const { colors } = useTheme();
  const drift = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    if (reduce || !awake) return;
    const loops = drift.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay((i * RESTING.zMs) / drift.length),
          Animated.timing(value, { toValue: 1, duration: RESTING.zMs, easing: Easing.out(Easing.quad), useNativeDriver: true, isInteraction: false }),
          Animated.timing(value, { toValue: 0, duration: 0, useNativeDriver: true, isInteraction: false }),
          Animated.delay(RESTING.zMs - (i * RESTING.zMs) / drift.length),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [reduce, awake, drift]);
  const size = Math.max(14, rise * 0.5);
  return (
    <View pointerEvents="none" style={[styles.snooze, { left: x, top: y }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {drift.map((value, i) => {
        // Under Reduce Motion, two still "z"s, the second higher and bigger.
        const still = { opacity: i === 2 ? 0 : 0.8, transform: [{ translateX: side * i * size * 0.7 }, { translateY: -i * size * 0.9 }, { scale: 0.8 + i * 0.3 }] };
        const moving = {
          opacity: value.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 0.85, 0.85, 0] }),
          transform: [
            { translateX: value.interpolate({ inputRange: [0, 1], outputRange: [0, side * rise * 0.45] }) },
            { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -rise] }) },
            { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.3] }) },
          ],
        };
        return (
          <Animated.Text key={i} style={[styles.z, { fontSize: size, color: colors.textSecondary }, reduce || !awake ? still : moving]}>
            z
          </Animated.Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  frame: { flex: 1 },
  layer: { position: 'absolute', left: 0, top: 0 },
  flip: { transform: [{ scaleX: -1 }] },
  // The drawing in its box, on the foot: the whole box but in a tile.
  drawn: { position: 'absolute', bottom: 0 },
  shadow: { position: 'absolute' },
  snooze: { position: 'absolute', width: 1, height: 1, overflow: 'visible' },
  z: { position: 'absolute', left: 0, bottom: 0, fontWeight: '800' },
});
