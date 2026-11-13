import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useMotionAlive } from '../a11y/useMotionAlive';
import { useI18n } from '../i18n/I18nContext';
import { InitialsAvatar } from '../profile/InitialsAvatar';
import { useDirection } from '../reports/direction';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing, typography } from '../theme/tokens';
import { Bubble, RUN_FACE } from './Bubble';
import { typingLabel } from './typing';

/** One turn of the dots: they drop in one after another, rest, and go. */
const TURN_MS = 1900;
/** How long after the dot before it each one drops. */
const STAGGER_MS = 200;
/** The bubble's nod over one turn: a tilt as the first dot lands, back past level, and still before the dots go. */
const NOD = { inputRange: [0, 0.16, 0.36, 0.56, 0.7, 1], outputRange: ['0deg', '-1.8deg', '1.3deg', '-0.6deg', '0deg', '0deg'] };

/**
 * Somebody is writing: a bubble of their own, where their message is about
 * to land, with three dots dropping into it one after another.
 *
 * It was a grey line of italics over the composer, "rojda is typing…", which
 * is a sentence to read about a thing that can simply be seen. A bubble in
 * the thread is where the eye already is, and the dots say the rest. The
 * sentence is still there for a screen reader, announced when it changes, and
 * printed over the bubble in a group, where it matters who.
 *
 * The dots are a loop, so they run only while this screen is the one in
 * front and never for somebody who has asked for less motion: then the three
 * dots simply stand in the bubble.
 */
export function TypingBubble({
  names,
  face,
  named = false,
}: {
  /** who is writing; nothing is drawn for nobody */
  names: readonly string[];
  /** whose face stands beside the bubble: the one friend of a chat between two */
  face?: { id: string; name: string; photoUrl?: string | null };
  /** print who over the bubble: a group, where there is more than one it could be */
  named?: boolean;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const alive = useMotionAlive();
  const turn = useRef(new Animated.Value(0)).current;
  const writing = names.length > 0;

  useEffect(() => {
    if (!alive || !writing) {
      turn.setValue(0);
      return;
    }
    // never an "interaction": a loop that held one would keep the thread's rows waiting to draw for as long as it ran
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: TURN_MS, easing: Easing.linear, useNativeDriver: true, isInteraction: false }));
    loop.start();
    return () => {
      loop.stop();
      turn.setValue(0);
    };
  }, [alive, writing, turn]);

  if (!writing) return null;
  const mirrored = dir.row === 'row-reverse';
  const label = typingLabel(names, t);
  return (
    <View style={[styles.row, { flexDirection: dir.row }, mirrored ? styles.rowRight : styles.rowLeft]} testID="typing-bubble">
      {face ? (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <InitialsAvatar name={face.name} id={face.id} size={RUN_FACE} photoUrl={face.photoUrl} />
        </View>
      ) : (
        <View style={styles.noFace} />
      )}
      <View style={mirrored ? styles.alignRight : styles.alignLeft}>
        {named ? (
          <Text style={[styles.who, dir.text, { color: colors.textSecondary }]} accessibilityLiveRegion="polite">
            {label}
          </Text>
        ) : null}
        {/* the bubble nods as each dot lands in it, turning about the corner its tail is at */}
        <Animated.View
          accessible={!named}
          accessibilityLabel={named ? undefined : label}
          accessibilityLiveRegion={named ? undefined : 'polite'}
          style={alive ? { transformOrigin: mirrored ? '80% 100%' : '20% 100%', transform: [{ rotate: turn.interpolate(NOD) }] } : null}
        >
          <Bubble mine={false} side={mirrored ? 'right' : 'left'} first last style={styles.bubble}>
            <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {[0, 1, 2].map((i) => (
                <Dot key={i} turn={turn} delay={(i * STAGGER_MS) / TURN_MS} still={!alive} color={colors.bubbleTheirsInk} />
              ))}
            </View>
          </Bubble>
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * One dot of the three. It falls into place from above, lands a little
 * squashed, settles, waits for the others and shrinks away: the same turn
 * for each, begun `delay` of a turn later.
 */
function Dot({ turn, delay, still, color }: { turn: Animated.Value; delay: number; still: boolean; color: string }): React.JSX.Element {
  if (still) return <View style={[styles.dot, styles.dotStill, { backgroundColor: color }]} />;
  // the points of the turn this dot moves at, each `delay` later than the first dot's
  const at = (share: number): number => Math.min(1, delay + share * (1 - 2 * (STAGGER_MS / TURN_MS)));
  const inputRange = [0, at(0), at(0.16), at(0.26), at(0.36), at(0.74), at(0.9), 1];
  // a range has to climb: the first dot has no wait before it, so its first two points are the same one
  const range = inputRange.map((v, i) => v + i * 1e-4);
  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color },
        {
          opacity: turn.interpolate({ inputRange: range, outputRange: [0, 0, 0.7, 0.6, 0.55, 0.55, 0, 0] }),
          transform: [
            { translateY: turn.interpolate({ inputRange: range, outputRange: [-10, -10, 2, -3, 0, 0, 0, 0] }) },
            { scale: turn.interpolate({ inputRange: range, outputRange: [0.6, 0.6, 1.08, 1, 1, 1, 0.3, 0.3] }) },
          ],
        },
      ]}
    />
  );
}

const DOT = 7;

const styles = StyleSheet.create({
  row: { alignItems: 'flex-end', gap: spacing.sm, marginTop: 10 },
  rowLeft: { alignSelf: 'flex-start' },
  rowRight: { alignSelf: 'flex-end' },
  alignLeft: { alignItems: 'flex-start' },
  alignRight: { alignItems: 'flex-end' },
  noFace: { width: RUN_FACE },
  who: { fontSize: typography.sizes.xs, marginBottom: 2, marginHorizontal: spacing.xs },
  bubble: { paddingVertical: 14, paddingHorizontal: spacing.md },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: DOT, height: DOT, borderRadius: radii.pill },
  dotStill: { opacity: 0.55 },
});
