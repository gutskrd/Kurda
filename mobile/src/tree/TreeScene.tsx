import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { TREE_FOOT, TREE_STUDIO, TREE_STUDIO_PLACE, treeStudioSvg, type TreeHealth, type TreeSeason, type TreeSeasonAir, type TreeStage } from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { radii } from '../theme/tokens';
import { TreeArt } from './TreeArt';
import { useTreeSeason } from './season';

/**
 * Where the tree stands, as in the owner's reference and as the website has
 * it: a soft scene in the colour of the season — blush in spring, sky blue in
 * summer, cream in autumn, deep blue in winter — with the tree on its round of
 * grass on the floor, and the season blowing past it to the left (shared
 * `art/tree-scene.ts`). All of it is decoration: a screen reader is told
 * about the tree, not about its weather, and none of it moves for somebody
 * who has asked for less motion or while the screen is not the one in front.
 */

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** The season's own colour, for the moment before its picture is drawn and wherever the scene is wider than its square. */
export function studioColour(season: TreeSeason): string {
  return TREE_STUDIO[season].wall[0];
}

/** How far a tree's own scene has gone to dust, by how it fares. */
const DRY: Record<TreeHealth, number> = { fresh: 0, thirsty: 0.2, wilting: 0.55, withered: 1 };

/** Where the tree's own square stands in a scene `side` points tall: how big it is drawn, and how far its foot of the square is off the bottom. */
export function treePlace(side: number): { size: number; bottom: number } {
  return { size: Math.round(side * TREE_STUDIO_PLACE.share), bottom: side * (1 - TREE_STUDIO_PLACE.foot - TREE_STUDIO_PLACE.share * (1 - TREE_FOOT.y)) };
}

let scenes = 0;
/** An id prefix of this scene's own, so its gradients are never another drawing's. */
function useSceneId(): string {
  const id = useRef<string | null>(null);
  if (id.current === null) {
    scenes += 1;
    id.current = `hvs${scenes.toString(36)}`;
  }
  return id.current;
}

/** The season's wall and floor, `side` points square, laid at the foot of whatever holds them. */
export function TreeStudioScene({ season, health, side }: { season: TreeSeason; health: TreeHealth; side: number }): React.JSX.Element {
  const id = useSceneId();
  const scene = useMemo(() => treeStudioSvg({ season, dry: DRY[health], size: side, idPrefix: id }), [season, health, side, id]);
  return (
    <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill} testID="tree-scene">
      <View style={styles.wall}>
        <SvgXml xml={scene} width={side} height={side} />
      </View>
    </View>
  );
}

/**
 * A tree in its season as a still picture: what a profile, a card and the
 * nursery show, where nothing needs to move. It is today's season unless one
 * is given. `label` names the tree; the scene behind it is never read out.
 */
export function TreePicture({
  species,
  stage,
  health = 'fresh',
  season: given,
  size,
  label = '',
}: {
  species: string;
  stage: TreeStage;
  health?: TreeHealth;
  season?: TreeSeason;
  size: number;
  label?: string;
}): React.JSX.Element {
  const id = useSceneId();
  const today = useTreeSeason();
  const season = given ?? today;
  const scene = useMemo(() => treeStudioSvg({ season, dry: DRY[health], size, idPrefix: id }), [season, health, size, id]);
  const place = treePlace(size);
  return (
    <View style={[styles.picture, { width: size, height: size, backgroundColor: studioColour(season) }]}>
      <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <SvgXml xml={scene} width={size} height={size} />
      </View>
      <TreeArt species={species} stage={stage} health={health} season={season} size={place.size} label={label} style={[styles.pictureTree, { bottom: place.bottom }]} />
    </View>
  );
}

/**
 * What blows past the tree, each on a course of its own: where it leaves the
 * crown (as shares of the scene), how long it takes to cross, and how far it
 * falls on the way. The wind is the reference's, always toward the left.
 */
const BLOWN = Array.from({ length: 14 }, (_, i) => ({
  x: 0.4 + ((i * 29) % 40) / 100,
  y: 0.16 + ((i * 17) % 42) / 100,
  seconds: 6.5 + (i % 4) * 1.4,
  start: ((i * 0.41) % 1) * (6.5 + (i % 4) * 1.4),
  drop: 70 + ((i * 53) % 150),
  scale: 0.75 + (i % 3) * 0.2,
}));

/** Snow, across the whole scene: where each flake starts, how slowly it falls, and how far the wind takes it. */
const FLAKES = Array.from({ length: 24 }, (_, i) => ({
  x: 0.02 + ((i * 41) % 104) / 100,
  seconds: 9 + (i % 5) * 1.7,
  start: ((i * 0.53) % 1) * (9 + (i % 5) * 1.7),
  drift: -(30 + ((i * 37) % 70)),
  scale: 0.6 + (i % 4) * 0.22,
}));

/** The way a leaf crosses: slow to leave, quicker through the middle, easing as it goes off. */
const GUST = Easing.bezier(0.35, 0.1, 0.6, 1);

/**
 * The season in the air round the tree, moving: petals or leaves blown off
 * the crown to the left, turning over and over as they fall (the squeeze in
 * their height), or snow coming down over the whole scene. It lies over the
 * tree, as the reference's leaves cross before it, and never takes a touch.
 */
export function TreeSeasonAmbient({ air, side }: { air: TreeSeasonAir | null; side: number }): React.JSX.Element | null {
  const alive = useMotionAlive();
  const snow = air?.air === 'snow';
  const courses = snow ? FLAKES : BLOWN;
  const clocks = useRef(FLAKES.map(() => new Animated.Value(0))).current;
  const on = alive && air !== null;
  useEffect(() => {
    if (!on) return;
    const runs = courses.map((c, i) => {
      const clock = clocks[i] as Animated.Value;
      clock.setValue(0);
      const pass = Animated.timing(clock, { toValue: 1, duration: c.seconds * 1000, easing: snow ? Easing.linear : GUST, useNativeDriver: true });
      return Animated.sequence([Animated.delay(c.start * 1000), Animated.loop(pass)]);
    });
    runs.forEach((run) => run.start());
    return () => runs.forEach((run) => run.stop());
  }, [on, snow, courses, clocks]);
  if (!on || !air) return null;
  // the distances were drawn for a scene 360 points square
  const k = side / 360;
  return (
    <View {...HIDDEN} pointerEvents="none" style={[StyleSheet.absoluteFill, styles.air]} testID={`tree-air-${air.air}`}>
      {snow
        ? FLAKES.map((f, i) => {
            const p = clocks[i] as Animated.Value;
            const fall = {
              opacity: p.interpolate({ inputRange: [0, 0.1, 0.92, 1], outputRange: [0, 0.95, 0.9, 0] }),
              transform: [
                { translateX: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, (f.drift * 0.45 + 8) * k, f.drift * k] }) },
                { translateY: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, side * 0.52, side * 1.08] }) },
                { scale: f.scale },
              ],
            };
            return <Animated.View key={i} style={[styles.flake, { left: side * f.x, top: -side * 0.03, backgroundColor: air.colours[i % 3] }, fall]} />;
          })
        : BLOWN.map((b, i) => {
            const p = clocks[i] as Animated.Value;
            const at = [0, 0.25, 0.5, 0.75, 1];
            const blow = {
              opacity: p.interpolate({ inputRange: [0, 0.08, 0.9, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: p.interpolate({ inputRange: at, outputRange: [0, -90 * k, -200 * k, -320 * k, -460 * k] }) },
                { translateY: p.interpolate({ inputRange: at, outputRange: [0, (b.drop * 0.12 - 14) * k, b.drop * 0.4 * k, (b.drop * 0.62 - 10) * k, b.drop * k] }) },
                { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '600deg'] }) },
                { scaleX: b.scale },
                { scaleY: p.interpolate({ inputRange: at, outputRange: [b.scale, b.scale * 0.35, b.scale, b.scale * 0.4, b.scale] }) },
              ],
            };
            return <Animated.View key={i} style={[air.air === 'petals' ? styles.petal : styles.leaf, { left: side * b.x, top: side * b.y, backgroundColor: air.colours[i % 3] }, blow]} />;
          })}
    </View>
  );
}

const styles = StyleSheet.create({
  wall: { position: 'absolute', left: 0, bottom: 0 },
  picture: { borderRadius: radii.md, overflow: 'hidden', alignItems: 'center' },
  pictureTree: { position: 'absolute' },
  air: { overflow: 'hidden' },
  // a petal is rounder than a leaf; both are flat shapes of colour, as the trees are
  petal: { position: 'absolute', width: 12, height: 9, borderTopLeftRadius: radii.pill, borderBottomRightRadius: radii.pill, borderTopRightRadius: radii.xs, borderBottomLeftRadius: radii.xs },
  leaf: { position: 'absolute', width: 15, height: 9, borderTopLeftRadius: radii.pill, borderBottomRightRadius: radii.pill },
  flake: { position: 'absolute', width: 6, height: 6, borderRadius: radii.pill },
});
