import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { WINDOW_PLACE, WINDOW_POP, WINDOW_VIEW, windowArt } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo } from '../theme/animate';
import { useTheme } from '../theme/ThemeProvider';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';
import type { PlaybackClock } from './voice';

/** How far past the window's top and sides a hop or ear twitch may carry him before he is clipped, as a share of its height. */
const ROOM = 0.3;

/** What he is saying at the window, read like a player: the clock, whether it runs, and a name for the line. */
export interface WindowSpeech {
  player: PlaybackClock | null;
  playing: boolean;
  source: string | null;
}

/**
 * Hevalo putting his head in at a village-room window (shared `windowArt`), with sky and mountains behind him. As
 * the window appears he rises in over the sill on a spring, growing slightly as he nears and his shadow arriving
 * with him, all on one value; under Reduce Motion he is just there. He blinks, glances, follows a finger, and
 * cheers or tilts his head at a `reaction`.
 *
 * Given `speech` and a line's `text`, he lip-syncs to the speech's clock (auth/guide/speech.ts), with no
 * recording. Decorative: screen readers skip him. `flip` mirrors him and the window, swapping the pot and view
 * sides.
 */
export function HevaloWindow({
  size,
  reaction = null,
  flip = false,
  pop = true,
  speech = null,
  text = null,
  style,
}: {
  /** How tall the window is drawn, in points; its width follows. */
  size: number;
  reaction?: CharacterReaction | null;
  flip?: boolean;
  /** He comes in at the window as it appears; false, he is there already. */
  pop?: boolean;
  /** The line he is saying, and its clock; null, he is quiet. */
  speech?: WindowSpeech | null;
  text?: string | null;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const art = useMemo(() => windowArt({ dark: scheme === 'dark' }), [scheme]);
  const width = (size * WINDOW_VIEW.w) / WINDOW_VIEW.h;
  const drop = WINDOW_PLACE.drop * size;
  const rise = useRef(new Animated.Value(pop && !reduce ? drop : 0)).current;

  useEffect(() => {
    // Asked for less motion — an answer that may arrive a moment after he appears — he is simply there.
    if (!pop || reduce) {
      rise.stopAnimation();
      rise.setValue(0);
      return;
    }
    const up = springTo(rise, 0, 'bouncy', WINDOW_POP.delayMs);
    up.start();
    return () => up.stop();
    // Once, as he appears; a new size moves nothing.
  }, [pop, reduce, rise]);

  // Farther off as he waits under the sill, and his shadow not on it yet.
  const { grow, shade } = useMemo(
    () => ({
      grow: rise.interpolate({ inputRange: [0, drop], outputRange: [1, WINDOW_PLACE.far] }),
      shade: rise.interpolate({ inputRange: [0, drop], outputRange: [1, 0], extrapolate: 'clamp' }),
    }),
    [rise, drop],
  );

  const room = size * ROOM;
  const { figure, through } = WINDOW_PLACE;
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
      {/* He is clipped at the sill only: an ear or antler may reach past the window's top and sides into the room. */}
      <View style={[styles.cut, { top: -room, left: -room, right: -room, height: WINDOW_PLACE.sill * size + room }]}>
        <Animated.View
          style={[
            styles.place,
            {
              left: room + figure.left * width,
              top: room + figure.top * size,
              transformOrigin: `${through.x * 100}% ${through.y * 100}%`,
              transform: [{ translateY: rise }, { scale: grow }],
            },
          ]}
          testID="hevalo-window-figure"
        >
          <SpeakingCharacter
            speaker="hevalo"
            player={speech?.player ?? null}
            playing={speech?.playing ?? false}
            source={speech?.source ?? null}
            text={text}
            crop="head"
            size={figure.width * width}
            flip={flip}
            reaction={reaction}
          />
        </Animated.View>
      </View>
      <View style={[StyleSheet.absoluteFill, mirrored]}>
        <SvgXml xml={art.front} width={width} height={size} />
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, mirrored, { opacity: shade }]} testID="hevalo-window-shadow">
        <SvgXml xml={art.shadow} width={width} height={size} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flip: { transform: [{ scaleX: -1 }] },
  cut: { position: 'absolute', overflow: 'hidden' },
  place: { position: 'absolute' },
});
