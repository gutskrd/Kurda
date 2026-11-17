import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { BURROW_PLACE, BURROW_POP, BURROW_VIEW, burrowArt, type CharacterPoint } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo } from '../theme/animate';
import { useTheme } from '../theme/ThemeProvider';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';
import type { PlaybackClock } from './voice';

/** How far past the picture's top and sides a hop or a twitch of an ear may carry him before anything cuts him off, as a share of its height. */
const ROOM = 0.3;

/** What he is saying from the hole, read as a speaking character reads a player: the clock, whether it runs, and a name for the line. */
export interface BurrowSpeech {
  player: PlaybackClock | null;
  playing: boolean;
  source: string | null;
}

/**
 * Hevalo looking out of a hole in the ground (shared `burrowArt`): his head
 * and the top of his neck come up out of a burrow dug in a patch of meadow,
 * and nothing of him is cut off in the air. As the picture appears he comes
 * up out of the hole on a spring, his shade coming onto the rim with him, all
 * on one value; under Reduce Motion he is simply there. Alive as ever: he
 * blinks, glances about, looks where he is told (`gaze`), follows a finger,
 * and cheers or tilts his head at a `reaction`.
 *
 * Given `speech` and the `text` of a line, he says it: his mouth moves with
 * the words by the clock the speech keeps (auth/guide/speech.ts).
 *
 * The hole is scenery a screen reader passes by; he is as he is everywhere
 * (named, answering a tap), and a caller that shows him beside words that
 * say what he does hides him with them. Turned round (`flip`), he faces the other way and the
 * picture is mirrored with him.
 */
export function HevaloBurrow({
  size,
  reaction = null,
  gaze = null,
  resting = false,
  flip = false,
  pop = true,
  speech = null,
  text = null,
  onPress,
  style,
}: {
  /** how tall the picture is drawn, in points; its width follows */
  size: number;
  reaction?: CharacterReaction | null;
  gaze?: CharacterPoint | null;
  resting?: boolean;
  flip?: boolean;
  /** he comes up out of the hole as it appears; false, he is there already */
  pop?: boolean;
  /** the line he is saying, and its clock; null, he is quiet */
  speech?: BurrowSpeech | null;
  text?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const art = useMemo(() => burrowArt({ dark: scheme === 'dark' }), [scheme]);
  const width = (size * BURROW_VIEW.w) / BURROW_VIEW.h;
  const drop = BURROW_PLACE.drop * size;
  const rise = useRef(new Animated.Value(pop && !reduce ? drop : 0)).current;

  useEffect(() => {
    // asked for less motion — an answer that may arrive a moment after he appears — he is simply there
    if (!pop || reduce) {
      rise.stopAnimation();
      rise.setValue(0);
      return;
    }
    const up = springTo(rise, 0, 'bouncy', BURROW_POP.delayMs);
    up.start();
    return () => up.stop();
    // once, as he appears; a new size moves nothing
  }, [pop, reduce, rise]);

  // his shade comes onto the rim as he comes up
  const shade = useMemo(() => rise.interpolate({ inputRange: [0, drop], outputRange: [1, 0], extrapolate: 'clamp' }), [rise, drop]);

  const room = size * ROOM;
  const { figure } = BURROW_PLACE;
  const mirrored = flip ? styles.flip : null;
  return (
    // the hole and its grass are scenery a screen reader passes by; he is named and answers a tap as he always does, wherever he is shown
    <View style={[{ width, height: size }, style]} pointerEvents="box-none" testID="hevalo-burrow">
      <View style={[StyleSheet.absoluteFill, mirrored]} pointerEvents="none" aria-hidden>
        <SvgXml xml={art.back} width={width} height={size} />
      </View>
      {/* he is cut off at the hole's near rim and nowhere else: an ear or an antler may reach past the picture's top and sides */}
      <View
        style={[styles.cut, { top: -room, left: -room, right: -room, height: BURROW_PLACE.cut * size + room }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.place, { left: room + figure.left * width, top: room + figure.top * size, transform: [{ translateY: rise }] }]}
          testID="hevalo-burrow-figure"
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
            gaze={gaze}
            reaction={reaction}
            resting={resting}
            onPress={onPress}
          />
        </Animated.View>
      </View>
      <View style={[StyleSheet.absoluteFill, mirrored]} pointerEvents="none" aria-hidden>
        <SvgXml xml={art.front} width={width} height={size} />
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, mirrored, { opacity: shade }]} pointerEvents="none" aria-hidden testID="hevalo-burrow-shadow">
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
