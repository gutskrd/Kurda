import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { TREE_FOOT, hasTreeArt, treeSvg, waterDropSvg, wateringCanSvg, type TreeHealth, type TreeSeason, type TreeStage } from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useTreeSeason } from './season';

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** How long the plant takes to lean one way and back, and how far, in degrees. */
const SWAY_MS = 6400;
const SWAY_DEG = 0.9;

let drawings = 0;
/** An id prefix of this drawing's own, so two trees on a screen (or one left behind in the stack, in the browser build) never share a clip. */
function useArtId(): string {
  const id = useRef<string | null>(null);
  if (id.current === null) {
    drawings += 1;
    id.current = `hvt${drawings.toString(36)}`;
  }
  return id.current;
}

/**
 * A tree, drawn (shared `art/trees.ts`), the same picture the website shows.
 *
 * `alive`, it is drawn in its two layers: the ground, which stands still,
 * and the plant over it, which sways a little about its foot while the
 * screen is the one in front, and which `plant` can move besides (the start
 * it gives as it is watered). Otherwise it is one still picture, which is
 * what a profile and a list want. A kind this build has no drawing for is
 * not drawn at all.
 *
 * It is drawn in a season, standing on its round of grass with its long
 * shadow: the one given, or the learner's own today.
 *
 * `label` names it for a screen reader; leave it empty where the words
 * beside it already say what it is.
 */
export function TreeArt({
  species,
  stage,
  health = 'fresh',
  season,
  size,
  label = '',
  alive = false,
  plant,
  style,
}: {
  species: string;
  stage: TreeStage;
  health?: TreeHealth;
  season?: TreeSeason;
  size: number;
  label?: string;
  alive?: boolean;
  /** more movement for the plant alone, laid over its sway */
  plant?: Animated.WithAnimatedValue<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element | null {
  const id = useArtId();
  const moving = useMotionAlive();
  const today = useTreeSeason();
  const drawnIn = season ?? today;
  const sway = useRef(new Animated.Value(0)).current;
  // a withered tree does not sway, nor a seed: there is nothing on them for the air to move
  const sways = alive && moving && health !== 'withered' && stage > 0;
  useEffect(() => {
    if (!sways) {
      sway.setValue(0);
      return;
    }
    const half = { duration: SWAY_MS / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
    const loop = Animated.loop(Animated.sequence([Animated.timing(sway, { toValue: 1, ...half }), Animated.timing(sway, { toValue: -1, ...half })]));
    loop.start();
    return () => loop.stop();
  }, [sways, sway]);
  const xml = useMemo(() => {
    if (!hasTreeArt(species)) return null;
    const base = { species, stage, health, size, season: drawnIn };
    if (!alive) return { whole: treeSvg({ ...base, idPrefix: id }), ground: null, plant: null };
    return { whole: null, ground: treeSvg({ ...base, part: 'ground', idPrefix: `${id}g` }), plant: treeSvg({ ...base, part: 'plant', idPrefix: `${id}p` }) };
  }, [species, stage, health, size, alive, id, drawnIn]);
  if (!xml) return null;
  const named = label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : HIDDEN;
  const foot = `${TREE_FOOT.x * 100}% ${TREE_FOOT.y * 100}%`;
  return (
    <View {...named} style={[{ width: size, height: size }, style]} testID="tree-art">
      <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill}>
        {xml.whole !== null ? (
          <SvgXml xml={xml.whole} width={size} height={size} />
        ) : (
          <>
            <SvgXml xml={xml.ground} width={size} height={size} />
            <Animated.View
              style={[StyleSheet.absoluteFill, { transformOrigin: foot, transform: [{ rotate: sway.interpolate({ inputRange: [-1, 1], outputRange: [`-${SWAY_DEG}deg`, `${SWAY_DEG}deg`] }) }] }]}
              testID="tree-art-plant"
            >
              <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: foot }, plant]}>
                <SvgXml xml={xml.plant} width={size} height={size} />
              </Animated.View>
            </Animated.View>
          </>
        )}
      </View>
    </View>
  );
}

/** A drop of water, drawn: beside a count of water, and falling from the can. */
export function WaterDrop({ size }: { size: number }): React.JSX.Element {
  const id = useArtId();
  const xml = useMemo(() => waterDropSvg({ size, idPrefix: id }), [size, id]);
  return (
    <View {...HIDDEN} pointerEvents="none" style={{ width: size, height: size }}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

/** The watering can, drawn. */
export function WateringCan({ size }: { size: number }): React.JSX.Element {
  const id = useArtId();
  const xml = useMemo(() => wateringCanSvg({ size, idPrefix: id }), [size, id]);
  return (
    <View {...HIDDEN} pointerEvents="none" style={{ width: size, height: size }}>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}
