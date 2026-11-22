import { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { GAME_EMBLEM_SAMPLES, gameEmblemLayers, gameEmblemLoopMs, gameEmblemSvg, type GameEmblem, type GamePose } from '@kurda/shared';
import { useScreenAwake } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';

/**
 * A game's cover on the phone, drawn from the shared art (shared/src/art/games.ts) so the website shows the same
 * picture. It fills its square with corners rounded by `coverRadius` (or square), which also clips parts that move past the edge.
 * It is decoration beside the game's name, so screen readers skip it; each drawing gets its own clip-path ids, since a
 * screen can show the same cover twice.
 *
 * `moving` plays the cover's loop: one native-driver clock moves every layer by its poses (position, turn, size,
 * opacity), with nothing redrawn. `after` starts the loop that far in, so a list of covers does not move as one. The
 * cover stays still under Reduce Motion, behind another screen and in the background.
 */
/** How round a cover's corners are at a size: the same shape small and large, and the same as the website's. */
const coverRadius = (size: number): number => Math.round(size * 0.22);

export function GameArt({
  game,
  size = 72,
  moving = false,
  after = 0,
  square = false,
}: {
  game: GameEmblem;
  size?: number;
  moving?: boolean;
  after?: number;
  /** Square corners, for a tile that shapes its own edges (a profile's grid of games). */
  square?: boolean;
}): React.JSX.Element {
  const idPrefix = `ga${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const reduce = useReducedMotion();
  const awake = useScreenAwake();
  const radius = square ? 0 : coverRadius(size);
  return moving && !reduce && awake ? (
    <MovingArt game={game} size={size} radius={radius} idPrefix={idPrefix} after={after} />
  ) : (
    <StillArt game={game} size={size} radius={radius} idPrefix={idPrefix} />
  );
}

function StillArt({ game, size, radius, idPrefix }: { game: GameEmblem; size: number; radius: number; idPrefix: string }): React.JSX.Element {
  const xml = useMemo(() => gameEmblemSvg({ game, size, idPrefix }), [game, size, idPrefix]);
  return (
    <View style={[styles.cover, { width: size, height: size, borderRadius: radius }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

/** The loop's moments, 0 to 1: what every layer's poses are spaced over. */
const MOMENTS = Array.from({ length: GAME_EMBLEM_SAMPLES + 1 }, (_, i) => i / GAME_EMBLEM_SAMPLES);

function MovingArt({ game, size, radius, idPrefix, after }: { game: GameEmblem; size: number; radius: number; idPrefix: string; after: number }): React.JSX.Element {
  const layers = useMemo(() => gameEmblemLayers({ game, size, idPrefix }), [game, size, idPrefix]);
  const clock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = gameEmblemLoopMs(game);
    const from = (after % loop) / loop;
    let stopped = false;
    // The first time round starts partway in; after that the loop is whole.
    clock.setValue(from);
    const first = Animated.timing(clock, { toValue: 1, duration: loop * (1 - from), easing: Easing.linear, useNativeDriver: true });
    const rounds = Animated.loop(Animated.timing(clock, { toValue: 1, duration: loop, easing: Easing.linear, useNativeDriver: true }));
    first.start(({ finished }) => {
      if (!finished || stopped) return;
      clock.setValue(0);
      rounds.start();
    });
    return () => {
      stopped = true;
      first.stop();
      rounds.stop();
    };
  }, [clock, game, after]);

  const unit = size / 120;
  return (
    <View style={[styles.cover, { width: size, height: size, borderRadius: radius }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {layers.map((layer, i) => {
        if (!layer.poses) {
          return (
            <View key={i} style={StyleSheet.absoluteFill}>
              <SvgXml xml={layer.svg} width={size} height={size} />
            </View>
          );
        }
        const poses = layer.poses;
        const over = (pick: (p: GamePose) => number): Animated.AnimatedInterpolation<number> => clock.interpolate({ inputRange: MOMENTS, outputRange: poses.map(pick) });
        const turn = clock.interpolate({ inputRange: MOMENTS, outputRange: poses.map((p) => `${p.r}deg`) });
        // A view turns about its middle: stepping out to the layer's pivot and back makes it turn about that instead.
        const out = { x: (layer.pivot[0] - 60) * unit, y: (layer.pivot[1] - 60) * unit };
        return (
          <Animated.View
            key={i}
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: over((p) => p.o),
                transform: [
                  { translateX: over((p) => p.x * unit) },
                  { translateY: over((p) => p.y * unit) },
                  { translateX: out.x },
                  { translateY: out.y },
                  { rotate: turn },
                  { scaleX: over((p) => p.sx) },
                  { scaleY: over((p) => p.sy) },
                  { translateX: -out.x },
                  { translateY: -out.y },
                ],
              },
            ]}
          >
            <SvgXml xml={layer.svg} width={size} height={size} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // The corners clip: a part that moves past the cover's edge stops at it.
  cover: { overflow: 'hidden' },
});
