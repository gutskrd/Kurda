import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { DICTIONARY_CANVAS, dictionaryStillSvg, dictionaryTileSvg, dictionaryTiles, type DictionaryTile } from '@kurda/shared';
import { useScreenAwake } from '../a11y/useMotionAlive';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { useTheme } from '../theme/ThemeProvider';

/** The picture's size on the page. */
const SIZE = 232;
/** The square each tile is cut out with, in the picture's units: room for the tile turned and its edge. */
const BOX = 20;
/** One rise and settle of a tile, and how far it rises, in the picture's units. */
const FLOAT_MS = 3200;
const RISE = 2.4;

/**
 * The dictionary's picture before anything is searched, drawn from the shared art (shared/src/art/dictionary.ts) as the
 * website draws it: an open book with the letters Kurmancî adds to the alphabet lifting off it. Each tile floats on its
 * own beat, and they hold still under Reduce Motion and off screen. It is decoration, so screen readers pass it by.
 */
export function DictionaryArt(): React.JSX.Element {
  const { scheme } = useTheme();
  const dark = scheme === 'dark';
  const still = useMemo(() => dictionaryStillSvg({ size: SIZE, dark, idPrefix: dark ? 'dictd' : 'dictl' }), [dark]);
  const tiles = useMemo(() => dictionaryTiles(dark), [dark]);
  return (
    <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="dictionary-art">
      <SvgXml xml={still} width={SIZE} height={SIZE} />
      {tiles.map((t, i) => (
        <FloatingTile key={t.ch} tile={t} beat={i} />
      ))}
    </View>
  );
}

function FloatingTile({ tile, beat }: { tile: DictionaryTile; beat: number }): React.JSX.Element {
  const reduce = useReducedMotion();
  const awake = useScreenAwake();
  const k = SIZE / DICTIONARY_CANVAS;
  const [cx, cy] = tile.at;
  const xml = useMemo(
    () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cx - BOX / 2} ${cy - BOX / 2} ${BOX} ${BOX}">${dictionaryTileSvg(tile)}</svg>`,
    [tile, cx, cy],
  );
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce || !awake) {
      rise.setValue(0);
      return;
    }
    const half = (to: number) => Animated.timing(rise, { toValue: to, duration: FLOAT_MS / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true });
    const loop = Animated.loop(Animated.sequence([half(1), half(0)]));
    // Each tile starts its loop a fifth of a beat after the one before, so they never move as one.
    const start = setTimeout(() => loop.start(), beat * (FLOAT_MS / 5));
    return () => {
      clearTimeout(start);
      loop.stop();
    };
  }, [rise, reduce, awake, beat]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.tile,
        { left: (cx - BOX / 2) * k, top: (cy - BOX / 2) * k, width: BOX * k, height: BOX * k },
        { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -RISE * k] }) }] },
      ]}
    >
      <SvgXml xml={xml} width={BOX * k} height={BOX * k} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  art: { alignSelf: 'center', width: SIZE, height: SIZE },
  tile: { position: 'absolute' },
});
