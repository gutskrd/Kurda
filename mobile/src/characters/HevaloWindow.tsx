import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { WINDOW_PLACE, WINDOW_POP, WINDOW_VIEW, windowArt } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo } from '../theme/animate';
import { useTheme } from '../theme/ThemeProvider';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';

/** How far past the window's top and sides a hop or a twitch of an ear may carry him before anything cuts him off, as a share of its height. */
const ROOM = 0.3;

/**
 * Hevalo leaning out of his window (shared `windowArt`): his head and neck
 * out of a round-arched window in a clay wall, his neck going down behind
 * the sill. As the window appears his head pops up from under the sill on a
 * spring and settles; under Reduce Motion he is simply there. Alive as ever:
 * he blinks, glances about, follows a finger, and cheers or tilts his head
 * at a `reaction`.
 *
 * Decorative: the words beside him say whatever he does, so a screen reader
 * passes him by. Turned round (`flip`), he faces the other way and the
 * window is mirrored with him, its curtain and flowers changing sides.
 */
export function HevaloWindow({
  size,
  reaction = null,
  flip = false,
  pop = true,
  style,
}: {
  /** how tall the window is drawn, in points; its width follows */
  size: number;
  reaction?: CharacterReaction | null;
  flip?: boolean;
  /** his head rises into the window as it appears; false, he is there already */
  pop?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const art = useMemo(() => windowArt({ dark: scheme === 'dark' }), [scheme]);
  const width = (size * WINDOW_VIEW.w) / WINDOW_VIEW.h;
  const drop = WINDOW_PLACE.drop * size;
  const rise = useRef(new Animated.Value(pop && !reduce ? drop : 0)).current;

  useEffect(() => {
    // asked for less motion — an answer that may arrive a moment after he appears — he is simply there
    if (!pop || reduce) {
      rise.stopAnimation();
      rise.setValue(0);
      return;
    }
    const up = springTo(rise, 0, 'bouncy', WINDOW_POP.delayMs);
    up.start();
    return () => up.stop();
    // once, as he appears; a new size moves nothing
  }, [pop, reduce, rise]);

  const room = size * ROOM;
  const { figure } = WINDOW_PLACE;
  const mirrored = flip ? styles.flip : null;
  return (
    <View
      style={[{ width, height: size }, style]}
      pointerEvents="none"
      aria-hidden
      testID="hevalo-window"
    >
      <View style={[StyleSheet.absoluteFill, mirrored]}>
        <SvgXml xml={art.back} width={width} height={size} />
      </View>
      {/* he is cut off at the sill and nowhere else: an ear or an antler may reach past the window's top and sides */}
      <View style={[styles.cut, { top: -room, left: -room, right: -room, height: WINDOW_PLACE.sill * size + room }]}>
        <Animated.View
          style={[styles.place, { left: room + figure.left * width, top: room + figure.top * size, transform: [{ translateY: rise }] }]}
          testID="hevalo-window-figure"
        >
          <SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="head" size={figure.width * width} flip={flip} reaction={reaction} />
        </Animated.View>
      </View>
      <View style={[StyleSheet.absoluteFill, mirrored]}>
        <SvgXml xml={art.front} width={width} height={size} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flip: { transform: [{ scaleX: -1 }] },
  cut: { position: 'absolute', overflow: 'hidden' },
  place: { position: 'absolute' },
});
