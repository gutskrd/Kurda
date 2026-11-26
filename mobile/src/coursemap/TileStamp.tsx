import { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { PATH_STAMP_ART, PATH_STAMP_MOMENT, pathStampSvg, pathStampToolSvg, sampleKeys } from '@kurda/shared';
import { STOP_FACE } from './PathWorld';

/**
 * Hevalo's stamp on a finished stop's tile (shared `pathStampSvg`), as on the website: his prints in a seal, walking
 * toward the next stop (`heading`), four together where he rests, and rubbed a little where a refresh would help. With `moment` running from 0 to 1 (SkillNodeView times it), the
 * stamping plays (shared `PATH_STAMP_MOMENT`): the brass stamp hovers in, draws up, presses down as the print appears,
 * and lifts away. Decorative.
 */
export function TileStamp({
  stopKey,
  dark,
  worn,
  heading,
  rest,
  moment,
}: {
  stopKey: string;
  dark: boolean;
  worn: boolean;
  /** Where his prints point, in degrees clockwise from up, and whether he stands on all four (shared `stopPrints`). */
  heading: number;
  rest: boolean;
  moment: Animated.Value | null;
}): React.JSX.Element {
  const print = useMemo(() => pathStampSvg({ seed: stopKey, dark, worn, heading, prints: rest ? 4 : 2 }), [stopKey, dark, worn, heading, rest]);
  const tool = useMemo(() => (moment ? pathStampToolSvg({ dark, size: TOOL.w }) : null), [moment, dark]);
  const { printShown, printScale, toolY, toolShown } = PATH_STAMP_MOMENT;
  const box = PATH_STAMP_ART.box;
  return (
    <View style={styles.stamp} pointerEvents="none" aria-hidden testID={moment ? 'lp-stamp-pressing' : 'lp-stamp'}>
      <Animated.View
        style={[StyleSheet.absoluteFill, moment ? { transformOrigin: `${PATH_STAMP_ART.cx}px ${PATH_STAMP_ART.cy}px`, opacity: stampTrack(moment, printShown), transform: [{ scale: stampTrack(moment, printScale) }] } : null]}
      >
        <SvgXml xml={print} width={box} height={box} />
      </Animated.View>
      {moment && tool ? (
        <Animated.View style={[styles.tool, { opacity: stampTrack(moment, toolShown), transform: [{ translateY: stampTrack(moment, toolY) }] }]}>
          <SvgXml xml={tool} width={TOOL.w} height={TOOL.h} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** A track of the stamping moment as an interpolation, sampled finely so its eased keys move as on the website. */
export function stampTrack(t: Animated.Value, keys: readonly (readonly [number, number])[]): Animated.AnimatedInterpolation<number> {
  const inputRange = Array.from({ length: SAMPLES + 1 }, (_, i) => i / SAMPLES);
  return t.interpolate({ inputRange, outputRange: inputRange.map((x) => sampleKeys(keys, x)) });
}
const SAMPLES = 40;

/** The stamp's size over a tile, its face as wide as the seal (shared `pathStampToolSvg`: a 40 by 56 canvas). */
const TOOL = { w: 58, h: (58 * 56) / 40 } as const;

const styles = StyleSheet.create({
  // Centred on the tile's face, in the stop's 72-point button.
  stamp: { position: 'absolute', left: STOP_FACE.x - PATH_STAMP_ART.box / 2, top: STOP_FACE.y - PATH_STAMP_ART.box / 2, width: PATH_STAMP_ART.box, height: PATH_STAMP_ART.box },
  // Its face lands level with the seal's middle.
  tool: { position: 'absolute', left: PATH_STAMP_ART.cx - TOOL.w / 2, top: PATH_STAMP_ART.cy + 6 - (51 * TOOL.h) / 56, width: TOOL.w, height: TOOL.h },
});
