import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { radii, spacing } from '../theme/tokens';

/** The face at the foot of a run, and so the room kept beside every bubble of theirs. */
export const RUN_FACE = 28;

/** The tail's own box: a corner drawn out to a point, half of it under the bubble. */
const TAIL = { width: 14, height: 15, reach: 7 } as const;
/** The tail's outline, from where it joins the bubble round to its point and back along the foot, drawn for a speaker on the left. */
const TAIL_PATH = 'M14 0C13.4 8.6 9 13.4 0 15H14Z';

/**
 * A speech bubble in one of the conversation's two voices. Consecutive messages from one person form one block:
 * the corners on the speaker's side tighten between them, and the last draws a tail toward the speaker. Your own
 * are gold on your side, theirs a quiet neutral on theirs. `side` is the speaker's position, not their identity:
 * in a right-to-left thread your words are on the left, and the tail goes with them.
 */
export function Bubble({
  mine,
  side,
  first,
  last,
  children,
  style,
}: {
  mine: boolean;
  /** The edge of the screen the speaker is on. */
  side: 'left' | 'right';
  /** The first of its run. */
  first: boolean;
  /** The last of its run: it wears the tail. */
  last: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const fill = mine ? colors.bubbleMine : colors.bubbleTheirs;
  // The two corners by the speaker: tight where another of their messages is above or below, and at the tail.
  const top = first ? radii.lg : radii.xs;
  const bottom = radii.xs;
  const corners: ViewStyle = side === 'left' ? { borderTopLeftRadius: top, borderBottomLeftRadius: bottom } : { borderTopRightRadius: top, borderBottomRightRadius: bottom };
  return (
    <View style={[styles.bubble, corners, { backgroundColor: fill }, style]}>
      {children}
      {last ? (
        <View style={[styles.tail, side === 'left' ? styles.tailLeft : styles.tailRight]} pointerEvents="none" testID="bubble-tail">
          <Svg width={TAIL.width} height={TAIL.height} viewBox={`0 0 ${TAIL.width} ${TAIL.height}`}>
            <Path d={TAIL_PATH} fill={fill} />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

/** What the words in a bubble are written in. */
export function useBubbleInk(mine: boolean): string {
  const { colors } = useTheme();
  return mine ? colors.bubbleMineInk : colors.bubbleTheirsInk;
}

const styles = StyleSheet.create({
  bubble: { borderRadius: radii.lg, paddingVertical: 9, paddingHorizontal: spacing.md - 2 },
  tail: { position: 'absolute', bottom: 0, width: TAIL.width, height: TAIL.height },
  tailLeft: { left: -TAIL.reach },
  // The same shape, turned to point the other way.
  tailRight: { right: -TAIL.reach, transform: [{ scaleX: -1 }] },
});
