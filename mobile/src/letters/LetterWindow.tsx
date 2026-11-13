import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { LETTER_BIRD_FEET, LETTER_SILL, letterBirdSvg, letterWindowSvg, treeSkyAt, type SongbirdPose } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { radii } from '../theme/tokens';

/**
 * Your window on the letters screen (shared/src/art/letters.ts), as the
 * website draws it (web/src/letters/LetterWindow.tsx): the hour's sky through
 * it and, on the sill, a bird.
 *
 * What the bird does is the screen's news, so it is acted rather than written:
 *   - `home`: your bird on the sill;
 *   - `leaving`: your bird takes the letter in its beak and flies up and out;
 *   - `away`: the sill is empty, your bird is out;
 *   - `arriving`: a bird flies in with a letter and lands.
 * Only transform and opacity move, on the native driver; a reader who asked
 * for less motion sees each flight as it ends, at once. The picture is
 * decoration: the screen says in words what the bird is doing.
 */
export type WindowScene = { kind: 'home'; bird: number } | { kind: 'leaving'; bird: number } | { kind: 'away' } | { kind: 'arriving'; bird: number };

const HIDDEN = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };
const FLIGHT_MS = 1500;

let drawings = 0;
function nextId(): string {
  drawings += 1;
  return `hvw${drawings.toString(36)}`;
}

/** A bird on its own square, placed so its feet stand on the sill of a window `size` wide. */
function Bird({ bird, pose, facingLeft = false, size }: { bird: number; pose: SongbirdPose; facingLeft?: boolean; size: number }): React.JSX.Element {
  const id = useRef(nextId()).current;
  const xml = useMemo(() => letterBirdSvg({ bird, pose, facingLeft, size: 120, idPrefix: id }), [bird, pose, facingLeft, id]);
  const box = size * LETTER_SILL.birdShare;
  const left = (LETTER_SILL.x / 120) * size - (LETTER_BIRD_FEET.x / 120) * box;
  const top = (LETTER_SILL.y / 120) * size - (LETTER_BIRD_FEET.y / 120) * box;
  return (
    <View style={{ position: 'absolute', left, top, width: box, height: box }}>
      <SvgXml xml={xml} width={box} height={box} />
    </View>
  );
}

export function LetterWindow({ scene, size, onDone }: { scene: WindowScene; size: number; onDone?: () => void }): React.JSX.Element {
  const reduce = useReducedMotion();
  const id = useRef(nextId()).current;
  const sky = treeSkyAt(new Date().getHours());
  const xml = useMemo(() => letterWindowSvg({ sky, size, idPrefix: id }), [sky, size, id]);
  // 0 on the sill, 1 gone over the top of the window
  const flight = useRef(new Animated.Value(scene.kind === 'arriving' ? 1 : 0)).current;
  const [landed, setLanded] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    setLanded(false);
    if (scene.kind !== 'leaving' && scene.kind !== 'arriving') return;
    const leaving = scene.kind === 'leaving';
    flight.setValue(leaving ? 0 : 1);
    const finish = (): void => {
      if (!leaving) setLanded(true);
      done.current?.();
    };
    if (reduce) {
      flight.setValue(leaving ? 1 : 0);
      finish();
      return;
    }
    const run = Animated.timing(flight, {
      toValue: leaving ? 1 : 0,
      duration: FLIGHT_MS,
      easing: leaving ? Easing.inOut(Easing.quad) : Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) finish();
    });
    return () => run.stop();
  }, [scene, reduce, flight]);

  // off up and to the far side; in, the same path the other way
  const flying = {
    opacity: flight.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0] }),
    transform: [
      { translateX: flight.interpolate({ inputRange: [0, 0.15, 0.55, 1], outputRange: [0, 0, size * 0.22, size * 0.7] }) },
      { translateY: flight.interpolate({ inputRange: [0, 0.15, 0.55, 1], outputRange: [0, size * 0.03, -size * 0.34, -size * 0.95] }) },
      { scale: flight.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 0.86, 0.5] }) },
    ],
  };

  return (
    <View {...HIDDEN} style={[styles.window, { width: size, height: size }]}>
      <SvgXml xml={xml} width={size} height={size} />
      {scene.kind === 'home' ? <Bird bird={scene.bird} pose="perched" size={size} /> : null}
      {scene.kind === 'leaving' ? (
        <Animated.View style={[StyleSheet.absoluteFill, flying]}>
          <Bird bird={scene.bird} pose="carrying" size={size} />
        </Animated.View>
      ) : null}
      {scene.kind === 'arriving' ? (
        landed ? (
          <Bird bird={scene.bird} pose="perched" facingLeft size={size} />
        ) : (
          <Animated.View style={[StyleSheet.absoluteFill, flying]}>
            <Bird bird={scene.bird} pose="carrying" facingLeft size={size} />
          </Animated.View>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  window: { alignSelf: 'center', overflow: 'hidden', borderRadius: radii.xl },
});
