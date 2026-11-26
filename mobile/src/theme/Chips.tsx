import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { reachRoom } from '../a11y/a11y';
import { Pressable, ReachGroup } from './Pressable';
import { layout, radii, spacing, typography } from './tokens';
import { useTheme } from './ThemeProvider';
import { useDirection } from '../reports/direction';
import { haptic } from '../feedback/haptics';
import { pressedDim } from './motion';
import { Skeleton } from './Skeleton';

/**
 * A row of filter chips (All · Unread · Groups). Unlike the segmented control, which splits a screen into equal
 * halves, chips narrow a list, each as wide as its word, and the row scrolls sideways when words do not fit. The
 * chosen chip is a tint of the accent with its word and edge in the accent, as on the website, and is announced as selected.
 *
 * The row sits in the page's gutter but scrolls out to the screen's edges, so a clipped chip reads as "more this
 * way". Chips are drawn 36 tall and answer over 48 across their word plus half the gap each side, so there are no
 * dead seams; since a scroller clips any reach past its edge, the row keeps `room` above and below inside it, offset
 * by an equal negative margin. A chip tapped with the keyboard up is chosen at once.
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
  /** A number after the word, where one is worth showing. */
  countOf?: (v: T) => number | null;
  /** How far above and below the row the chips reach, which the scroller grows to hold: at most the gap to the neighbours, less their own reach into it. */
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
      // Right to left, the first chip is on the right, so start the row there: a short row is as wide as the screen
      // and starts at its right edge, a long one is scrolled to its start.
      onContentSizeChange={() => {
        if (mirrored) scroller.current?.scrollToEnd({ animated: false });
      }}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.row, rr.content, { flexDirection: dir.row }, mirrored ? styles.rowMirrored : null]}
      style={[styles.scroller, rr.scroller]}
    >
      {/* Each chip reaches half the gap to the next, and vertically as far as the row's room (the group's row gap is twice it). */}
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
              // A chip's width is unknown before layout, so `open` reaches past every edge and the group caps it to the gap and room.
              reach="open"
              style={({ pressed }) => [
                styles.chip,
                { backgroundColor: active ? colors.chosenFill : colors.controlTrack, borderColor: active ? colors.chosenEdge : 'transparent', opacity: pressed ? pressedDim : 1 },
              ]}
            >
              <Text style={[styles.text, { color: active ? colors.chosenInk : colors.textPrimary }]} numberOfLines={1}>
                {label}
              </Text>
              {/* The count turns over on the chosen chip, so it stays a mark of its own. */}
              {count ? (
                <View style={[styles.count, { backgroundColor: active ? colors.chosenInk : colors.primary }]}>
                  <Text style={[styles.countText, { color: active ? colors.textOnAccent : colors.textOnPrimary }]}>{count > 9 ? '9+' : count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ReachGroup>
    </ScrollView>
  );
}

/** The chips while what they filter loads: pills of their height, in the row's own place. */
export function ChipsSkeleton(): React.JSX.Element {
  const dir = useDirection();
  return (
    <View style={styles.scroller}>
      <View style={[styles.row, { flexDirection: dir.row }]}>
        {[56, 72, 88, 64].map((w, i) => (
          <Skeleton key={i} width={w} height={CHIP} radius={radii.pill} />
        ))}
      </View>
    </View>
  );
}

/** A chip's height, which its placeholder shares. */
const CHIP = 36;

const styles = StyleSheet.create({
  scroller: { flexGrow: 0, marginHorizontal: -layout.gutter },
  row: { gap: spacing.sm, alignItems: 'center', paddingHorizontal: layout.gutter },
  rowMirrored: { flexGrow: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: CHIP,
    paddingHorizontal: spacing.md - 2,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  text: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  count: { minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: typography.sizes.text, fontWeight: typography.weights.bold },
});
