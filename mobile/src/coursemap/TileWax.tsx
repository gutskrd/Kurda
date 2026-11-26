import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  PATH_REPRESS_SHADOW,
  PATH_STAMP_MOMENT,
  PATH_STAMP_REPRESS,
  PATH_STAMP_SHADOW,
  PATH_STAMP_TOOL,
  PATH_STOP_ART,
  PATH_WAX_DROP,
  PATH_WAX_GOLD,
  pathStampToolSvg,
  pathWaxSvg,
  sampleKeys,
  waxGlintAt,
  type UnitTone,
} from '@kurda/shared';
import { radii } from '../theme/tokens';
import { STOP_FACE } from './PathWorld';

/**
 * A finished stop's tile sealed in wax (shared `pathWaxSvg`) with a star pressed in it for each full round, as on the
 * website: a deeper tone of its unit's colour, gold once it has all three stars, and dulled where a refresh would help.
 * With `moment` running from 0 to 1 (SkillNodeView times it), the first sealing plays (shared `PATH_STAMP_MOMENT`): a big
 * drop of wax falls onto the tile and splashes, the wax flows out over it, and the brass stamp presses the whole tile and
 * lifts away, its stars pressed in. With `again`, a round later, the stamp presses again (shared `PATH_STAMP_REPRESS`),
 * the `from` stars giving way to `stars`. `warmAt` turns the wax gold, that long from now and once the stamp has lifted,
 * with one glint (shared `PATH_WAX_GOLD`); a gold tile glints again now and then while `live`. Decorative.
 */
export function TileWax({
  stopKey,
  tone,
  dark,
  stars,
  gold,
  warmAt,
  worn,
  live,
  moment,
  again = null,
}: {
  stopKey: string;
  tone: UnitTone;
  dark: boolean;
  /** The stars pressed in it, one for each full round. */
  stars: number;
  gold: boolean;
  /** Its third star is being pressed in: the stamp lifts and the wax warms into gold this many ms from now. */
  warmAt: number | null;
  worn: boolean;
  /** Its unit is in view, the app in front, and motion welcome. */
  live: boolean;
  moment: Animated.Value | null;
  /** A round later: the stamp pressing again, and the stars it had before. */
  again?: { t: Animated.Value; from: number } | null;
}): React.JSX.Element {
  const pressing = !!moment;
  const pressed = !!again;
  const moving = pressing || pressed;
  const xml = useMemo(() => {
    const wax = (part: 'whole' | 'pour' | 'seal', count: number, golden = false): string =>
      pathWaxSvg({ tone, seed: stopKey, gold: golden, worn, stars: count, part, dark });
    return {
      coat: moving ? null : wax('whole', stars),
      gold: gold ? wax('whole', stars, true) : null,
      pour: moving ? wax('pour', stars) : null,
      seal: moving ? wax('seal', stars) : null,
      was: again ? wax('seal', again.from) : null,
      blob: pressing ? pathWaxSvg({ tone, part: 'blob', dark }) : null,
      splash: pressing ? pathWaxSvg({ tone, part: 'splash', dark }) : null,
      tool: moving ? pathStampToolSvg({ dark, stars }) : null,
    };
  }, [tone, stopKey, worn, dark, gold, stars, moving, pressing, again]);
  // The wax warming into gold, once the stamp has lifted from its third star.
  const warm = useRef(new Animated.Value(warmAt === null ? 1 : 0)).current;
  useEffect(() => {
    if (warmAt === null) {
      warm.setValue(1);
      return;
    }
    warm.setValue(0);
    const { warmMs, afterMs } = PATH_WAX_GOLD;
    const run = Animated.timing(warm, { toValue: 1, duration: warmMs, delay: warmAt + afterMs, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [warmAt, warm]);
  const { box } = PATH_STOP_ART;
  const layer = (svg: string): React.JSX.Element => <SvgXml xml={svg} width={box} height={box} />;
  const t = moment ?? again?.t ?? null;
  const m = pressing ? PATH_STAMP_MOMENT : PATH_STAMP_REPRESS;
  const shadow = pressing ? PATH_STAMP_SHADOW : PATH_REPRESS_SHADOW;
  // The stars pressed in show from the press, under the stamp; a round later the ones before give way then.
  const shownFrom = [[0, 0], [m.pressAt, 0], [m.pressAt + 0.01, 1], [1, 1]] as const;
  const { blobY, blobShown, splat, splash, splashShown, flow, poured } = PATH_STAMP_MOMENT;
  return (
    <View style={styles.wax} pointerEvents="none" aria-hidden testID={moving ? 'lp-wax-pressing' : `lp-wax-${stars}${gold ? '-gold' : ''}`}>
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
          {/* The stamp's shadow on the tile's face, under the stamp. */}
          <View style={styles.face}>
            <Animated.View style={[styles.shadow, { opacity: stampTrack(t, shadow.shown), transform: [{ scale: stampTrack(t, shadow.size) }] }]} />
          </View>
          <Animated.View style={[styles.tool, { opacity: stampTrack(t, m.toolShown), transform: [{ translateY: stampTrack(t, m.toolY) }] }]}>
            <SvgXml xml={xml.tool} width={PATH_STAMP_TOOL.w} height={PATH_STAMP_TOOL.h} />
          </Animated.View>
        </>
      ) : xml.coat ? (
        layer(xml.coat)
      ) : null}
      {xml.gold ? <Animated.View style={[StyleSheet.absoluteFill, { opacity: warm }]}>{layer(xml.gold)}</Animated.View> : null}
      {xml.gold && !worn && live ? <WaxGlint stopKey={stopKey} warmAt={warmAt} /> : null}
    </View>
  );
}

/**
 * A pale band crossing a gold tile now and then (shared `PATH_WAX_GOLD`), each stop at its own time; just after it has
 * warmed into gold, the first one follows at once. Clipped to the tile's face.
 */
function WaxGlint({ stopKey, warmAt }: { stopKey: string; warmAt: number | null }): React.JSX.Element {
  const across = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const { everyMs, glintMs, afterMs, warmMs } = PATH_WAX_GOLD;
    across.setValue(0);
    // Its first glint just after it warms, or at its own time in the round; then one every `everyMs`.
    const first = warmAt === null ? (everyMs - waxGlintAt(stopKey)) % everyMs : warmAt + afterMs + warmMs;
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

/** Where the pour spreads from (the face's middle) and the drop lands and splashes (shared PATH_WAX_DROP), on the tile's canvas. */
const POUR_ORIGIN = `${(PATH_STOP_ART.cx / PATH_STOP_ART.box) * 100}% ${(PATH_STOP_ART.cy / PATH_STOP_ART.box) * 100}%`;
const BLOB_ORIGIN = `${(PATH_STOP_ART.cx / PATH_STOP_ART.box) * 100}% ${((PATH_STOP_ART.cy + PATH_WAX_DROP.foot) / PATH_STOP_ART.box) * 100}%`;
/** How far a glint's band travels either side of the tile's middle, past its wax. */
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
  },
  // The tile's face, a rounded square 72 by 60 on its canvas, which a glint crosses and the stamp's shadow falls on.
  face: {
    position: 'absolute',
    left: PATH_STOP_ART.cx - PATH_STOP_ART.rx,
    top: PATH_STOP_ART.cy - PATH_STOP_ART.ry,
    width: 2 * PATH_STOP_ART.rx,
    height: 2 * PATH_STOP_ART.ry,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  // Under the stamp's pad, a little below the face's middle.
  shadow: { position: 'absolute', left: 4, top: 34, width: 64, height: 12, borderRadius: radii.pill, backgroundColor: '#05080a', opacity: 0 },
  band: {
    position: 'absolute',
    top: -14,
    bottom: -14,
    left: PATH_STOP_ART.rx - PATH_WAX_GOLD.band / 2,
    width: PATH_WAX_GOLD.band,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
});
