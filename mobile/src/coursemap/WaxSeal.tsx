import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  PATH_REPRESS_SHADOW,
  PATH_STAMP_MOMENT,
  PATH_STAMP_REPRESS,
  PATH_STAMP_SHADOW,
  PATH_STAMP_TOOL,
  PATH_SEAL,
  PATH_STOP_ART,
  PATH_WAX_FIRE,
  flickerAt,
  pathSealFireSvg,
  PATH_WAX_GOLD,
  pathWaxSvg,
  sampleKeys,
  waxGlintAt,
} from '@kurda/shared';
import { haptic } from '../feedback/haptics';
import { Icon } from '../theme/Icon';
import { radii } from '../theme/tokens';
import { STOP_FACE } from './PathWorld';

/**
 * A finished stop's round wax seal (shared `pathWaxSvg`) in its tile's place, a sun pressed in it for each full round, as
 * on the website: deep red, gold once it has all three suns, and matte and dulled where a refresh would help. With
 * `moment` running from 0 to 1 (SkillNodeView times it and melts the tile), the first sealing plays (shared
 * `PATH_STAMP_MOMENT`): a big drop of red wax falls onto the tile and splashes, the wax flows out round as the tile melts
 * under it, and the brass stamp presses the seal and lifts away, its sun pressed in. With `again`, a round later, the
 * stamp presses again (shared `PATH_STAMP_REPRESS`), the `from` suns giving way to `suns`. With `warmAt`, that long from
 * now and once the stamp has lifted, a band of fire sweeps up over the seal and gilds it (shared `PATH_WAX_FIRE`), then
 * one glint crosses it (shared `PATH_WAX_GOLD`); a gold seal glints again now and then while `live`. Decorative.
 */
export function WaxSeal({
  stopKey,
  dark,
  suns,
  gold,
  warmAt,
  worn,
  live,
  moment,
  again = null,
}: {
  stopKey: string;
  dark: boolean;
  /** The suns pressed in it, one for each full round. */
  suns: number;
  gold: boolean;
  /** Its third sun is being pressed in: the stamp lifts and fire gilds the wax this many ms from now. */
  warmAt: number | null;
  worn: boolean;
  /** Its unit is in view, the app in front, and motion welcome. */
  live: boolean;
  moment: Animated.Value | null;
  /** A round later: the stamp pressing again, and the suns it had before. */
  again?: { t: Animated.Value; from: number } | null;
}): React.JSX.Element {
  const pressing = !!moment;
  const pressed = !!again;
  const moving = pressing || pressed;
  const xml = useMemo(() => {
    const wax = (part: 'whole' | 'pour' | 'seal', count: number, golden = false): string =>
      pathWaxSvg({ seed: stopKey, gold: golden, worn, suns: count, part, dark });
    return {
      coat: moving ? null : wax('whole', suns),
      gold: gold ? wax('whole', suns, true) : null,
      pour: moving ? wax('pour', suns) : null,
      seal: moving ? wax('seal', suns) : null,
      was: again ? wax('seal', again.from) : null,
      blob: pressing ? pathWaxSvg({ part: 'blob', dark }) : null,
      splash: pressing ? pathWaxSvg({ part: 'splash', dark }) : null,
    };
  }, [stopKey, worn, dark, gold, suns, moving, pressing, again]);
  // Once the stamp has lifted from its third sun, the suns ignite and fire gilds the seal (`SealIgnite`), felt as a light
  // tap as they kindle, a tick as the corona is halfway round and a firm tap at the flare.
  const warm = useRef(new Animated.Value(warmAt === null ? 1 : 0)).current;
  useEffect(() => {
    if (warmAt === null) {
      warm.setValue(1);
      return;
    }
    warm.setValue(0);
    const at = warmAt + PATH_WAX_GOLD.afterMs;
    const run = Animated.timing(warm, { toValue: 1, duration: PATH_WAX_FIRE.ms, delay: at, easing: Easing.linear, useNativeDriver: true });
    run.start();
    const { ms, haptics } = PATH_WAX_FIRE;
    const knocks = [
      setTimeout(() => haptic('tap'), at + ms * haptics.kindle),
      setTimeout(() => haptic('select'), at + ms * haptics.halfway),
      setTimeout(() => haptic('celebrate'), at + ms * haptics.flare),
    ];
    return () => {
      run.stop();
      knocks.forEach(clearTimeout);
    };
  }, [warmAt, warm]);
  const { box } = PATH_STOP_ART;
  const layer = (svg: string): React.JSX.Element => <SvgXml xml={svg} width={box} height={box} />;
  const t = moment ?? again?.t ?? null;
  const m = pressing ? PATH_STAMP_MOMENT : PATH_STAMP_REPRESS;
  const shadow = pressing ? PATH_STAMP_SHADOW : PATH_REPRESS_SHADOW;
  // The suns pressed in show from the press, under the stamp; a round later the ones before give way then.
  const shownFrom = [[0, 0], [m.pressAt, 0], [m.pressAt + 0.01, 1], [1, 1]] as const;
  const { blobY, blobShown, splat, splash, splashShown, flow, poured } = PATH_STAMP_MOMENT;
  const { shudder, proud } = PATH_WAX_FIRE;
  return (
    <Animated.View
      style={[styles.wax, warmAt !== null ? { transformOrigin: POUR_ORIGIN, transform: [{ translateX: stampTrack(warm, shudder) }, { scale: stampTrack(warm, proud) }] } : null]}
      pointerEvents="none"
      aria-hidden
      testID={moving ? 'lp-wax-pressing' : `lp-wax-${suns}${gold ? '-gold' : ''}`}
    >
      {xml.gold && warmAt !== null ? <SealGlow dark={dark} warm={warm} /> : null}
      {t && xml.pour && xml.seal ? (
        <>
          {pressing ? (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { transformOrigin: POUR_ORIGIN, opacity: stampTrack(t, poured), transform: [{ scale: stampTrack(t, flow) }] },
              ]}
            >
              {layer(xml.pour)}
            </Animated.View>
          ) : (
            layer(xml.pour)
          )}
          {xml.was ? (
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: stampTrack(t, shownFrom.map(([at, v]) => [at, 1 - v] as const)) }]}>
              {layer(xml.was)}
            </Animated.View>
          ) : null}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: stampTrack(t, shownFrom) }]}>{layer(xml.seal)}</Animated.View>
          {pressing && xml.blob && xml.splash ? (
            <>
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    transformOrigin: BLOB_ORIGIN,
                    opacity: stampTrack(t, blobShown),
                    transform: [
                      { translateY: stampTrack(t, blobY) },
                      { scaleX: stampTrack(t, splat.map(([at, v]) => [at, 2 - v] as const)) },
                      { scaleY: stampTrack(t, splat) },
                    ],
                  },
                ]}
              >
                {layer(xml.blob)}
              </Animated.View>
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { transformOrigin: BLOB_ORIGIN, opacity: stampTrack(t, splashShown), transform: [{ scale: stampTrack(t, splash) }] },
                ]}
              >
                {layer(xml.splash)}
              </Animated.View>
            </>
          ) : null}
          {/* The stamp's shadow on the seal's face, under the stamp. */}
          <View style={styles.face}>
            <Animated.View style={[styles.shadow, { opacity: stampTrack(t, shadow.shown), transform: [{ scale: stampTrack(t, shadow.size) }] }]} />
          </View>
          {/* The icon set's own Stamp, in the page's ink, leans about its pad's foot. */}
          <Animated.View
            style={[
              styles.tool,
              { opacity: stampTrack(t, m.toolShown), transform: [{ translateY: stampTrack(t, m.toolY) }, { rotate: stampTrack(t, m.tilt).interpolate(DEGREES) }] },
            ]}
          >
            <Icon name="stamp" size={PATH_STAMP_TOOL.icon.size} style={styles.glyph} />
          </Animated.View>
        </>
      ) : xml.coat ? (
        layer(xml.coat)
      ) : null}
      {xml.gold && warmAt !== null ? (
        <SealIgnite stopKey={stopKey} suns={suns} dark={dark} gold={xml.gold} warm={warm} />
      ) : xml.gold ? (
        // Over the red, the whole seal's size: laid beside it, the two would share its height.
        <View style={StyleSheet.absoluteFill}>{layer(xml.gold)}</View>
      ) : null}
      {xml.gold && !worn && live ? <WaxGlint stopKey={stopKey} warmAt={warmAt} /> : null}
    </Animated.View>
  );
}

/** One of the seal's drawings, on its tile's canvas. */
function drawn(svg: string): React.JSX.Element {
  return <SvgXml xml={svg} width={PATH_STOP_ART.box} height={PATH_STOP_ART.box} />;
}

/** The ignite's warm light behind a seal (shared `PATH_WAX_FIRE`): its light on the road round it, and the flash at the flare. */
function SealGlow({ dark, warm }: { dark: boolean; warm: Animated.Value }): React.JSX.Element {
  const flash = useMemo(() => pathSealFireSvg({ part: 'flash', dark }), [dark]);
  const { glow, flash: bloom, flashSize } = PATH_WAX_FIRE;
  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: POUR_ORIGIN, opacity: stampTrack(warm, glow), transform: [{ scale: GLOW_SCALE }] }]}>
        {drawn(flash)}
      </Animated.View>
      <Animated.View
        style={[StyleSheet.absoluteFill, { transformOrigin: POUR_ORIGIN, opacity: stampTrack(warm, bloom), transform: [{ scale: stampTrack(warm, flashSize) }] }]}
      >
        {drawn(flash)}
      </Animated.View>
    </>
  );
}

/**
 * A seal's suns igniting as its third is pressed in (shared `PATH_WAX_FIRE`), over the red seal, as on the website: the
 * gold shown through two half discs turning about its middle behind the corona's leading flame, the suns glowing orange
 * then white-gold, the corona's tongues rising round the rim and flickering, and the sparks of the flare. Decorative.
 */
function SealIgnite({ stopKey, suns, dark, gold, warm }: { stopKey: string; suns: number; dark: boolean; gold: string; warm: Animated.Value }): React.JSX.Element {
  const { kindle, blaze, sweepRight, sweepLeft, gilded, lean, tongues, flicker, sparks } = PATH_WAX_FIRE;
  const xml = useMemo(
    () => ({
      kindle: pathWaxSvg({ seed: stopKey, suns, part: 'kindle', dark }),
      blaze: pathWaxSvg({ seed: stopKey, suns, part: 'blaze', dark }),
      outer: pathSealFireSvg({ part: 'outer', dark }),
      inner: pathSealFireSvg({ part: 'inner', dark }),
      spark: pathSealFireSvg({ part: 'spark', dark }),
    }),
    [stopKey, suns, dark],
  );
  // The corona's flicker: one clock for the tongues' bodies and one for their hearts, each tongue out of step.
  const outer = useRef(new Animated.Value(0)).current;
  const inner = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loops = ([[outer, flicker.outer], [inner, flicker.inner]] as const).map(([clock, motion]) =>
      Animated.loop(Animated.timing(clock, { toValue: 1, duration: motion.periodMs, easing: Easing.linear, useNativeDriver: true })),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [outer, inner, flicker]);
  const flickers = (clock: Animated.Value, motion: typeof flicker.outer, offset: number) => {
    const inputRange = Array.from({ length: 17 }, (_, i) => i / 16);
    const poses = inputRange.map((x) => flickerAt(motion, x + motion.phase + offset));
    return [
      { scaleX: clock.interpolate({ inputRange, outputRange: poses.map((p) => p.sx) }) },
      { scaleY: clock.interpolate({ inputRange, outputRange: poses.map((p) => p.sy) }) },
      { skewX: clock.interpolate({ inputRange, outputRange: poses.map((p) => `${p.skew}deg`) }) },
    ];
  };
  const turn = (keys: readonly (readonly [number, number])[], sign: number) => stampTrack(warm, keys.map(([at, v]) => [at, sign * v] as const)).interpolate(DEGREES);
  return (
    <>
      {/* The gold, shown behind the leading flame through a half disc turning in each half of the seal. */}
      <View testID="lp-wax-half" style={[styles.half, { left: PATH_SEAL.cx }]}>
        <Animated.View style={[styles.half, { left: -PATH_SEAL.cx, transformOrigin: `100% ${CY}%`, transform: [{ rotate: turn(sweepRight, 1) }] }]}>
          <Animated.View style={[styles.turned, { left: 0, transformOrigin: POUR_ORIGIN, transform: [{ rotate: turn(sweepRight, -1) }] }]}>
            {drawn(gold)}
          </Animated.View>
        </Animated.View>
      </View>
      <View testID="lp-wax-half" style={[styles.half, { left: 0 }]}>
        <Animated.View style={[styles.half, { left: PATH_SEAL.cx, transformOrigin: `0% ${CY}%`, transform: [{ rotate: turn(sweepLeft, 1) }] }]}>
          <Animated.View style={[styles.turned, { left: -PATH_SEAL.cx, transformOrigin: POUR_ORIGIN, transform: [{ rotate: turn(sweepLeft, -1) }] }]}>
            {drawn(gold)}
          </Animated.View>
        </Animated.View>
      </View>
      {/* Once the ring has closed, the gold whole, over the seam between its halves. */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: stampTrack(warm, gilded) }]}>{drawn(gold)}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: stampTrack(warm, kindle) }]}>{drawn(xml.kindle)}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: stampTrack(warm, blaze) }]}>{drawn(xml.blaze)}</Animated.View>
      {tongues.map((t, i) => (
        <View
          key={t.angle}
          testID={i === 0 ? 'lp-wax-fire' : undefined}
          style={[StyleSheet.absoluteFill, { transformOrigin: POUR_ORIGIN, transform: [{ rotate: `${t.angle}deg` }, { scaleX: t.flip ? -1 : 1 }] }]}
        >
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              // Leaning back from the way the ring runs, whichever way the tongue is turned.
              {
                transformOrigin: ROOT_ORIGIN,
                transform: [{ scale: stampTrack(warm, t.grow.map(([at, v]) => [at, v * t.size] as const)) }, { skewX: `${t.flip ? -lean : lean}deg` }],
              },
            ]}
          >
            <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: ROOT_ORIGIN, transform: flickers(outer, flicker.outer, i * 0.37) }]}>
              {drawn(xml.outer)}
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: ROOT_ORIGIN, transform: flickers(inner, flicker.inner, i * 0.37) }]}>
              {drawn(xml.inner)}
            </Animated.View>
          </Animated.View>
        </View>
      ))}
      {sparks.map((k, i) => (
        <Animated.View
          key={i}
          style={[
            StyleSheet.absoluteFill,
            {
              transformOrigin: SPARK_ORIGIN,
              opacity: stampTrack(warm, k.shown),
              transform: [{ translateX: stampTrack(warm, k.x) }, { translateY: stampTrack(warm, k.y) }, { scale: k.size }],
            },
          ]}
        >
          {drawn(xml.spark)}
        </Animated.View>
      ))}
    </>
  );
}

/**
 * A pale band crossing a gold seal now and then (shared `PATH_WAX_GOLD`), each stop at its own time; just after fire has
 * gilded it, the first one follows at once. Clipped to the seal's face.
 */
function WaxGlint({ stopKey, warmAt }: { stopKey: string; warmAt: number | null }): React.JSX.Element {
  const across = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const { everyMs, glintMs, afterMs } = PATH_WAX_GOLD;
    across.setValue(0);
    // Its first glint just after the fire has gilded it, or at its own time in the round; then one every `everyMs`.
    const first = warmAt === null ? (everyMs - waxGlintAt(stopKey)) % everyMs : warmAt + afterMs + PATH_WAX_FIRE.ms;
    const sweep = Animated.sequence([
      Animated.timing(across, { toValue: 1, duration: glintMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(across, { toValue: 0, duration: 0, useNativeDriver: true }),
      Animated.delay(everyMs - glintMs),
    ]);
    const run = Animated.sequence([Animated.delay(first), Animated.loop(sweep)]);
    run.start();
    return () => run.stop();
  }, [stopKey, warmAt, across]);
  return (
    <View style={styles.face}>
      <Animated.View
        style={[
          styles.band,
          {
            transform: [
              { translateX: across.interpolate({ inputRange: [0, 1], outputRange: [-GLINT_REACH, GLINT_REACH] }) },
              { rotate: `${PATH_WAX_GOLD.tilt}deg` },
            ],
          },
        ]}
      />
    </View>
  );
}

/** A track of the sealing moment as an interpolation, sampled finely so its eased keys move as on the website. */
export function stampTrack(t: Animated.Value, keys: readonly (readonly [number, number])[]): Animated.AnimatedInterpolation<number> {
  const inputRange = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
  return t.interpolate({ inputRange, outputRange: inputRange.map((x) => sampleKeys(keys, x)) });
}
const SAMPLES = 40;

/** Where the drop lands and splashes and the poured disc spreads from: the seal's middle (shared PATH_SEAL), on the tile's canvas. */
const POUR_ORIGIN = `${(PATH_SEAL.cx / PATH_STOP_ART.box) * 100}% ${(PATH_SEAL.cy / PATH_STOP_ART.box) * 100}%`;
const BLOB_ORIGIN = POUR_ORIGIN;
/** The seal's middle down its canvas, as a share; where the corona's tongues stand on the rim, and the sparks leave it. */
const CY = (PATH_SEAL.cy / PATH_STOP_ART.box) * 100;
const ROOT_ORIGIN = `50% ${((PATH_SEAL.cy - PATH_SEAL.r + 3) / PATH_STOP_ART.box) * 100}%`;
const SPARK_ORIGIN = `50% ${((PATH_SEAL.cy - PATH_SEAL.r) / PATH_STOP_ART.box) * 100}%`;
/** How much wider than the flash its light on the road round the stop is laid. */
const GLOW_SCALE = 1.9;
/** A lean in degrees, as a rotation. */
const DEGREES = { inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] };
/** How far a glint's band travels either side of the seal's middle, past its wax. */
const GLINT_REACH = 52;

const styles = StyleSheet.create({
  // The tile's own canvas, laid as its drawing is.
  wax: { position: 'absolute', left: STOP_FACE.x - PATH_STOP_ART.cx, top: STOP_FACE.y - PATH_STOP_ART.cy, width: PATH_STOP_ART.box, height: PATH_STOP_ART.box },
  // Over the stop's 72-point button from its corner (shared PATH_STAMP_TOOL), on the tile's canvas.
  tool: {
    position: 'absolute',
    left: PATH_STAMP_TOOL.x - (STOP_FACE.x - PATH_STOP_ART.cx),
    top: PATH_STAMP_TOOL.y - (STOP_FACE.y - PATH_STOP_ART.cy),
    width: PATH_STAMP_TOOL.w,
    height: PATH_STAMP_TOOL.h,
    transformOrigin: '50% 92%',
  },
  // The Stamp glyph's whole 256 square on the stamp's canvas.
  glyph: { position: 'absolute', left: PATH_STAMP_TOOL.icon.x, top: PATH_STAMP_TOOL.icon.y },
  // A half of the seal's canvas, cut to it: the clip each half of the gilding turns in, and the half disc that turns.
  half: { position: 'absolute', top: 0, width: PATH_SEAL.cx, height: PATH_STOP_ART.box, overflow: 'hidden' },
  // The gold inside a turning half disc, its whole canvas.
  turned: { position: 'absolute', top: 0, width: PATH_STOP_ART.box, height: PATH_STOP_ART.box },
  // The seal's face, a circle on the tile's canvas, which a glint crosses and the stamp's shadow falls on.
  face: {
    position: 'absolute',
    left: PATH_SEAL.cx - PATH_SEAL.r,
    top: PATH_SEAL.cy - PATH_SEAL.r,
    width: 2 * PATH_SEAL.r,
    height: 2 * PATH_SEAL.r,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  // Under the stamp's pad, a little below the seal's middle.
  shadow: { position: 'absolute', left: 4, top: 37, width: 64, height: 12, borderRadius: radii.pill, backgroundColor: '#05080a', opacity: 0 },
  band: {
    position: 'absolute',
    top: -14,
    bottom: -14,
    left: PATH_SEAL.r - PATH_WAX_GOLD.band / 2,
    width: PATH_WAX_GOLD.band,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
});
