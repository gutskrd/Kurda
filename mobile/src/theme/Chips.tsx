import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { reachRoom } from '../a11y/a11y';
import { Pressable, ReachGroup } from './Pressable';
import { layout, radii, spacing, typography } from './tokens';
import { useTheme } from './ThemeProvider';
import { useDirection } from '../reports/direction';
import { haptic } from '../feedback/haptics';
import { pressedDim } from './motion';

/**
 * A row of filter chips: All · Unread · Groups, People · Words · Lessons.
 *
 * Not the segmented control. That one switches between two halves of a screen
 * (Lessons | Games) and its options share the width equally; these narrow a
 * list, each is as wide as its word, and the row scrolls sideways when a
 * language's words do not fit — which a segmented control can only answer by
 * cutting them off.
 *
 * The chosen chip wears the violet wash with violet words, as a switch that
 * is on does, and says it is selected to a screen reader too. It was solid
 * violet, which the app keeps for a screen's main button: a row of filters
 * read as a row of things to press.
 *
 * It is laid inside the page's gutter but scrolls out to the screen's edges,
 * so a chip that does not fit is cut by the edge of the phone — which reads
 * as "there is more this way" — rather than by an invisible line 16 points in.
 *
 * A chip is drawn 36 tall and answers a finger over 48 by the width of its
 * word plus half the gap on each side, so the row has no dead seams. A
 * scroller cuts off whatever reaches past its edge, so the row keeps `room`
 * above and below it inside the scroller, which is pulled back out by the
 * same amount: nothing moves on screen, and the chips reach as far as the
 * room. A chip tapped while the keyboard is up is chosen at once, rather
 * than the first tap only putting the keyboard away.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  labelOf,
  countOf,
  room = 6,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
  /** a number after the word, where there is one worth showing */
  countOf?: (v: T) => number | null;
  /**
   * How far above and below the row the chips reach, and the scroller is
   * grown to hold them: at most the gap to whatever is above or below,
   * less how far that reaches into the gap itself.
   */
  room?: number;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const scroller = useRef<ScrollView>(null);
  const rr = reachRoom(room);
  return (
    <ScrollView
      ref={scroller}
      // right to left, the first chip is on the right: start the row there
      onContentSizeChange={() => {
        if (mirrored) scroller.current?.scrollToEnd({ animated: false });
      }}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.row, rr.content, { flexDirection: dir.row }]}
      style={[styles.scroller, rr.scroller]}
    >
      {/* each chip reaches half the gap to the next, and up and down as far as the room the row keeps (the group's row gap is twice it) */}
      <ReachGroup gap={spacing.sm} rowGap={room * 2}>
        {options.map((opt) => {
          const active = opt === value;
          const label = labelOf(opt);
          const count = countOf?.(opt) ?? null;
          return (
            <Pressable
              key={opt}
              onPress={() => {
                if (!active) haptic('select');
                onChange(opt);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={count ? `${label}, ${count}` : label}
              // a chip's width is its word's, not known before it is drawn: `open` reaches past every edge, and the group caps it to the gap and the room
              reach="open"
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: active ? `${colors.primary}${CHOSEN_WASH}` : colors.controlTrack, opacity: pressed ? pressedDim : 1 },
              ]}
            >
              <Text style={[styles.text, { color: active ? colors.primary : colors.textPrimary }]} numberOfLines={1}>
                {label}
              </Text>
              {count ? (
                <View style={[styles.count, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.countText, { color: colors.textOnPrimary }]}>{count > 9 ? '9+' : count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ReachGroup>
    </ScrollView>
  );
}

/** How much of the violet a chosen chip is, as the last two digits of its colour: the tab bar's own wash. */
const CHOSEN_WASH = '1F';

const styles = StyleSheet.create({
  scroller: { flexGrow: 0, marginHorizontal: -layout.gutter },
  row: { gap: spacing.sm, alignItems: 'center', paddingHorizontal: layout.gutter },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radii.pill,
  },
  text: { fontSize: typography.sizes.sm, fontWeight: typography.weights.semibold },
  count: { minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: typography.ios.tabLabel, fontWeight: typography.weights.bold },
});
