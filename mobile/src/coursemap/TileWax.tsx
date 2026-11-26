import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  PATH_STAMP_MOMENT,
  PATH_STAMP_TOOL,
  PATH_STOP_ART,
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
 * A finished stop's tile sealed in wax (shared `pathWaxSvg`), as on the website: a deeper tone of its unit's colour, gold
 * once the topic has all three stars, and dulled where a refresh would help. With `moment` running from 0 to 1
 * (SkillNodeView times it), the sealing plays (shared `PATH_STAMP_MOMENT`): a big drop of wax falls onto the tile and
 * splashes, the wax flows out over it, the brass stamp presses the whole tile, and lifts away to show the diamond
 * pressed in it. `warmAt` turns the wax gold that long after it is drawn, once its third star has lit, with one glint
 * (shared `PATH_WAX_GOLD`); a gold tile glints again now and then while `live`. Decorative.
 */
export function TileWax({
  stopKey,
  tone,
  dark,
  gold,
  warmAt,
  worn,
  live,
  moment,
}: {
  stopKey: string;
  tone: UnitTone;
  dark: boolean;
  gold: boolean;
  /** Its third star is lighting: the wax warms into gold this many ms from now. */
  warmAt: number | null;
  worn: boolean;
  /** Its unit is in view, the app in front, and motion welcome. */
  live: boolean;
  moment: Animated.Value | null;
}): React.JSX.Element {
  const pressing = !!moment;
  const xml = useMemo(() => {
    const wax = (part: 'whole' | 'pour' | 'seal', golden = false): string => pathWaxSvg({ tone, seed: stopKey, gold: golden, worn, part, dark });
    return {
      coat: pressing ? null : wax('whole'),
      gold: gold && !pressing ? wax('whole', true) : null,
      pour: pressing ? wax('pour') : null,
      seal: pressing ? wax('seal') : null,
      blob: pressing ? pathWaxSvg({ tone, part: 'blob', dark }) : null,
      tool: pressing ? pathStampToolSvg({ dark }) : null,
    };
  }, [tone, stopKey, worn, dark, gold, pressing]);
  // The wax warming into gold, after its third star has lit.
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
  const { blobY, blobShown, splat, flow, poured, toolY, toolShown, sealShown } = PATH_STAMP_MOMENT;
  return (
    <View style={styles.wax} pointerEvents="none" aria-hidden testID={moment ? 'lp-wax-pressing' : gold ? 'lp-wax-gold' : 'lp-wax'}>
      {moment && xml.pour && xml.seal && xml.blob && xml.tool ? (
        <>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { transformOrigin: POUR_ORIGIN, opacity: stampTrack(moment, poured), transform: [{ scale: stampTrack(moment, flow) }] },
            ]}
          >
            {layer(xml.pour)}
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: stampTrack(moment, sealShown) }]}>{layer(xml.seal)}</Animated.View>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                transformOrigin: BLOB_ORIGIN,
                opacity: stampTrack(moment, blobShown),
                transform: [
                  { translateY: stampTrack(moment, blobY) },
                  { scaleX: stampTrack(moment, splat.map(([at, v]) => [at, 2 - v] as const)) },
                  { scaleY: stampTrack(moment, splat) },
                ],
              },
            ]}
          >
            {layer(xml.blob)}
          </Animated.View>
          <Animated.View style={[styles.tool, { opacity: stampTrack(moment, toolShown), transform: [{ translateY: stampTrack(moment, toolY) }] }]}>
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
    <View style={styles.glint}>
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

/** Where the pour spreads from (the face's middle) and the drop lands (a little below it), on the tile's canvas. */
const POUR_ORIGIN = `${(PATH_STOP_ART.cx / PATH_STOP_ART.box) * 100}% ${(PATH_STOP_ART.cy / PATH_STOP_ART.box) * 100}%`;
const BLOB_ORIGIN = `${(PATH_STOP_ART.cx / PATH_STOP_ART.box) * 100}% ${((PATH_STOP_ART.cy + 14) / PATH_STOP_ART.box) * 100}%`;
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
  // The tile's face, a rounded square 72 by 60 on its canvas, the glint's band clipped to it.
  glint: {
    position: 'absolute',
    left: PATH_STOP_ART.cx - PATH_STOP_ART.rx,
    top: PATH_STOP_ART.cy - PATH_STOP_ART.ry,
    width: 2 * PATH_STOP_ART.rx,
    height: 2 * PATH_STOP_ART.ry,
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    top: -14,
    bottom: -14,
    left: PATH_STOP_ART.rx - PATH_WAX_GOLD.band / 2,
    width: PATH_WAX_GOLD.band,
    backgroundColor: 'rgba(255, 255, 255, 0.42)',
  },
});
