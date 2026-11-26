import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  CHAPTER_ART,
  CHAPTER_ART_LOOP,
  PATH_CHEST_HINGE,
  PATH_PIGEON_FLIGHT,
  PATH_SCENES,
  PATH_SCENE_BOX,
  PATH_SCENE_MOTION,
  PATH_SCENE_SPRITE_BOX,
  PATH_SLATE_LETTERS,
  PATH_STOP_ART,
  chapterArtOf,
  chapterArtSvg,
  characterArt,
  cropBox,
  letterBirdSvg,
  pathChestSvg,
  pathCoinSvg,
  pathGarlandSvg,
  pathScenePropSvg,
  pathSceneSpriteSvg,
  sampleKeys,
  sceneBeat,
  type ActName,
  type ChapterLoopKind,
  type PathSceneId,
  type PathSceneSprite,
  type SceneBox,
} from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { springTo, timing } from '../theme/animate';
import { Pressable } from '../theme/Pressable';

/**
 * The road's living touches, drawn from @kurda/shared (art/chapter-art.ts, art/path-scenes.ts) as on the website: each
 * chapter's vignette in its banner, the little scene beside each unit's road, and the unit's sandûq. All of it is for
 * the eye and hidden from screen readers. It moves only while its unit is in view and the app in front (`live`), by
 * native-driver transforms and opacity, and not at all under Reduce Motion.
 */

/** A native-driver loop of `value` from 0 to 1 over `ms`, while `on`; at rest otherwise. */
function useLoop(on: boolean, ms: number, easing: (t: number) => number = Easing.linear): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) {
      value.setValue(0);
      return;
    }
    const run = Animated.loop(Animated.timing(value, { toValue: 1, duration: ms, easing, useNativeDriver: true, isInteraction: false }));
    run.start();
    return () => run.stop();
  }, [on, ms, easing, value]);
  return value;
}

/** A value run once from 0 to 1 over `ms` after `delay` when mounted (with `on`), or left at 1. */
function useOnce(on: boolean, ms: number, delay = 0, easing?: (t: number) => number): Animated.Value {
  const value = useRef(new Animated.Value(on ? 0 : 1)).current;
  useEffect(() => {
    if (!on) return;
    const run = timing(value, 1, ms, { delay, easing });
    run.start();
    return () => run.stop();
  }, [on, ms, delay, easing, value]);
  return value;
}

/** How a chapter vignette's moving part moves, from its loop's 0 to 1. */
function loopStyle(kind: ChapterLoopKind, t: Animated.Value, origin: string): object {
  const wave = t.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, 1, 0, -1, 0] });
  switch (kind) {
    case 'rise':
      // Only a little, so it never reaches the banner's words.
      return { opacity: t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] }), transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [3, -5] }) }] };
    case 'fall':
      return {
        transformOrigin: origin,
        opacity: t.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6, 2] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-4, 60] }) },
          { rotate: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-20deg', '25deg', '-10deg'] }) },
        ],
      };
    case 'swing':
      return { transformOrigin: origin, transform: [{ rotate: wave.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] }) }] };
    case 'creak':
      return { transformOrigin: origin, transform: [{ scaleX: t.interpolate({ inputRange: [0, 0.6, 0.75, 0.88, 1], outputRange: [1, 1, 0.86, 0.96, 1] }) }] };
    case 'flicker':
      return {
        transformOrigin: origin,
        transform: [{ scaleY: wave.interpolate({ inputRange: [-1, 1], outputRange: [0.9, 1.1] }) }, { scaleX: wave.interpolate({ inputRange: [-1, 1], outputRange: [1.05, 0.95] }) }],
      };
    case 'bob':
      return { transform: [{ translateY: wave.interpolate({ inputRange: [-1, 1], outputRange: [0, -2] }) }] };
    case 'orbit':
      return { transformOrigin: origin, transform: [{ rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] };
  }
}

/** How long each kind of vignette's loop takes, once round, as on the website (path.css). */
const LOOP_MS: Record<ChapterLoopKind, number> = { rise: 2800, fall: 4200, swing: 2800, creak: 4400, flicker: 1400, bob: 1800, orbit: 3200 };

/** A chapter's vignette in its banner, standing on the banner's foot, with its one moving part laid over it, moving while `live`. */
export function ChapterArt({ chapter, ground, height, live: shown = true }: { chapter: number; ground: string; height: number; live?: boolean }): React.JSX.Element {
  const id = chapterArtOf(chapter);
  const loop = CHAPTER_ART_LOOP[id];
  const s = height / CHAPTER_ART.h;
  const still = useMemo(() => chapterArtSvg({ chapter: id, ground, height }), [id, ground, height]);
  const moving = useMemo(() => chapterArtSvg({ chapter: id, part: 'loop', height: loop.h * s }), [id, loop, s]);
  const live = useMotionAlive() && shown;
  const t = useLoop(live, LOOP_MS[loop.kind]);
  const origin = `${(((loop.px - loop.x) / loop.w) * 100).toFixed(1)}% ${(((loop.py - loop.y) / loop.h) * 100).toFixed(1)}%`;
  return (
    <View style={{ width: CHAPTER_ART.w * s, height }} pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={`lp-chapter-art-${id}`}>
      <SvgXml xml={still} width={CHAPTER_ART.w * s} height={height} />
      <Animated.View style={[styles.abs, { left: loop.x * s, top: loop.y * s, width: loop.w * s, height: loop.h * s }, live ? loopStyle(loop.kind, t, origin) : null]}>
        <SvgXml xml={moving} width={loop.w * s} height={loop.h * s} />
      </Animated.View>
    </View>
  );
}

/** A box in scene points as a style. */
const at = (b: SceneBox): object => ({ left: b.x, top: b.y, width: b.w, height: b.h });

/** A scene's sprite at (x, y) on the scene, the size of its own canvas. */
function Sprite({ sprite, x, y, dark, style }: { sprite: PathSceneSprite; x: number; y: number; dark: boolean; style?: object | null }): React.JSX.Element {
  const box = PATH_SCENE_SPRITE_BOX[sprite];
  const xml = useMemo(() => pathSceneSpriteSvg({ sprite, dark }), [sprite, dark]);
  return (
    <Animated.View style={[styles.abs, { left: x, top: y, width: box.w, height: box.h }, style]}>
      <SvgXml xml={xml} width={box.w} height={box.h} />
    </Animated.View>
  );
}

/** A prop of a scene's layout, in its box. */
function Prop({ scene, prop, dark }: { scene: PathSceneId; prop: string; dark: boolean }): React.JSX.Element {
  const layout = PATH_SCENES[scene];
  const box = layout.back[prop] ?? layout.front[prop]!;
  const xml = useMemo(() => pathScenePropSvg({ scene, prop, dark }), [scene, prop, dark]);
  return (
    <View style={[styles.abs, at(box)]}>
      <SvgXml xml={xml} width={box.w} height={box.h} />
    </View>
  );
}

/** A track (shared keys) as an interpolation, sampled finely so its eased keys move as on the website. */
function track(t: Animated.Value, keys: readonly (readonly [number, number])[], unit = ''): Animated.AnimatedInterpolation<string | number> {
  const inputRange = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
  const values = inputRange.map((x) => sampleKeys(keys, x));
  return t.interpolate({ inputRange, outputRange: unit ? values.map((v) => `${v}${unit}`) : values });
}
/** How finely the pigeon's flight is sampled. */
const SAMPLES = 48;

/** The pigeon trying to land on its post, its letter in its beak (shared `PATH_PIGEON_FLIGHT`), and hopping when tapped. */
function Pigeon({ moving, hop }: { moving: boolean; hop: number }): React.JSX.Element {
  const { actor } = PATH_SCENES.letter;
  const size = 64;
  const up = useMemo(() => letterBirdSvg({ bird: 0, pose: 'wings-up', letter: true, size, shadow: false }), []);
  const down = useMemo(() => letterBirdSvg({ bird: 0, pose: 'wings-down', letter: true, size, shadow: false }), []);
  const perched = useMemo(() => letterBirdSvg({ bird: 0, pose: 'perched', letter: true, size }), []);
  const t = useLoop(moving, PATH_PIGEON_FLIGHT.ms);
  const flap = useLoop(moving, PATH_SCENE_MOTION.flapMs * 2);
  const jump = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (hop === 0 || !moving) return;
    const run = Animated.sequence([timing(jump, 1, 160), springTo(jump, 0, 'bouncy')]);
    run.start();
    return () => run.stop();
  }, [hop, moving, jump]);
  const [from, to] = PATH_PIGEON_FLIGHT.perched;
  const sitting = t.interpolate({ inputRange: [0, from - 0.001, from, to, to + 0.001, 1], outputRange: [0, 0, 1, 1, 0, 0] });
  const flying = t.interpolate({ inputRange: [0, from - 0.001, from, to, to + 0.001, 1], outputRange: [1, 1, 0, 0, 1, 1] });
  const wingUp = flap.interpolate({ inputRange: [0, 0.5, 0.5001, 1], outputRange: [1, 1, 0, 0] });
  const wingDown = flap.interpolate({ inputRange: [0, 0.5, 0.5001, 1], outputRange: [0, 0, 1, 1] });
  const flight = moving
    ? {
        opacity: track(t, PATH_PIGEON_FLIGHT.shown),
        transform: [{ translateX: track(t, PATH_PIGEON_FLIGHT.x) }, { translateY: track(t, PATH_PIGEON_FLIGHT.y) }, { rotate: track(t, PATH_PIGEON_FLIGHT.tilt, 'deg') }],
      }
    : null;
  return (
    <Animated.View
      style={[styles.abs, { left: actor.x - size / 2, top: actor.y + actor.h - (size * 100) / 120, width: size, height: size }, { transform: [{ translateY: jump.interpolate({ inputRange: [0, 1], outputRange: [0, -12] }) }] }]}
      testID="lp-scene-pigeon"
    >
      <Animated.View style={[StyleSheet.absoluteFill, flight]}>
        <Animated.View style={[StyleSheet.absoluteFill, moving ? { opacity: sitting } : null]}>
          <SvgXml xml={perched} width={size} height={size} />
        </Animated.View>
        {moving ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: flying }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: wingUp }]}>
              <SvgXml xml={up} width={size} height={size} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: wingDown }]}>
              <SvgXml xml={down} width={size} height={size} />
            </Animated.View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

/** Crumbs falling from a bite. */
function Crumbs({ x, y, dark }: { x: number; y: number; dark: boolean }): React.JSX.Element {
  const t = useOnce(true, PATH_SCENE_MOTION.crumbMs, 0, Easing.in(Easing.quad));
  return (
    <Sprite
      sprite="crumbs"
      x={x}
      y={y}
      dark={dark}
      style={{ opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) }, { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) }] }}
    />
  );
}

/** The eaten apple's core dropping, and a new apple growing from its stalk. */
function Regrow({ x, y, dark }: { x: number; y: number; dark: boolean }): React.JSX.Element {
  const drop = useOnce(true, PATH_SCENE_MOTION.dropMs, 0, Easing.in(Easing.quad));
  const grow = useOnce(true, PATH_SCENE_MOTION.growMs, 300);
  return (
    <>
      <Sprite
        sprite="core"
        x={x}
        y={y}
        dark={dark}
        style={{
          transformOrigin: '50% 0%',
          opacity: drop.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
          transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [0, 40] }) }, { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '28deg'] }) }],
        }}
      />
      <Sprite sprite="apple-0" x={x} y={y} dark={dark} style={{ transformOrigin: '50% 0%', opacity: grow, transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }} />
    </>
  );
}

/** A sugar cube tossed from the bowl into the glass, and its splash. */
function Cube({ dark }: { dark: boolean }): React.JSX.Element {
  const t = useOnce(true, PATH_SCENE_MOTION.cubeMs, 0, Easing.inOut(Easing.quad));
  const splash = useOnce(true, 520, PATH_SCENE_MOTION.cubeMs - 40);
  return (
    <>
      <Sprite
        sprite="cube"
        x={84}
        y={58}
        dark={dark}
        style={{
          opacity: t.interpolate({ inputRange: [0, 0.9, 1], outputRange: [1, 1, 0] }),
          transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -48] }) }, { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -24, 2] }) }],
        }}
      />
      <Sprite
        sprite="splash"
        x={32}
        y={52}
        dark={dark}
        style={{ opacity: splash.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 0] }), transform: [{ scale: splash.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2] }) }] }}
      />
    </>
  );
}

/** Steam rising from the glass, over and over while the scene moves. */
function Steam({ moving, dark }: { moving: boolean; dark: boolean }): React.JSX.Element {
  const t = useLoop(moving, 2800);
  return (
    <Sprite
      sprite="steam"
      x={33}
      y={30}
      dark={dark}
      style={moving ? { opacity: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }), transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [4, -10] }) }] } : null}
    />
  );
}

/** A one-off moment of a sprite's, by name: Hevalo holding out his apple, or his hiccup's bubble. */
function Moment({ kind, x, y, sprite, dark }: { kind: 'offer' | 'hic'; x: number; y: number; sprite: PathSceneSprite; dark: boolean }): React.JSX.Element {
  const t = useOnce(true, PATH_SCENE_MOTION.tapMs);
  const style =
    kind === 'offer'
      ? {
          transformOrigin: '50% 0%',
          transform: [
            { scale: t.interpolate({ inputRange: [0, 0.4, 0.7, 1], outputRange: [1, 1.35, 1.2, 1] }) },
            { rotate: t.interpolate({ inputRange: [0, 0.4, 0.7, 1], outputRange: ['0deg', '-16deg', '8deg', '0deg'] }) },
          ],
        }
      : {
          opacity: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }),
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [4, -18] }) }, { scale: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1, 1] }) }],
        };
  return <Sprite sprite={sprite} x={x} y={y} dark={dark} style={style} />;
}

/** One of the slate's letters, chalked in and wiped away. */
function Chalk({ sprite, x, y, shown, moving, flip }: { sprite: PathSceneSprite; x: number; y: number; shown: boolean; moving: boolean; flip: boolean }): React.JSX.Element {
  const value = useRef(new Animated.Value(shown ? 1 : 0)).current;
  useEffect(() => {
    if (!moving) {
      value.setValue(shown ? 1 : 0);
      return;
    }
    const run = timing(value, shown ? 1 : 0, PATH_SCENE_MOTION.chalkMs);
    run.start();
    return () => run.stop();
  }, [shown, moving, value]);
  // The slate is mirrored with the scene; its letters are turned back so they read the right way round.
  return <Sprite sprite={sprite} x={x} y={y} dark={false} style={{ opacity: value, transform: flip ? [{ scaleX: -1 }] : [] }} />;
}

/** The act a tap gets from each scene's character: Hevalo offers his apple, then hiccups, by turns. */
function tapAct(scene: PathSceneId, taps: number): ActName | null {
  if (scene === 'apple') return taps % 2 === 1 ? 'offer' : 'hiccup';
  if (scene === 'tea') return 'chuckle';
  if (scene === 'slate') return 'cheer';
  return null;
}

/**
 * A unit's little scene beside its road (shared `pathScene`, `sceneBeat`): Hevalo eating his apple bite by bite over the
 * orchard wall, Hamo sugaring his tea, Xezo chalking ê, ç and ş, or the pigeon trying to land with a letter, with the
 * chapter's rounds as stars strung under it. `flip` mirrors it for the road's other side, all but the slate's letters.
 * A tap gets a little moment of its own.
 */
export function PathScene({
  scene,
  flip,
  dark,
  rounds,
  live,
  left,
  top,
}: {
  scene: PathSceneId;
  flip: boolean;
  dark: boolean;
  rounds: number;
  /** Its unit is in view and the app in front. */
  live: boolean;
  left: number;
  top: number;
}): React.JSX.Element {
  const reduce = useReducedMotion();
  const moving = live && !reduce;
  const layout = PATH_SCENES[scene];
  const [beat, setBeat] = useState(0);
  const [tap, setTap] = useState({ count: 0, beat: -1 });
  useEffect(() => {
    if (!moving || scene === 'letter') return;
    const id = setInterval(() => setBeat((b) => b + 1), PATH_SCENE_MOTION.beatMs[scene]);
    return () => clearInterval(id);
  }, [moving, scene]);
  const now = sceneBeat(scene, beat);
  // A tap's moment lasts until the next beat, whose act then follows.
  const tapped = tap.count > 0 && tap.beat === beat ? tapAct(scene, tap.count) : null;
  const cue = tapped ? { act: tapped, at: -tap.count } : now.act ? { act: now.act, at: beat } : null;
  const garland = useMemo(() => pathGarlandSvg({ lit: rounds, dark }), [rounds, dark]);
  const actorArt = layout.who === 'pigeon' ? null : characterArt(layout.who);
  const frame = actorArt ? cropBox(actorArt, layout.actor.crop) : null;
  const width = frame ? (layout.actor.h * frame.w) / frame.h : 0;
  const apple = PATH_SCENES.apple.front.apple!;
  const hit = { left: Math.max(0, layout.actor.x - 34), top: Math.max(0, layout.actor.y), width: 68, height: Math.min(PATH_SCENE_BOX.h - layout.actor.y, scene === 'letter' ? 100 : layout.actor.h) };
  return (
    <View
      style={[styles.scene, { left, top }, flip ? styles.flipped : null]}
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`lp-scene-${scene}`}
    >
      {Object.keys(layout.back).map((p) => (
        <Prop key={p} scene={scene} prop={p} dark={dark} />
      ))}
      {actorArt ? (
        <View style={[styles.abs, { left: layout.actor.x - width / 2, top: layout.actor.y, width, height: layout.actor.h }]}>
          <SpeakingCharacter speaker={layout.who as 'hevalo' | 'hamo' | 'xezo'} player={null} playing={false} crop={layout.actor.crop} height={layout.actor.h} cue={cue} />
        </View>
      ) : (
        <Pigeon moving={moving} hop={tap.count} />
      )}
      {Object.keys(layout.front)
        .filter((p) => !(scene === 'apple' && p === 'apple'))
        .map((p) => (
          <Prop key={p} scene={scene} prop={p} dark={dark} />
        ))}
      {scene === 'apple' ? (
        <>
          {now.growing && moving ? (
            <Regrow key={`grow${beat}`} x={apple.x} y={apple.y} dark={dark} />
          ) : tapped === 'offer' && moving ? (
            <Moment key={`offer${tap.count}`} kind="offer" sprite={now.bites >= 5 ? 'core' : (`apple-${now.bites}` as PathSceneSprite)} x={apple.x} y={apple.y} dark={dark} />
          ) : (
            <Sprite key={`apple${now.bites}`} sprite={now.bites >= 5 ? 'core' : (`apple-${now.bites}` as PathSceneSprite)} x={apple.x} y={apple.y} dark={dark} />
          )}
          {now.crumbs && moving ? <Crumbs key={`crumbs${beat}`} x={apple.x + 12} y={apple.y + 26} dark={dark} /> : null}
          {tapped === 'hiccup' && moving ? <Moment key={`hic${tap.count}`} kind="hic" sprite="hic" x={layout.actor.x - 6} y={34} dark={dark} /> : null}
        </>
      ) : null}
      {scene === 'tea' ? (
        <>
          <Steam moving={moving} dark={dark} />
          {now.cube && moving ? <Cube key={`cube${beat}`} dark={dark} /> : null}
        </>
      ) : null}
      {scene === 'slate'
        ? PATH_SLATE_LETTERS.map((l, i) => (
            <Chalk
              key={l.sprite}
              sprite={l.sprite}
              // Mirrored, the slate's places run the other way, so the letters still read ê, ç, ş.
              x={flip ? PATH_SLATE_LETTERS[PATH_SLATE_LETTERS.length - 1 - i]!.x : l.x}
              y={l.y}
              shown={!moving || (i < now.letters && !now.wiping)}
              moving={moving}
              flip={flip}
            />
          ))
        : null}
      <View style={[styles.abs, at(layout.garland)]}>
        <SvgXml xml={garland} width={layout.garland.w} height={layout.garland.h} />
      </View>
      <Pressable style={[styles.abs, hit]} onPress={() => setTap((t) => ({ count: t.count + 1, beat }))} aria-hidden testID={`lp-scene-${scene}-tap`} />
    </View>
  );
}

/** How a sandûq's coins jump out of it as it opens, in points from its mouth. */
const COINS = [
  { x: -22, y: -46, r: -30, d: 0 },
  { x: 4, y: -58, r: 20, d: 70 },
  { x: 26, y: -42, r: 40, d: 140 },
] as const;

/** One coin thrown out of the chest, up and away. */
function Coin({ xml, size, at: c }: { xml: string; size: number; at: (typeof COINS)[number] }): React.JSX.Element {
  const t = useOnce(true, 1000, c.d, Easing.out(Easing.quad));
  return (
    <Animated.View
      style={[
        styles.abs,
        { left: size / 2 - 9, top: size * 0.42, width: 18, height: 18 },
        {
          opacity: t.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, c.x, c.x * 1.25] }) },
            { translateY: t.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, c.y, c.y + 34] }) },
            { rotate: t.interpolate({ inputRange: [0, 0.55, 1], outputRange: ['0deg', `${c.r}deg`, `${c.r * 2}deg`] }) },
          ],
        },
      ]}
    >
      <SvgXml xml={xml} width={18} height={18} />
    </Animated.View>
  );
}

/**
 * A unit's sandûq beside its road: shut until the unit is done, then open on its gold. A little shiver now and then
 * while shut; tapped shut it rattles on its lock; tapped open, or as it opens, its lid flies up and coins jump out.
 */
export function PathChest({ open, dark, size, live, left, top }: { open: boolean; dark: boolean; size: number; live: boolean; left: number; top: number }): React.JSX.Element {
  const reduce = useReducedMotion();
  const moving = live && !reduce;
  const body = useMemo(() => pathChestSvg({ open, part: 'body', dark, size }), [open, dark, size]);
  const lid = useMemo(() => pathChestSvg({ open, part: open ? 'open' : 'lid', dark, size }), [open, dark, size]);
  const coin = useMemo(() => pathCoinSvg({ dark, size: 18 }), [dark]);
  const shiver = useRef(new Animated.Value(0)).current;
  const lidUp = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const [burst, setBurst] = useState(0);
  // Bursts open on the beat it is won, if that happens while it is on the screen.
  const was = useRef(open);
  useEffect(() => {
    if (open && !was.current && !reduce) setBurst((n) => n + 1);
    was.current = open;
  }, [open, reduce]);
  useEffect(() => {
    if (!moving || open) {
      shiver.setValue(0);
      return;
    }
    const run = Animated.loop(Animated.sequence([Animated.delay(4000), timing(shiver, 1, 90), timing(shiver, -1, 140), timing(shiver, 0.5, 120), timing(shiver, 0, 100)]));
    run.start();
    return () => run.stop();
  }, [moving, open, shiver]);
  useEffect(() => {
    if (burst === 0) return;
    lidUp.setValue(0);
    hop.setValue(0);
    const run = Animated.parallel([springTo(lidUp, 1, 'bouncy'), Animated.sequence([timing(hop, 1, 200), springTo(hop, 0, 'bouncy')])]);
    run.start();
    return () => run.stop();
  }, [burst, lidUp, hop]);
  const press = (): void => {
    if (reduce) return;
    if (open) {
      setBurst((n) => n + 1);
      return;
    }
    shiver.stopAnimation();
    Animated.sequence([timing(shiver, 1, 90), timing(shiver, -1, 140), timing(shiver, 0.5, 120), timing(shiver, 0, 100)]).start();
  };
  const s = size / PATH_STOP_ART.box;
  const hinge = `${PATH_CHEST_HINGE.x * s}px ${PATH_CHEST_HINGE.y * s}px`;
  return (
    <Pressable onPress={press} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.abs, { left, top, width: size, height: size }]} testID="lp-chest">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transformOrigin: '50% 90%',
            transform: [{ translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -18] }) }, { rotate: shiver.interpolate({ inputRange: [-1, 1], outputRange: ['-6deg', '6deg'] }) }],
          },
        ]}
      >
        <SvgXml xml={body} width={size} height={size} style={StyleSheet.absoluteFill} />
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            burst > 0 && open
              ? { transformOrigin: hinge, opacity: lidUp.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }), transform: [{ scaleY: lidUp.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }
              : null,
          ]}
        >
          <SvgXml xml={lid} width={size} height={size} />
        </Animated.View>
        {open && burst > 0 ? COINS.map((c, i) => <Coin key={`${burst}-${i}`} xml={coin} size={size} at={c} />) : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  scene: { position: 'absolute', width: PATH_SCENE_BOX.w, height: PATH_SCENE_BOX.h },
  flipped: { transform: [{ scaleX: -1 }] },
});
