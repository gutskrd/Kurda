import { StyleSheet, Text, View } from 'react-native';
import { fontScaleCap, radii, typography } from '../../theme/tokens';
import { Icon } from '../../theme/Icon';
import { DrawnCheck } from '../../theme/MotionParts';
import type { TileState } from '../../theme/Tile';
import { useValley } from '../ValleyScope';

/**
 * An option's round chip: its number while waiting, red once chosen, and the verdict's mark once graded (a check
 * drawing in on the right one, a cross on a wrong choice). The number is not read out; the option's own label is,
 * with its verdict. Picture cards use the same chip.
 */
export function OptionChip({ state, selected, n }: { state: TileState; selected: boolean; n: string }): React.JSX.Element {
  const valley = useValley();
  const fill = state === 'right' ? valley.green : state === 'wrong' ? valley.wrong : state === 'picked' ? valley.red : valley.chip;
  const ink = state === 'right' ? valley.onGreen : state === 'wrong' ? valley.onWrong : state === 'picked' ? valley.onRed : valley.chipInk;
  return (
    <View style={[styles.chip, { backgroundColor: fill }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" aria-hidden>
      {state === 'right' ? (
        selected ? (
          <DrawnCheck size={CHIP_MARK} color={ink} />
        ) : (
          <Icon name="check" size={CHIP_MARK} color={ink} />
        )
      ) : state === 'wrong' ? (
        <Icon name="close" size={CHIP_MARK} color={ink} />
      ) : (
        <Text style={[styles.chipText, { color: ink }]} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
          {n}
        </Text>
      )}
    </View>
  );
}

/** The chip's size, and the mark drawn in it. */
const CHIP = 26;
const CHIP_MARK = 15;

const styles = StyleSheet.create({
  chip: { width: CHIP, height: CHIP, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: typography.weights.bold },
});
