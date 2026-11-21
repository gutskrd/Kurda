import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { PEEK_VIEW } from '@kurda/shared';
import SPLASH from '../../assets/splash-icon.png';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { characterLayers } from '../characters/layers';
import { HevaloPeek } from '../characters/HevaloPeek';
import { springTo, timing } from '../theme/animate';
import { GradientBackground } from '../theme/glass';
import { duration } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { spacing, typography } from '../theme/tokens';
import { LightWash } from './launch/LightWash';
import { LAUNCH, SPLASH_BACKGROUND, SPLASH_IMAGE_WIDTH, heroPlace } from './launch/splash';

/**
 * Hevalo's drawing from head to the tops of his legs, with its eye positions: what the launch lines him up with the
 * splash by.
 */
const HERO = characterLayers('hevalo', 'half');

/**
 * Where the tear he peeks through goes, so his eyes land where the splash deer's eyes were, at the scale the
 * head-to-legs drawing would have had (`heroPlace`).
 */
function peekPlace(box: number): { width: number; height: number; left: number; top: number } {
  const half = heroPlace(box, HERO.frame, HERO.eyesAt);
  // The tear is drawn in his own units, so one scale and its corner's offset from his frame place it.
  const scale = half.width / HERO.frame.w;
  return {
    width: PEEK_VIEW.w * scale,
    height: PEEK_VIEW.h * scale,
    left: half.left + (PEEK_VIEW.x - HERO.frame.x) * scale,
    top: half.top + (PEEK_VIEW.y - HERO.frame.y) * scale,
  };
}

/**
 * What you see while the app finds out who you are. It opens on exactly what the native splash showed
 * (launch/splash.ts), so nothing moves when the app takes over; then the gradient comes in, the splash deer gives way
 * to Hevalo arriving on a spring, the words rise beneath him and a soft light drifts while he waits. Under Reduce
 * Motion nothing travels: he fades in and the words appear.
 */
export function LaunchScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  // The gradient over the flat colour, the splash picture, Hevalo arriving, and the words: each 0 → 1 (the picture 1 →
  // 0).
  const ground = useRef(new Animated.Value(0)).current;
  const picture = useRef(new Animated.Value(1)).current;
  const hero = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // The Reduce Motion answer may arrive a moment in: the arrival then goes on from where it is, as a fade.
    const run = Animated.parallel([
      timing(ground, 1, duration.slow + 180, { delay: LAUNCH.groundMs }),
      timing(picture, 0, LAUNCH.pictureMs, { delay: LAUNCH.heroMs }),
      reduce ? timing(hero, 1, duration.slow, { delay: LAUNCH.heroMs }) : springTo(hero, 1, 'bouncy', LAUNCH.heroMs),
      reduce ? timing(words, 1, duration.slow, { delay: LAUNCH.wordsMs }) : springTo(words, 1, 'standard', LAUNCH.wordsMs),
    ]);
    run.start();
    return () => run.stop();
  }, [reduce, ground, picture, hero, words]);

  const place = useMemo(() => peekPlace(SPLASH_IMAGE_WIDTH), []);
  const arrival = reduce
    ? { opacity: hero }
    : {
        opacity: hero,
        transform: [
          { scale: hero.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          { translateY: hero.interpolate({ inputRange: [0, 1], outputRange: [place.height * 0.08, 0] }) },
        ],
      };
  const rising = reduce ? { opacity: words } : { opacity: words, transform: [{ translateY: words.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] };

  return (
    <View style={[styles.fill, { backgroundColor: SPLASH_BACKGROUND[colors.scheme] }]} testID="launch-first-frame">
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: ground }]} testID="launch-ground">
        <GradientBackground />
      </Animated.View>
      <LightWash />
      <View style={styles.centre}>
        {/* The splash picture's own box, centred as the splash centred it; the words hang under it. */}
        <View style={styles.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {/* Sized explicitly: an unsized picture takes the whole file's size, not the box. */}
          <Animated.Image source={SPLASH} resizeMode="contain" style={[styles.picture, { opacity: picture }]} testID="launch-picture" />
          <Animated.View style={[styles.hero, { left: place.left, top: place.top, width: place.width, height: place.height }, arrival]} testID="launch-hero">
            <HevaloPeek size={place.height} pop={false} />
          </Animated.View>
          <Animated.View style={[styles.words, { top: place.top + place.height + spacing.md }, rising]}>
            <Text style={[styles.brand, { color: colors.primary }]}>Hevalo</Text>
            <Text style={[styles.slogan, { color: colors.textSecondary }]}>Jiyan bi kurdî xweştire</Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

/**
 * The app arriving, once it knows where it is going: whatever follows the launch (intro, sign-in or tabs) fades and
 * scales up through it on the standard spring, rather than cutting in between two frames.
 *
 * Behind it while it is still faint is the launch's own colour, not the window's, which would flash white or black for
 * a frame.
 */
export function Entrance({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  const enter = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      enter.setValue(1);
      return;
    }
    const settle = springTo(enter, 1, 'standard');
    settle.start();
    return () => settle.stop();
  }, [enter, reduceMotion]);

  return (
    <View style={[styles.fill, { backgroundColor: SPLASH_BACKGROUND[colors.scheme] }]} testID="entrance-ground">
      <Animated.View
        style={[
          styles.fill,
          {
            opacity: enter,
            transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) }],
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** How far either side of the picture's box the words may run: the name is short, the line under it is not. */
const WORDS_REACH = 120;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  box: { width: SPLASH_IMAGE_WIDTH, height: SPLASH_IMAGE_WIDTH },
  picture: { position: 'absolute', top: 0, left: 0, width: SPLASH_IMAGE_WIDTH, height: SPLASH_IMAGE_WIDTH },
  hero: { position: 'absolute' },
  words: { position: 'absolute', left: -WORDS_REACH, right: -WORDS_REACH, alignItems: 'center', gap: spacing.xs },
  brand: { ...display(typography.sizes.title), textAlign: 'center' },
  slogan: { fontSize: typography.sizes.text, textAlign: 'center', fontStyle: 'italic' },
});
