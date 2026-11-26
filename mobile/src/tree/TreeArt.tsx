import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import {
  TREE_FOOT,
  TREE_RUSTLE,
  TREE_RUSTLE_WAVE,
  TREE_SWAY,
  TREE_SWING,
  TREE_WAVE,
  TREE_WAVE_AT,
  hasTreeArt,
  treePhase,
  treeRig,
  treeSvg,
  treeSwayDeg,
  treeWave,
  waterDropSvg,
  wateringCanSvg,
  type TreeHealth,
  type TreeSeason,
  type TreeStage,
} from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useTreeSeason } from './season';

/** Hides a drawing's layers from screen readers. */
export const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** The swing's wave: the breeze's, a little later. */
const SWING_WAVE = treeWave(TREE_SWING.lag);

let drawings = 0;
/** An id prefix unique to this drawing, so two trees on screen (or one left in the web build's stack) never share a clip. */
function useArtId(): string {
  const id = useRef<string | null>(null);
  if (id.current === null) {
    drawings += 1;
    id.current = `hvt${drawings.toString(36)}`;
  }
  return id.current;
}

/**
 * The breeze as one native-thread clock from 0 to 1, started from the shared clock (`treePhase`), so a redrawn
 * tree keeps swaying where it was instead of jerking back.
 */
function useBreeze(on: boolean): Animated.Value {
  const clock = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on) return;
    const phase = treePhase(Date.now());
    clock.setValue(phase);
    const lap = (from: number): Animated.CompositeAnimation => Animated.timing(clock, { toValue: 1, duration: (1 - from) * TREE_SWAY.ms, easing: Easing.linear, useNativeDriver: true });
    let loop: Animated.CompositeAnimation | null = null;
    let stopped = false;
    const first = lap(phase);
    first.start(({ finished }) => {
      if (!finished || stopped) return;
      clock.setValue(0);
      loop = Animated.loop(lap(0));
      loop.start();
    });
    return () => {
      stopped = true;
      first.stop();
      loop?.stop();
    };
  }, [on, clock]);
  return clock;
}

/**
 * A tree, drawn from shared `art/trees.ts`, as on the web.
 *
 * When `alive` it is drawn in layers: the still ground; the plant, which sways about its foot in the shared
 * breeze (`TREE_SWAY`) while the screen is focused and which `plant` can also move (dropped in as a seed, grown,
 * watered, shaken); a grown tree's crown, stirring on the plant twice to each breeze (`TREE_RUSTLE`); a great
 * tree's swing, hanging from the plant and lagging a little with its seat level; and the still front over the
 * plant's foot. `soil` moves ground and front together (the fade between stages).
 * Otherwise it is one still picture, for profiles and lists. A kind this build cannot draw is not drawn.
 *
 * It stands in a season (the one given, or the learner's today) on its disc of grass with a long shadow. `label`
 * names it for screen readers; leave it empty when nearby text says what it is.
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
  soil,
  style,
}: {
  species: string;
  stage: TreeStage;
  health?: TreeHealth;
  season?: TreeSeason;
  size: number;
  label?: string;
  alive?: boolean;
  /** More movement for the plant alone, laid over its sway. */
  plant?: Animated.WithAnimatedValue<ViewStyle>;
  /** Movement for the ground and the front, which stand still otherwise. */
  soil?: Animated.WithAnimatedValue<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element | null {
  const id = useArtId();
  const moving = useMotionAlive();
  const today = useTreeSeason();
  const drawnIn = season ?? today;
  // A withered tree does not sway, nor a seed: there is nothing on them for the air to move.
  const deg = treeSwayDeg(stage);
  const sways = alive && moving && health !== 'withered' && deg > 0;
  const clock = useBreeze(sways);
  const xml = useMemo(() => {
    if (!hasTreeArt(species)) return null;
    const base = { species, stage, health, size, season: drawnIn };
    if (!alive) return { whole: treeSvg({ ...base, idPrefix: id }), ground: null, plant: null, crown: null, stir: null, swing: null, front: null, hang: null };
    const rig = treeRig({ species, stage, health });
    const part = (p: 'ground' | 'plant' | 'crown' | 'swing' | 'front', key: string): string => treeSvg({ ...base, part: p, idPrefix: `${id}${key}` });
    return {
      whole: null,
      ground: part('ground', 'g'),
      plant: part('plant', 'p'),
      crown: rig.crown ? part('crown', 'c') : null,
      stir: rig.crown,
      swing: rig.swing ? part('swing', 's') : null,
      front: rig.front ? part('front', 'f') : null,
      hang: rig.swing,
    };
  }, [species, stage, health, size, alive, id, drawnIn]);
  if (!xml) return null;
  const named = label ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label } : HIDDEN;
  const foot = `${TREE_FOOT.x * 100}% ${TREE_FOOT.y * 100}%`;
  const lean = sways ? [{ rotate: clock.interpolate({ inputRange: TREE_WAVE_AT as number[], outputRange: TREE_WAVE.map((w) => `${Math.round(w * deg * 1000) / 1000}deg`) }) }] : [];
  const swinging = sways ? [{ skewX: clock.interpolate({ inputRange: TREE_WAVE_AT as number[], outputRange: SWING_WAVE.map((w) => `${Math.round(w * TREE_SWING.deg * 1000) / 1000}deg`) }) }] : [];
  const stirring = sways ? [{ rotate: clock.interpolate({ inputRange: TREE_WAVE_AT as number[], outputRange: TREE_RUSTLE_WAVE.map((w) => `${Math.round(w * TREE_RUSTLE.deg * 1000) / 1000}deg`) }) }] : [];
  return (
    <View {...named} style={[{ width: size, height: size }, style]} testID="tree-art">
      <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill}>
        {xml.whole !== null ? (
          <SvgXml xml={xml.whole} width={size} height={size} />
        ) : (
          <>
            <Animated.View style={[StyleSheet.absoluteFill, soil]}>
              <SvgXml xml={xml.ground} width={size} height={size} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: foot }, plant]} testID="tree-art-plant">
              <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: foot, transform: lean }]}>
                <SvgXml xml={xml.plant} width={size} height={size} />
                {xml.crown !== null && xml.stir ? (
                  <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: `${xml.stir.x * 100}% ${xml.stir.y * 100}%`, transform: stirring }]} testID="tree-art-crown">
                    <SvgXml xml={xml.crown} width={size} height={size} />
                  </Animated.View>
                ) : null}
                {xml.swing !== null && xml.hang ? (
                  <Animated.View style={[StyleSheet.absoluteFill, { transformOrigin: `${xml.hang.x * 100}% ${xml.hang.y * 100}%`, transform: swinging }]} testID="tree-art-swing">
                    <SvgXml xml={xml.swing} width={size} height={size} />
                  </Animated.View>
                ) : null}
              </Animated.View>
            </Animated.View>
            {xml.front !== null ? (
              <Animated.View style={[StyleSheet.absoluteFill, soil]}>
                <SvgXml xml={xml.front} width={size} height={size} />
              </Animated.View>
            ) : null}
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
