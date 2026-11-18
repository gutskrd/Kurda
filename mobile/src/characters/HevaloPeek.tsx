import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { PEEK_PLACE, PEEK_POP, PEEK_VIEW, characterSvg, peekArt, type BrowState, type CharacterPoint } from '@kurda/shared';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { springTo } from '../theme/animate';
import { useTheme } from '../theme/ThemeProvider';
import { SpeakingCharacter, type CharacterReaction } from './SpeakingCharacter';
import type { PlaybackClock } from './voice';

/** The share of the rise at which he is through enough to cheer. */
const GLAD_AT = 0.55;

/** How far past the picture's top and sides a hop or ear twitch may carry him before he is clipped, as a share of its height. */
const ROOM = 0.3;

/** What he is saying, read like a player: the clock, whether it runs, and a name for the line. */
export interface PeekSpeech {
  player: PlaybackClock | null;
  playing: boolean;
  source: string | null;
}

/**
 * Hevalo's head poking through a torn page (shared `peekArt`). He rises through the tear on a spring when shown,
 * with his shadows following on one value, or appears in place under Reduce Motion. He blinks, glances, looks
 * where told (`gaze`), follows a finger, cheers as he comes through, and reacts to `reaction`; `resting`, he dozes
 * instead, with no cheer, blinks or glances. `speech` and `text` make him say a line (auth/guide/speech.ts); `flip`
 * mirrors the whole picture. The tear is decorative for screen readers; he is named and answers taps as everywhere.
 * `still` draws him once, with no life and no taps, for a picture that only decorates.
 */
export function HevaloPeek({
  size,
  reaction = null,
  gaze = null,
  resting = false,
  flip = false,
  pop = true,
  still = false,
  brows,
  speech = null,
  text = null,
  onPress,
  style,
}: {
  /** The picture's drawn height in points; its width follows. */
  size: number;
  reaction?: CharacterReaction | null;
  gaze?: CharacterPoint | null;
  resting?: boolean;
  flip?: boolean;
  /** He rises through the tear as it appears; false, he is already there. */
  pop?: boolean;
  still?: boolean;
  /** How his brows sit while `still`; at rest by default. */
  brows?: BrowState;
  /** The line he is saying, and its clock; null when he is quiet. */
  speech?: PeekSpeech | null;
  text?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { scheme } = useTheme();
  const reduce = useReducedMotion();
  const art = useMemo(() => peekArt({ dark: scheme === 'dark' }), [scheme]);
  const width = (size * PEEK_VIEW.w) / PEEK_VIEW.h;
  const { figure } = PEEK_PLACE;
  const figureWidth = figure.width * width;
  const drawn = useMemo(() => (still ? characterSvg('hevalo', { crop: 'head', width: figureWidth, brows }) : null), [still, figureWidth, brows]);
  const drop = PEEK_PLACE.drop * size;
  const rise = useRef(new Animated.Value(pop && !reduce ? drop : 0)).current;
  // Through the page, he cheers as the spring settles, unless the screen has a reaction of its own for him; asleep, never.
  const [glad, setGlad] = useState<CharacterReaction | null>(null);
  useEffect(() => {
    if (!pop || reduce || resting) return;
    const id = setTimeout(() => setGlad('cheer'), PEEK_POP.delayMs + PEEK_POP.ms * GLAD_AT);
    return () => clearTimeout(id);
  }, [pop, reduce, resting]);

  useEffect(() => {
    // Under Reduce Motion (an answer that may arrive just after he appears) he is simply there.
    if (!pop || reduce) {
      rise.stopAnimation();
      rise.setValue(0);
      return;
    }
    const up = springTo(rise, 0, 'bouncy', PEEK_POP.delayMs);
    up.start();
    return () => up.stop();
    // Once, as he appears; a new size moves nothing.
  }, [pop, reduce, rise]);

  // His shadows come with him: on the page behind his head, and in the dark under his chin.
  const shade = useMemo(() => rise.interpolate({ inputRange: [0, drop], outputRange: [1, 0], extrapolate: 'clamp' }), [rise, drop]);

  const room = size * ROOM;
  const mirrored = flip ? styles.flip : null;
  return (
    // The tear is decorative for screen readers; he is named and answers a tap as everywhere.
    <View style={[{ width, height: size }, style]} pointerEvents="box-none" testID="hevalo-peek">
      <View style={[StyleSheet.absoluteFill, mirrored]} pointerEvents="none" aria-hidden>
        <SvgXml xml={art.back} width={width} height={size} />
      </View>
      {/* The shadow his head throws on the page, arriving with him. */}
      <Animated.View style={[StyleSheet.absoluteFill, mirrored, { opacity: shade }]} pointerEvents="none" aria-hidden testID="hevalo-peek-cast">
        <SvgXml xml={art.cast} width={width} height={size} />
      </Animated.View>
      {/* He is clipped at the tear's foot only: an ear or antler may reach past the picture's top and sides. */}
      <View
        style={[styles.cut, { top: -room, left: -room, right: -room, height: PEEK_PLACE.cut * size + room }]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.place, { left: room + figure.left * width, top: room + figure.top * size, transform: [{ translateY: rise }] }]}
          testID="hevalo-peek-figure"
        >
          {drawn ? (
            <SvgXml xml={drawn} width={figureWidth} height={figure.height * size} style={flip ? styles.flip : null} />
          ) : (
            <SpeakingCharacter
              speaker="hevalo"
              player={speech?.player ?? null}
              playing={speech?.playing ?? false}
              source={speech?.source ?? null}
              text={text}
              crop="head"
              size={figureWidth}
              flip={flip}
              gaze={gaze}
              reaction={reaction ?? (resting ? null : glad)}
              resting={resting}
              onPress={onPress}
            />
          )}
        </Animated.View>
      </View>
      <View style={[StyleSheet.absoluteFill, mirrored]} pointerEvents="none" aria-hidden>
        <SvgXml xml={art.front} width={width} height={size} />
      </View>
      <Animated.View style={[StyleSheet.absoluteFill, mirrored, { opacity: shade }]} pointerEvents="none" aria-hidden testID="hevalo-peek-shadow">
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
