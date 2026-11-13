import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { treeCloudSvg, treeSceneSvg, treeSkyAt, type TreeAir, type TreeHealth, type TreeSky, type TreeStage } from '@kurda/shared';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { radii } from '../theme/tokens';
import { TreeArt } from './TreeArt';

/**
 * Where the tree stands on its own screen: the sky of the hour, the
 * mountains under it, clouds going over, and whatever is in the air round
 * the tree itself — the same scene the website shows (shared
 * `art/tree-scene.ts`). All of it is decoration: a screen reader is told
 * about the tree, not about its weather, and none of it moves for somebody
 * who has asked for less motion or while the screen is not the one in front.
 */

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** The sky over the learner now, by their own clock; looked at again every few minutes, so a screen left open sees the evening come. */
export function useTreeSky(): TreeSky {
  const [sky, setSky] = useState<TreeSky>(() => treeSkyAt(new Date().getHours()));
  useEffect(() => {
    const id = setInterval(() => setSky(treeSkyAt(new Date().getHours())), 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  return sky;
}

/** The sky's own colour, for the moment before its picture is drawn. */
export const SKY_GROUND: Record<TreeSky, string> = { dawn: '#f4cbbd', day: '#a3daf8', dusk: '#c75d8e', night: '#1a2656' };

/** How far a tree's own weather has gone to dust, by how it fares. */
const DRY: Record<TreeHealth, number> = { fresh: 0, thirsty: 0.2, wilting: 0.55, withered: 1 };

/** The clouds that cross the scene: how high and how big (as shares of its side), how long each takes, and where in its crossing it starts. */
const CLOUDS = [
  { top: -0.04, width: 0.36, seconds: 110, start: 0.34, opacity: 0.95 },
  { top: 0.13, width: 0.22, seconds: 150, start: 0.72, opacity: 0.8 },
  { top: 0.05, width: 0.27, seconds: 190, start: 0.06, opacity: 0.7 },
] as const;

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

/** The sky, the mountains and the clouds, `side` points square, laid at the foot of whatever holds them. */
export function TreeSkyScene({ sky, health, side }: { sky: TreeSky; health: TreeHealth; side: number }): React.JSX.Element {
  const id = useSceneId();
  const alive = useMotionAlive();
  const scene = useMemo(() => treeSceneSvg({ sky, dry: DRY[health], size: side, idPrefix: id }), [sky, health, side, id]);
  const clouds = useMemo(() => CLOUDS.map((c, i) => treeCloudSvg({ sky, size: Math.round(side * c.width), idPrefix: `${id}c${i}` })), [sky, side, id]);
  const drift = useRef(CLOUDS.map((c) => new Animated.Value(c.start))).current;
  useEffect(() => {
    if (!alive) return;
    // each from where it stands to the far side, and then round and round
    const runs = CLOUDS.map((c, i) => {
      const at = drift[i] as Animated.Value;
      const across = { toValue: 1, easing: Easing.linear, useNativeDriver: true };
      return Animated.sequence([Animated.timing(at, { ...across, duration: c.seconds * 1000 * (1 - c.start) }), Animated.loop(Animated.timing(at, { ...across, duration: c.seconds * 1000 }))]);
    });
    runs.forEach((run) => run.start());
    return () => runs.forEach((run) => run.stop());
  }, [alive, drift]);
  return (
    <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill} testID="tree-scene">
      <View style={styles.sky}>
        <SvgXml xml={scene} width={side} height={side} />
      </View>
      {CLOUDS.map((c, i) => {
        const wide = Math.round(side * c.width);
        const across = (drift[i] as Animated.Value).interpolate({ inputRange: [0, 1], outputRange: [-wide * 1.1, side + wide * 0.1] });
        return (
          <Animated.View key={i} style={[styles.cloud, { top: side * c.top, opacity: c.opacity * (1 - DRY[health] * 0.5), transform: [{ translateX: across }] }]} testID="tree-scene-cloud">
            <SvgXml xml={clouds[i] as string} width={wide} height={wide} />
          </Animated.View>
        );
      })}
    </View>
  );
}

/**
 * A tree in its sky as a still picture: what a profile, a card and the
 * nursery show, where nothing needs to move. Its sky is the day's, but for
 * the night tree, which is seen as it is meant to be: at night. `label`
 * names the tree; the sky behind it is never read out.
 */
export function TreePicture({ species, stage, health = 'fresh', size, label = '' }: { species: string; stage: TreeStage; health?: TreeHealth; size: number; label?: string }): React.JSX.Element {
  const id = useSceneId();
  const sky: TreeSky = species === 'sev' ? 'night' : 'day';
  const scene = useMemo(() => treeSceneSvg({ sky, dry: DRY[health], size, idPrefix: id }), [sky, health, size, id]);
  return (
    <View style={[styles.picture, { width: size, height: size, backgroundColor: SKY_GROUND[sky] }]}>
      <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill}>
        <SvgXml xml={scene} width={size} height={size} />
      </View>
      <TreeArt species={species} stage={stage} health={health} size={size} label={label} />
    </View>
  );
}

/** Nine of whatever is in the air, each on a course of its own: where it starts, how long it takes, how far it drifts. */
const AIR = Array.from({ length: 9 }, (_, i) => ({
  x: 0.1 + ((i * 37) % 80) / 100,
  y: 0.22 + ((i * 23) % 46) / 100,
  seconds: 7 + (i % 4) * 1.8,
  start: ((i * 0.37) % 1) * (7 + (i % 4) * 1.8),
  drift: ((i % 3) - 1) * 34 + (i % 2 === 0 ? 10 : -10),
  scale: 0.7 + (i % 3) * 0.22,
}));

const PETALS = ['#f9b2c8', '#fff0f4', '#ffd3df'] as const;
const LEAVES = ['#e2611d', '#ffcb3a', '#f9a424'] as const;

/**
 * The air round the tree, moving: light that rises in the sun, petals or an
 * autumn tree's leaves coming down and turning, or the night tree's
 * fireflies, each wandering round its own place.
 */
export function TreeAmbient({ air, side }: { air: TreeAir | null; side: number }): React.JSX.Element | null {
  const alive = useMotionAlive();
  const clocks = useRef(AIR.map(() => new Animated.Value(0))).current;
  const on = alive && air !== null;
  useEffect(() => {
    if (!on) return;
    const runs = AIR.map((a, i) => {
      const clock = clocks[i] as Animated.Value;
      clock.setValue(0);
      return Animated.sequence([Animated.delay(a.start * 1000), Animated.loop(Animated.timing(clock, { toValue: 1, duration: a.seconds * 1000, easing: Easing.linear, useNativeDriver: true }))]);
    });
    runs.forEach((run) => run.start());
    return () => runs.forEach((run) => run.stop());
  }, [on, clocks]);
  if (!on || !air) return null;
  // the distances were drawn for a scene 360 points square
  const k = side / 360;
  return (
    <View {...HIDDEN} pointerEvents="none" style={StyleSheet.absoluteFill} testID={`tree-air-${air}`}>
      {AIR.map((a, i) => {
        const p = clocks[i] as Animated.Value;
        if (air === 'motes') {
          const rise = {
            opacity: p.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 0.95, 0] }),
            transform: [
              { translateX: p.interpolate({ inputRange: [0, 1], outputRange: [0, a.drift * k] }) },
              { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [0, -210 * k] }) },
              { scale: p.interpolate({ inputRange: [0, 1], outputRange: [a.scale * 0.6, a.scale] }) },
            ],
          };
          return (
            <Animated.View key={i} style={[styles.mote, { left: side * a.x, bottom: side * 0.14 }, rise]}>
              <View style={styles.moteCore} />
            </Animated.View>
          );
        }
        if (air === 'fireflies') {
          const wander = {
            opacity: p.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0.15, 1, 0.3, 1, 0.15] }),
            transform: [
              { translateX: p.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, a.drift * k, a.drift * 0.4 * k, -a.drift * 0.5 * k, 0] }) },
              { translateY: p.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, -16 * k, -30 * k, -12 * k, 0] }) },
              { scale: a.scale },
            ],
          };
          return (
            <Animated.View key={i} style={[styles.firefly, { left: side * a.x, top: side * a.y }, wander]}>
              <View style={styles.fireflyCore} />
            </Animated.View>
          );
        }
        const colours = air === 'petals' ? PETALS : LEAVES;
        const fall = {
          opacity: p.interpolate({ inputRange: [0, 0.12, 0.88, 1], outputRange: [0, 1, 1, 0] }),
          transform: [
            { translateX: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -a.drift * 0.6 * k, a.drift * k] }) },
            { translateY: p.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-12 * k, 130 * k, 280 * k] }) },
            { rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '560deg'] }) },
            { scale: a.scale },
          ],
        };
        return <Animated.View key={i} style={[air === 'petals' ? styles.petal : styles.leaf, { left: side * a.x, top: side * 0.16, backgroundColor: colours[i % colours.length] }, fall]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sky: { position: 'absolute', left: 0, bottom: 0 },
  picture: { borderRadius: radii.md, overflow: 'hidden' },
  cloud: { position: 'absolute', left: 0 },
  // a point of light and the glow round it
  mote: { position: 'absolute', width: 9, height: 9, borderRadius: radii.pill, backgroundColor: 'rgba(255, 246, 190, 0.45)', alignItems: 'center', justifyContent: 'center' },
  moteCore: { width: 4, height: 4, borderRadius: radii.pill, backgroundColor: '#fffdf0' },
  firefly: { position: 'absolute', width: 11, height: 11, borderRadius: radii.pill, backgroundColor: 'rgba(255, 233, 130, 0.5)', alignItems: 'center', justifyContent: 'center' },
  fireflyCore: { width: 4, height: 4, borderRadius: radii.pill, backgroundColor: '#fffbd6' },
  petal: { position: 'absolute', width: 10, height: 7, borderRadius: radii.pill },
  leaf: { position: 'absolute', width: 12, height: 7, borderRadius: radii.pill },
});
