import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  ACTS,
  BLINK_STEPS,
  BREATH,
  CHARACTER_NAMES,
  HABITS,
  SWAY,
  between,
  characterArt,
  glanceTarget,
  keySteps,
  lookToward,
  speakingFrame,
  voiceTimeline,
  type ActName,
  type EyeState,
  type Keys,
  type RecordingVoice,
  type SpeakerId,
  type Viseme,
} from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { Rise } from '../theme/MotionParts';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { useGaze } from './gaze';
import { characterLayers, type CharacterCrop, type Share } from './layers';
import type { PlaybackClock } from './voice';

export { CHARACTER_SIZE, knownVoice, type PlaybackClock } from './voice';

/** Something a character reacts to: an answer that was right, or one that was not yet. */
export type CharacterReaction = 'cheer' | 'hmm';

export interface SpeakingCharacterProps {
  speaker: SpeakerId;
  /** the player the screen already plays the recording with; null before it has one */
  player: PlaybackClock | null;
  /** whether the screen is playing this recording now: the character follows it only then */
  playing: boolean;
  /** the recording, so that another one starts from its own timeline */
  source?: string | null;
  voice?: RecordingVoice | null;
  /** the words said, to move the mouth from when the recording has no timeline of its own */
  text?: string | null;
  /** the whole figure, head to waist, or head and shoulders (in a rounded tile) */
  crop?: CharacterCrop;
  /** how wide it is drawn, in points; the height follows from the drawing */
  size?: number;
  /** or how tall, and the width follows */
  height?: number;
  /** turned the other way round, to face what lies to its left */
  flip?: boolean;
  /** what it has just seen: it reacts each time this changes, and when it arrives with one */
  reaction?: CharacterReaction | null;
  /** a tap on the character: it greets you, and then this (say it again, usually) */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** The widest a turn of the head goes, with room to spare: Animated maps the angle onto a string. */
const TURN_RANGE = 30;

/** A bust this wide or wider sits in the larger corner. */
const LARGE_TILE = 88;

/** How long a look takes to reach what it looks at, and to come back. */
const LOOK_MS = { to: 140, back: 420, glance: 260 } as const;

/** A finger's place is measured against the character's at most this often (ms); a drag in between uses the last. */
const REMEASURE_MS = 300;

const ease = Easing.inOut(Easing.quad);

/** The shadow under a standing figure: dark in the middle, gone at the edge. */
const shadowSvg = (colour: string, depth: number): string =>
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20" preserveAspectRatio="none">' +
  `<defs><radialGradient id="ground"><stop offset="0" stop-color="${colour}" stop-opacity="${depth}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient></defs>` +
  '<ellipse cx="50" cy="10" rx="50" ry="10" fill="url(#ground)"/></svg>';
const SHADOW = { light: shadowSvg('#2a1408', 0.3), dark: shadowSvg('#000000', 0.55) } as const;

/**
 * One part of the drawing. Memoised on its markup, so when the mouth changes
 * the body, the head and the eyes are not drawn again.
 */
const Layer = memo(function Layer({ xml, width, height }: { xml: string; width: number; height: number }) {
  return <SvgXml xml={xml} width={width} height={height} style={styles.layer} />;
});

const origin = (s: Share): string => `${s.x * 100}% ${s.y * 100}%`;
const degrees = (value: Animated.AnimatedInterpolation<number> | Animated.Value | Animated.AnimatedAddition<number>, sign = 1) =>
  value.interpolate({ inputRange: [-TURN_RANGE, TURN_RANGE], outputRange: [`${-sign * TURN_RANGE}deg`, `${sign * TURN_RANGE}deg`] });

/**
 * Hevalo, Hamo or Xezo saying the recording the screen is playing — and, in
 * between, alive.
 *
 * The character follows the screen's own player — never a second one — by
 * reading where the recording is on every animation frame while it plays,
 * and works out the mouth and the nod for that moment with `speakingFrame`,
 * the same as the website does.
 *
 * Between the words it breathes, its head drifts a degree, it blinks every
 * few seconds and glances about now and then; the deer twitches an ear or
 * sniffs (shared `HABITS`). Its eyes follow a finger anywhere on the screen
 * (`GazeArea`). A tap gets a greeting — a hop, ears up, a smile — and then
 * `onPress`; `reaction` gets a cheer for a right answer and a curious tilt of
 * the head for one that was not yet (shared `ACTS`). Every movement is a
 * transform on the native driver, so none of it redraws a picture; only the
 * eyes and the mouth are drawn again, when their shape changes.
 *
 * Drawn as stacked layers in one frame: the body, then the head and what is
 * on it. The deer's ears, pupils and nose are layers of their own so they can
 * move; the people's eyes and mouths are drawn whole.
 *
 * Under Reduce Motion nothing moves but the mouth (it says what the sound
 * says), the blinks, and the face a reaction or a tap puts on. Timers stop
 * when the app goes to the background or the character goes.
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
  reaction = null,
  onPress,
  style,
}: SpeakingCharacterProps): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const gaze = useGaze();
  const layers = characterLayers(speaker, crop);
  const art = characterArt(speaker);
  const rig = layers.rig;
  const width = size ?? ((tall ?? 0) * layers.frame.w) / layers.frame.h;
  const height = (width * layers.frame.h) / layers.frame.w;
  /** points per drawing unit */
  const unit = width / layers.frame.w;

  // ---- what the face shows ----
  const [speech, setSpeech] = useState<Viseme>('rest');
  const [blink, setBlink] = useState<EyeState>('open');
  const [actEyes, setActEyes] = useState<EyeState | null>(null);
  const [actMouth, setActMouth] = useState<Viseme | null>(null);
  const [awake, setAwake] = useState(AppState.currentState !== 'background');

  // ---- what moves, all on the native driver ----
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
  }).current;

  const born = useRef(Date.now());
  const shownNod = useRef(0);

  // the recording's length once the player knows it, kept with the recording it belongs to
  const [length, setLength] = useState<{ source: string | null; ms: number } | null>(null);
  const durationMs = length && length.source === source ? length.ms : null;
  const timeline = useMemo(() => voiceTimeline(voice, text, durationMs), [voice, text, durationMs]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAwake(state !== 'background'));
    return () => sub.remove();
  }, []);

  // ---- the words ----
  const live = playing && player !== null && awake;
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

  // ---- timers, all cleared together ----
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

  // ---- looking ----
  const looking = useRef<Animated.CompositeAnimation | null>(null);
  const look = useCallback(
    (x: number, y: number, focus: number, ms: number) => {
      looking.current?.stop();
      const to = (value: Animated.Value, toValue: number) => Animated.timing(value, { toValue, duration: ms, easing: ease, useNativeDriver: true });
      looking.current = Animated.parallel([to(values.lookX, flip ? -x : x), to(values.lookY, y), to(values.focus, focus)]);
      looking.current.start();
    },
    [values, flip],
  );
  const following = useRef(false);

  // ---- acts ----
  const acting = useRef<{ anim: Animated.CompositeAnimation; holds: ReturnType<typeof setTimeout>[] } | null>(null);
  const stopAct = useCallback(() => {
    const running = acting.current;
    if (!running) return;
    running.anim.stop();
    running.holds.forEach((id) => {
      clearTimeout(id);
      timers.current.delete(id);
    });
    acting.current = null;
    setActEyes(null);
    setActMouth(null);
  }, []);
  const play = useCallback(
    (name: ActName) => {
      const act = ACTS[name];
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
      }
      const holds: ReturnType<typeof setTimeout>[] = [];
      for (const [from, to, state] of act.eyes ?? []) {
        holds.push(later(from * act.ms, () => setActEyes(state)));
        holds.push(later(to * act.ms, () => setActEyes((now) => (now === state ? null : now))));
      }
      for (const [from, to, shape] of act.mouth ?? []) {
        holds.push(later(from * act.ms, () => setActMouth(shape)));
        holds.push(later(to * act.ms, () => setActMouth((now) => (now === shape ? null : now))));
      }
      if (act.look && rig && !reduce) {
        const { x, y } = act.look;
        look(x, y, 1, LOOK_MS.glance);
        holds.push(later(act.ms * 0.8, () => (following.current ? undefined : look(0, 0, 0, LOOK_MS.back))));
      }
      const anim = Animated.parallel(tracks);
      acting.current = { anim, holds };
      anim.start(({ finished }) => {
        if (finished && acting.current?.anim === anim) acting.current = null;
      });
    },
    [stopAct, reduce, rig, values, later, look],
  );

  // the latest `play`, for the effects below that should run when what they watch changes and not when it does
  const playRef = useRef(play);
  playRef.current = play;

  // a reaction plays when it is given, and each time it changes; the deer pricks up his ears on arriving
  const arrived = useRef(false);
  useEffect(() => {
    if (reaction) {
      arrived.current = true;
      const id = later(120, () => playRef.current(reaction));
      return () => clearTimeout(id);
    }
    if (arrived.current || !rig) return;
    arrived.current = true;
    const id = later(160, () => playRef.current('arrive'));
    return () => clearTimeout(id);
  }, [reaction, rig, later]);
  useEffect(() => stopAct, [stopAct]);

  // ---- breathing, and the head's drift ----
  useEffect(() => {
    if (reduce || !awake) return;
    const { breathe, sway } = values;
    const half = BREATH.ms / 2;
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1 + BREATH.depth, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
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
  }, [reduce, awake, values]);

  // ---- habits: blinks for everyone, glances, and the deer's ears and nose ----
  useEffect(() => {
    if (!awake) return;
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
    if (rig && !reduce) {
      every(HABITS.glance, () => {
        if (following.current || acting.current) return;
        const target = glanceTarget();
        look(target.x, target.y, 1, LOOK_MS.glance);
        habits.push(setTimeout(() => (following.current ? undefined : look(0, 0, 0, LOOK_MS.back)), between(HABITS.glanceHold)));
      });
      every(HABITS.twitch, () => (acting.current ? undefined : playRef.current(Math.random() < 0.5 ? 'twitchLeft' : 'twitchRight')));
      every(HABITS.sniff, () => (acting.current ? undefined : playRef.current('sniff')));
    }
    return () => {
      habits.forEach(clearTimeout);
      setBlink('open');
    };
  }, [awake, rig, reduce, look]);

  // ---- following a finger ----
  const root = useRef<View>(null);
  const placed = useRef<{ x: number; y: number; w: number; h: number; at: number } | null>(null);
  useEffect(() => {
    if (!gaze || !rig || reduce) return;
    const aim = (point: { x: number; y: number }): void => {
      const box = placed.current;
      if (!box || box.w === 0) return;
      const eyeX = box.x + (flip ? 1 - layers.eyesAt.x : layers.eyesAt.x) * box.w;
      const eyeY = box.y + layers.eyesAt.y * box.h;
      // measured on the screen; `look` turns it round for a character drawn facing the other way
      const where = lookToward(point.x - eyeX, point.y - eyeY, Math.max(box.w, box.h) * 1.2);
      following.current = true;
      look(where.x, where.y, 1, LOOK_MS.to);
    };
    return gaze.subscribe((point) => {
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
  }, [gaze, rig, reduce, flip, layers, look]);

  const greet = (): void => {
    haptic('tap');
    playRef.current('greet');
    onPress?.();
  };

  // ---- drawing ----
  const eyes: EyeState = actEyes ?? blink;
  const mouth: Viseme = live && speech !== 'rest' ? speech : actMouth ?? speech;

  const figure = useMemo(
    () => ({
      transformOrigin: '50% 100%',
      transform: [
        { translateY: Animated.multiply(values.rise, -height) },
        { scaleY: Animated.multiply(values.breathe, values.stretch) },
        // a crouch spreads a little and a stretch narrows, as something soft does
        { scaleX: values.stretch.interpolate({ inputRange: [0.9, 1, 1.1], outputRange: [1.06, 1, 0.94] }) },
      ],
    }),
    [values, height],
  );
  const turn = useMemo(
    () => ({
      transformOrigin: origin(layers.pivot),
      transform: [{ rotate: degrees(Animated.add(Animated.add(values.nod, values.sway), values.tilt)) }],
    }),
    [layers, values],
  );
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

  // the deer's ears and nose, each about its own point; made once, so a new mouth does not rebuild them
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

  const tile: ViewStyle | null =
    crop === 'bust' ? { borderRadius: width >= LARGE_TILE ? radii.lg : radii.md, backgroundColor: colors.controlTrack, overflow: 'hidden' } : null;

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
      <Layer xml={layers.head} width={width} height={height} />
      <Layer xml={layers.eyes[eyes]} width={width} height={height} />
    </>
  );

  const drawing = (
    <View style={[styles.frame, tile, flip && styles.flip]}>
      {crop === 'full' ? (
        // the ground under the feet: a soft shadow that shrinks and fades as the figure leaves it
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
          <Layer xml={layers.mouths[mouth]} width={width} height={height} />
          {layers.overlay ? (
            rig ? (
              <Animated.View style={[StyleSheet.absoluteFill, parts?.nose]}>
                <Layer xml={layers.overlay} width={width} height={height} />
              </Animated.View>
            ) : (
              <Layer xml={layers.overlay} width={width} height={height} />
            )
          ) : null}
        </Animated.View>
      </Animated.View>
    </View>
  );

  const label = t('characters.saidBy', { name: CHARACTER_NAMES[speaker] });
  return (
    <Rise delay={reduce ? null : 0} style={[{ width, height }, style]}>
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
      </View>
    </Rise>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  frame: { flex: 1 },
  layer: { position: 'absolute', left: 0, top: 0 },
  flip: { transform: [{ scaleX: -1 }] },
  shadow: { position: 'absolute' },
});
