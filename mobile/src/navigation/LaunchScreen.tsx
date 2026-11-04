import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import SPLASH from '../../assets/splash-icon.png';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { characterLayers } from '../characters/layers';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';
import { springTo, timing } from '../theme/animate';
import { GradientBackground } from '../theme/glass';
import { duration } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { display } from '../theme/fonts';
import { spacing, typography } from '../theme/tokens';
import { LightWash } from './launch/LightWash';
import { LAUNCH, SPLASH_BACKGROUND, SPLASH_IMAGE_WIDTH, heroPlace } from './launch/splash';

/** Hevalo's drawing head to the tops of his legs, and where its eyes are in it: how the launch draws him. */
const HERO = characterLayers('hevalo', 'half');

/**
 * What you see while the app finds out who you are.
 *
 * It opens on exactly what the native splash showed — the flat colour, with
 * the deer from the icon in the middle of the window at the size the splash
 * drew him (launch/splash.ts) — so that the moment the app takes over from
 * the system, nothing on the screen moves. Then it comes alive: the page's
 * gradient comes in over the flat colour, the picture's deer gives way to
 * Hevalo himself, arriving with a spring where the picture was, blinking as
 * he lands, and the name and the line under it rise beneath him. A soft
 * light drifts across the page while he waits, breathing and glancing about.
 *
 * It used to be the name breathing on the gradient, and before that a
 * spinner: both said "wait", and this says "here he is". Restoring a session
 * takes a few hundred milliseconds; the point is that those milliseconds are
 * the app, and that the first thing anybody sees of it is Hevalo.
 *
 * For somebody who has asked for less motion nothing travels: the picture
 * fades into him and the words simply appear, and the light stays still.
 */
export function LaunchScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  // the gradient over the flat colour, the picture's deer, Hevalo arriving, and the words: each 0 → 1 (the picture 1 → 0)
  const ground = useRef(new Animated.Value(0)).current;
  const picture = useRef(new Animated.Value(1)).current;
  const hero = useRef(new Animated.Value(0)).current;
  const words = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // the answer about motion may arrive a moment in: the arrival then goes on from where it is, as a fade
    const run = Animated.parallel([
      timing(ground, 1, duration.slow + 180, { delay: LAUNCH.groundMs }),
      timing(picture, 0, LAUNCH.pictureMs, { delay: LAUNCH.heroMs }),
      reduce ? timing(hero, 1, duration.slow, { delay: LAUNCH.heroMs }) : springTo(hero, 1, 'bouncy', LAUNCH.heroMs),
      reduce ? timing(words, 1, duration.slow, { delay: LAUNCH.wordsMs }) : springTo(words, 1, 'standard', LAUNCH.wordsMs),
    ]);
    run.start();
    return () => run.stop();
  }, [reduce, ground, picture, hero, words]);

  const place = useMemo(() => heroPlace(SPLASH_IMAGE_WIDTH, HERO.frame, HERO.eyesAt), []);
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
        {/* the splash picture's own box, centred in the window as the splash centred it; the words hang under it */}
        <View style={styles.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {/* sized in so many words: a picture given no size takes its own, which is the whole file, not the box */}
          <Animated.Image source={SPLASH} resizeMode="contain" style={[styles.picture, { opacity: picture }]} testID="launch-picture" />
          <Animated.View style={[styles.hero, { left: place.left, top: place.top, width: place.width, height: place.height }, arrival]} testID="launch-hero">
            <SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="half" height={place.height} />
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
 * The app arriving, once it knows where it is going.
 *
 * Every one of the three things that can follow the launch screen — the intro,
 * the sign-in stack, the tabs — used to replace it between two frames. A cut
 * from a still wordmark to a full screen reads as a glitch, which is the same
 * reason the tabs cross-fade rather than swap.
 *
 * So whatever comes next comes up through it, on the standard spring: a fade,
 * and a scale that starts just inside its final size, so the screen settles
 * into place rather than appearing at it. It was a 260 ms ease-out, which
 * stopped where it was told; the spring slows into its place the way a
 * placed thing does, with no bounce, and is the same spring the rest of the
 * app arrives on.
 *
 * Behind the screen while it is still faint is the launch's own colour, not
 * whatever the window is painted underneath the app — the system's white or
 * black, which showed through for a frame as the launch screen went and the
 * next one had not yet come: a flash, in the one place nothing should flash.
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
  brand: { ...display(typography.sizes.xxl), textAlign: 'center' },
  slogan: { fontSize: typography.sizes.sm, textAlign: 'center', fontStyle: 'italic' },
});
