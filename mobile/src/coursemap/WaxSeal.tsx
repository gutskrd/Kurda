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
  PATH_WAX_GOLD,
  pathStampToolSvg,
  pathWaxSvg,
  sampleKeys,
  waxGlintAt,
} from '@kurda/shared';
import { haptic } from '../feedback/haptics';
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
      tool: moving ? pathStampToolSvg({ dark }) : null,
      // The fire that gilds it as its third sun is pressed in: its band of flame, the embers off it and its puff.
      fire: warmAt !== null ? pathWaxSvg({ part: 'fire', dark }) : null,
      embers: warmAt !== null ? pathWaxSvg({ part: 'embers', dark }) : null,
      puff: warmAt !== null ? pathWaxSvg({ part: 'puff', dark }) : null,
    };
  }, [stopKey, worn, dark, gold, suns, moving, pressing, again, warmAt]);
  // Once the stamp has lifted from its third sun, fire sweeps up over the seal and the wax turns gold behind it, felt as a
  // light tap as it lights and a stronger one as it goes out.
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
    const knocks = [setTimeout(() => haptic('tap'), at), setTimeout(() => haptic('celebrate'), at + PATH_WAX_FIRE.ms * PATH_WAX_FIRE.outAt)];
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
  return (
    <View style={styles.wax} pointerEvents="none" aria-hidden testID={moving ? 'lp-wax-pressing' : `lp-wax-${suns}${gold ? '-gold' : ''}`}>
      {t && xml.pour && xml.seal && xml.tool ? (
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
          {/* The stamp, seen from the side, leans about its die's foot. */}
          <Animated.View
            style={[
              styles.tool,
              { opacity: stampTrack(t, m.toolShown), transform: [{ translateY: stampTrack(t, m.toolY) }, { rotate: stampTrack(t, m.tilt).interpolate(DEGREES) }] },
            ]}
          >
            <SvgXml xml={xml.tool} width={PATH_STAMP_TOOL.w} height={PATH_STAMP_TOOL.h} />
          </Animated.View>
        </>
      ) : xml.coat ? (
        layer(xml.coat)
      ) : null}
      {xml.gold && warmAt !== null && xml.fire && xml.embers && xml.puff ? (
        <>
          {/* The gold through a window whose top is the flames' front, moved up while the gold inside is moved back down. */}
          <Animated.View testID="lp-wax-window" style={[StyleSheet.absoluteFill, styles.window, { transform: [{ translateY: stampTrack(warm, fire.front) }] }]}>
            <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: stampTrack(warm, fire.back) }] }]}>{layer(xml.gold)}</Animated.View>
          </Animated.View>
          <Animated.View
            testID="lp-wax-fire"
            style={[
              StyleSheet.absoluteFill,
              {
                transformOrigin: POUR_ORIGIN,
                opacity: stampTrack(warm, fire.shown),
                transform: [{ translateY: stampTrack(warm, fire.rise) }, { scaleX: stampTrack(warm, fire.wide) }, { scaleY: stampTrack(warm, fire.lick) }],
              },
            ]}
          >
            {layer(xml.fire)}
          </Animated.View>
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: stampTrack(warm, fire.embersShown), transform: [{ translateY: stampTrack(warm, fire.embers) }] }]}
          >
            {layer(xml.embers)}
          </Animated.View>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transformOrigin: PUFF_ORIGIN, opacity: stampTrack(warm, fire.puffShown), transform: [{ scale: stampTrack(warm, fire.puff) }] },
            ]}
          >
            {layer(xml.puff)}
          </Animated.View>
        </>
      ) : xml.gold ? (
        layer(xml.gold)
      ) : null}
      {xml.gold && !worn && live ? <WaxGlint stopKey={stopKey} warmAt={warmAt} /> : null}
    </View>
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
/** Where the gilding fire's puff swells from: the seal's top. */
const PUFF_ORIGIN = `${(PATH_SEAL.cx / PATH_STOP_ART.box) * 100}% ${((PATH_SEAL.cy - PATH_SEAL.r) / PATH_STOP_ART.box) * 100}%`;
/** The gilding fire's tracks, and the gold's move back against its window's. */
const fire = { ...PATH_WAX_FIRE, back: PATH_WAX_FIRE.front.map(([at, y]) => [at, -y] as const) };
/** A lean in degrees, as a rotation. */
const DEGREES = { inputRange: [-90, 90], outputRange: ['-90deg', '90deg'] };
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
  // The window onto the gold as fire gilds it.
  window: { overflow: 'hidden' },
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
