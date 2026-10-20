import { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { layout, radii, spacing, typography } from './tokens';
import { useTheme } from './ThemeProvider';
import { useDirection } from '../reports/direction';
import { haptic } from '../feedback/haptics';

/**
 * A row of filter chips: All · Unread · Groups, People · Words · Lessons.
 *
 * Not the segmented control. That one switches between two halves of a screen
 * (Lessons | Games) and its options share the width equally; these narrow a
 * list, each is as wide as its word, and the row scrolls sideways when a
 * language's words do not fit — which a segmented control can only answer by
 * cutting them off.
 *
 * The chosen chip is the one solid thing in the row, in the primary colour,
 * and says it is selected to a screen reader too.
 *
 * It is laid inside the page's gutter but scrolls out to the screen's edges,
 * so a chip that does not fit is cut by the edge of the phone — which reads
 * as "there is more this way" — rather than by an invisible line 16 points in.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  labelOf,
  countOf,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labelOf: (v: T) => string;
  /** a number after the word, where there is one worth showing */
  countOf?: (v: T) => number | null;
}): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  const mirrored = dir.row === 'row-reverse';
  const scroller = useRef<ScrollView>(null);
  return (
    <ScrollView
      ref={scroller}
      // right to left, the first chip is on the right: start the row there
      onContentSizeChange={() => {
        if (mirrored) scroller.current?.scrollToEnd({ animated: false });
      }}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { flexDirection: dir.row }]}
      style={styles.scroller}
    >
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
            hitSlop={{ top: 4, bottom: 4 }}
            style={({ pressed }) => [
              styles.chip,
              { backgroundColor: active ? colors.primary : colors.controlTrack, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.text, { color: active ? colors.textOnPrimary : colors.textPrimary }]} numberOfLines={1}>
              {label}
            </Text>
            {count ? (
              <View style={[styles.count, { backgroundColor: active ? colors.textOnPrimary : colors.goldText }]}>
                <Text style={[styles.countText, { color: active ? colors.primary : colors.textOnPrimary }]}>{count > 9 ? '9+' : count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

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
