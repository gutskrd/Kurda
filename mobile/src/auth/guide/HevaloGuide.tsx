import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { CharacterPoint } from '@kurda/shared';
import { useReducedMotion } from '../../a11y/useReducedMotion';
import { SpeakingCharacter, type CharacterReaction } from '../../characters/SpeakingCharacter';
import { useDirection } from '../../reports/direction';
import { timing } from '../../theme/animate';
import { duration } from '../../theme/motion';
import { useTheme } from '../../theme/ThemeProvider';
import { radii, spacing, typography } from '../../theme/tokens';
import { useScreenFocus } from './focus';
import { useSpokenLine } from './speech';

/** How tall Hevalo stands beside his bubble, head to waist. */
export const GUIDE_HEIGHT = 96;

/**
 * Where Hevalo looks while somebody answers: down and a little across, at the
 * field under the question. In the drawing's own terms, so it holds when he
 * is turned round for a language read from the right (he stands on the other
 * side then, and the field is still below and across from him).
 */
export const GAZE_AT_FIELD: CharacterPoint = { x: 0.4, y: 0.55 };

/** The bubble's tail: the side it points to. */
const TAIL = 12;

/**
 * Hevalo at the top of a step, saying its line.
 *
 * He stands head to waist beside a speech bubble with the words in it, and
 * says them: his mouth moves with the line (guide/speech.ts), he breathes,
 * blinks, and looks where he is told (`gaze`, at the field), tilts his head
 * at a refused answer and cheers at a right one (`reaction`), and greets a
 * tap. The bubble's words fade in whenever they change.
 *
 * He is decorative: the words in the bubble carry the meaning, and a screen
 * reader hears them and passes him by. Under Reduce Motion the words simply
 * change and he stays still; when the screen is behind another he says
 * nothing until it is in front again.
 */
export function HevaloGuide({
  says,
  reaction = null,
  gaze = null,
  resting = false,
  onPress,
  style,
}: {
  says: string;
  reaction?: CharacterReaction | null;
  gaze?: CharacterPoint | null;
  resting?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const dir = useDirection();
  const reduce = useReducedMotion();
  const focused = useScreenFocus();
  const speech = useSpokenLine(says, !reduce && focused && !resting);
  return (
    <View style={[styles.row, { flexDirection: dir.row }, style]} testID="hevalo-guide">
      <View aria-hidden testID="hevalo-guide-figure">
        <SpeakingCharacter
          speaker="hevalo"
          player={speech.player}
          playing={speech.playing}
          source={speech.source}
          text={says}
          crop="half"
          height={GUIDE_HEIGHT}
          flip={dir.rtl}
          gaze={gaze}
          reaction={reaction}
          resting={resting}
          onPress={onPress ?? greeted}
        />
      </View>
      <SpeechBubble text={says} tail="start" style={styles.bubble} />
    </View>
  );
}

/** A tap on Hevalo is answered by his greeting alone, where there is nothing to say again. */
const greeted = (): void => undefined;

/**
 * The words a character says, in a bubble with a tail toward the one saying
 * them: on its start side for a character standing beside it, on top for one
 * above it, or underneath for one below. New words fade in; under Reduce
 * Motion they are simply there. The words are read aloud as they change,
 * since they are what the character is saying to the person.
 */
export function SpeechBubble({
  text,
  tail,
  tone = 'glass',
  style,
  testID = 'speech-bubble',
}: {
  text: string;
  tail: 'start' | 'top' | 'bottom';
  /** glass on the page's gradient; the control track's tint on a card, which is glass already */
  tone?: 'glass' | 'inset';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const face = tone === 'inset' ? colors.controlTrack : colors.glassFill;
  const dir = useDirection();
  const reduce = useReducedMotion();
  const fade = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    // the first words are there as the bubble arrives; later ones come in
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
  // the tail is a triangle drawn with borders, wholly outside the face: on a translucent face an overlap would show through
  const point =
    tail === 'top'
      ? [styles.tailTop, { borderBottomColor: face }]
      : tail === 'bottom'
        ? [styles.tailBottom, { borderTopColor: face }]
        : mirrored
          ? [styles.tailEnd, { borderLeftColor: face }]
          : [styles.tailStart, { borderRightColor: face }];
  return (
    <View style={[styles.bubbleWrap, style]} testID={testID}>
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
  words: { fontSize: typography.sizes.md, lineHeight: 23 },
  // a point drawn with borders: the two beside it clear, the one toward the face in its colour
  tail: { position: 'absolute', width: 0, height: 0, borderStyle: 'solid', borderColor: 'transparent' },
  tailStart: { left: -TAIL + 1, top: '50%', marginTop: -TAIL * 0.7, borderTopWidth: TAIL * 0.7, borderBottomWidth: TAIL * 0.7, borderRightWidth: TAIL },
  tailEnd: { right: -TAIL + 1, top: '50%', marginTop: -TAIL * 0.7, borderTopWidth: TAIL * 0.7, borderBottomWidth: TAIL * 0.7, borderLeftWidth: TAIL },
  tailTop: { top: -TAIL + 1, left: '50%', marginLeft: -TAIL * 0.7, borderLeftWidth: TAIL * 0.7, borderRightWidth: TAIL * 0.7, borderBottomWidth: TAIL },
  tailBottom: { bottom: -TAIL + 1, left: '50%', marginLeft: -TAIL * 0.7, borderLeftWidth: TAIL * 0.7, borderRightWidth: TAIL * 0.7, borderTopWidth: TAIL },
});
