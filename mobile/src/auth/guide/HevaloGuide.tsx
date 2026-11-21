import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CharacterPoint } from '@kurda/shared';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { HevaloPeek } from '../../characters/HevaloPeek';
import type { CharacterReaction } from '../../characters/SpeakingCharacter';
import { useDirection } from '../../reports/direction';
import { timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { useScreenFocus } from './focus';
import { useSpokenLine } from './speech';

/** How tall Hevalo and the tear he looks through stand beside his bubble, from his antlers to the tear's foot. */
const GUIDE_HEIGHT = 96;

/**
 * Where Hevalo looks while somebody answers: down and a little across, at the field under the question. In the
 * drawing's own terms, so it holds when he is mirrored for a right-to-left language.
 */
export const GAZE_AT_FIELD: CharacterPoint = { x: 0.4, y: 0.55 };

/** The bubble's tail: the side it points to. */
const TAIL = 12;

/**
 * Hevalo at the top of a step, poking through a tear in the page (characters/HevaloPeek) beside a speech bubble. His
 * mouth moves with the line (guide/speech.ts), he looks at the field (`gaze`), reacts to refused and right answers
 * (`reaction`), and greets a tap.
 *
 * He is decorative: the bubble's words carry the meaning, and a screen reader skips him. Under Reduce Motion the words
 * simply change and he stays still; behind another screen he says nothing.
 */
export function HevaloGuide({
  says,
  reaction = null,
  gaze = null,
  style,
}: {
  says: string;
  reaction?: CharacterReaction | null;
  gaze?: CharacterPoint | null;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const dir = useDirection();
  const reduce = useReducedMotion();
  const focused = useScreenFocus();
  const speech = useSpokenLine(says, !reduce && focused);
  return (
    <View style={[styles.row, { flexDirection: dir.row }, style]} testID="hevalo-guide">
      <View aria-hidden testID="hevalo-guide-figure">
        <HevaloPeek
          size={GUIDE_HEIGHT}
          speech={speech}
          text={says}
          flip={dir.rtl}
          gaze={gaze}
          reaction={reaction}
          onPress={greeted}
        />
      </View>
      <SpeechBubble text={says} tail="start" style={styles.bubble} />
    </View>
  );
}

/** A tap on Hevalo is answered by his greeting alone. */
const greeted = (): void => undefined;

/**
 * The words a character says, in a bubble whose tail points to the speaker: its start side, top or bottom. New words
 * fade in (simply appear under Reduce Motion) and are read aloud as they change.
 */
export function SpeechBubble({
  text,
  tail,
  tone = 'glass',
  style,
}: {
  text: string;
  tail: 'start' | 'top' | 'bottom';
  /** Glass on the page's gradient; the control track's tint on a card, which is glass already. */
  tone?: 'glass' | 'inset';
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const face = tone === 'inset' ? colors.controlTrack : colors.glassFill;
  const dir = useDirection();
  const reduce = useReducedMotion();
  const fade = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    // The first words are there as the bubble arrives; later ones fade in.
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    const run = timing(fade, 1, duration.base);
    run.start();
    return () => run.stop();
  }, [text, reduce, fade]);

  const mirrored = dir.row === 'row-reverse';
  // The tail is a border triangle wholly outside the face: on a translucent face an overlap would show through.
  const point =
    tail === 'top'
      ? [styles.tailTop, { borderBottomColor: face }]
      : tail === 'bottom'
        ? [styles.tailBottom, { borderTopColor: face }]
        : mirrored
          ? [styles.tailEnd, { borderLeftColor: face }]
          : [styles.tailStart, { borderRightColor: face }];
  return (
    <View style={[styles.bubbleWrap, style]} testID="speech-bubble">
      <View style={[styles.tail, point]} />
      <View style={[styles.bubbleFace, { backgroundColor: face, shadowColor: colors.softShadow }]}>
        <Animated.Text style={[styles.words, dir.text, { color: colors.textPrimary, opacity: fade }]} accessibilityLiveRegion="polite">
          {text}
        </Animated.Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: spacing.sm },
  bubble: { flex: 1 },
  bubbleWrap: { position: 'relative' },
  bubbleFace: {
    borderRadius: radii.lg,
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  words: { fontSize: typography.sizes.text, lineHeight: 23 },
  // A point drawn with borders: the two beside it clear, the one toward the face in its colour.
  tail: { position: 'absolute', width: 0, height: 0, borderStyle: 'solid', borderColor: 'transparent' },
  tailStart: { left: -TAIL + 1, top: '50%', marginTop: -TAIL * 0.7, borderTopWidth: TAIL * 0.7, borderBottomWidth: TAIL * 0.7, borderRightWidth: TAIL },
  tailEnd: { right: -TAIL + 1, top: '50%', marginTop: -TAIL * 0.7, borderTopWidth: TAIL * 0.7, borderBottomWidth: TAIL * 0.7, borderLeftWidth: TAIL },
  tailTop: { top: -TAIL + 1, left: '50%', marginLeft: -TAIL * 0.7, borderLeftWidth: TAIL * 0.7, borderRightWidth: TAIL * 0.7, borderBottomWidth: TAIL },
  tailBottom: { bottom: -TAIL + 1, left: '50%', marginLeft: -TAIL * 0.7, borderLeftWidth: TAIL * 0.7, borderRightWidth: TAIL * 0.7, borderTopWidth: TAIL },
});
