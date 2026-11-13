import { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { GAME_EMBLEM_SAMPLES, gameEmblemLayers, gameEmblemLoopMs, gameEmblemSvg, type GameEmblem, type GamePose } from '@kurda/shared';
import { useScreenAwake } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';

/**
 * A game's cover on the phone, drawn from the shared art
 * (shared/src/art/games.ts) so the website shows the same picture.
 *
 * A cover is an illustration that fills its square, so it is shown edge to
 * edge with its corners rounded here, by a share of its size (`coverRadius`):
 * the rounding also keeps a part that moves past the cover's edge from
 * showing outside it.
 *
 * It is decoration beside the game's name, so it is hidden from a screen
 * reader. A screen can show the same cover twice (the featured game, and its
 * card under a filter), and a drawing's clip paths are found by id, so every
 * one drawn here gets ids of its own.
 *
 * `moving` plays the cover's own loop: its parts are laid over one another,
 * each drawn once, and one clock running on the native driver moves them all
 * by their poses — position, turn, size and opacity, nothing drawn again.
 * `after` starts the loop that far in, so a list of covers does not move as
 * one. With Reduce Motion on, the still cover is shown — and so it is while
 * the screen it is on is behind another or the app is in the background: a
 * loop nobody is watching is a cost and nothing else.
 */
/** How round a cover's corners are at a size: the same shape small and large, and the same as the website's. */
export const coverRadius = (size: number): number => Math.round(size * 0.22);

export function GameArt({ game, size = 72, moving = false, after = 0 }: { game: GameEmblem; size?: number; moving?: boolean; after?: number }): React.JSX.Element {
  const idPrefix = `ga${useId().replace(/[^A-Za-z0-9]/g, '')}`;
  const reduce = useReducedMotion();
  const awake = useScreenAwake();
  return moving && !reduce && awake ? <MovingArt game={game} size={size} idPrefix={idPrefix} after={after} /> : <StillArt game={game} size={size} idPrefix={idPrefix} />;
}

function StillArt({ game, size, idPrefix }: { game: GameEmblem; size: number; idPrefix: string }): React.JSX.Element {
  const xml = useMemo(() => gameEmblemSvg({ game, size, idPrefix }), [game, size, idPrefix]);
  return (
    <View style={[styles.cover, { width: size, height: size, borderRadius: coverRadius(size) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}

/** The loop's moments, 0 to 1: what every layer's poses are spaced over. */
const MOMENTS = Array.from({ length: GAME_EMBLEM_SAMPLES + 1 }, (_, i) => i / GAME_EMBLEM_SAMPLES);

function MovingArt({ game, size, idPrefix, after }: { game: GameEmblem; size: number; idPrefix: string; after: number }): React.JSX.Element {
  const layers = useMemo(() => gameEmblemLayers({ game, size, idPrefix }), [game, size, idPrefix]);
  const clock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = gameEmblemLoopMs(game);
    const from = (after % loop) / loop;
    let stopped = false;
    // the first time round starts partway in; after that the loop is whole
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
    <View style={[styles.cover, { width: size, height: size, borderRadius: coverRadius(size) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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
        // a view turns about its middle: stepping out to the layer's pivot and back makes it turn about that instead
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
  // the corners clip: a part that moves past the cover's edge stops at it
  cover: { overflow: 'hidden' },
});
