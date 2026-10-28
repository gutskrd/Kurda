import { StyleSheet, View } from 'react-native';
import { PATH_GEOMETRY, PATH_MASCOT } from '@kurda/shared';
import { SpeakingCharacter } from '../characters/SpeakingCharacter';

/**
 * Hevalo beside the current stop on the path (`mascotSpot` places him): on
 * the side away from the stop's lean, level with it, so he never stands on
 * the line. He arrives as the path does (the character's own `arrive`), greets
 * a tap — which also opens the stop he stands by — and cheers when coming
 * back from a lesson finished a skill or opened one.
 *
 * Whole, rather than a head in a tile: he is standing on the page beside the
 * stop, his feet level with its foot, not a picture of him. He is said by the
 * stop beside him already, so a screen reader passes him by; and on a screen
 * too narrow to leave him room beside the path, he stays away.
 */
export function PathMascot({
  x,
  stopY,
  flip,
  cheer,
  onPress,
}: {
  /** where his middle is across the unit's path, and the middle of the stop he stands by, in points */
  x: number;
  stopY: number;
  /** turned to face the stop on his start side */
  flip: boolean;
  /** what the path just did is worth a cheer */
  cheer: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <View style={[styles.spot, { left: x - PATH_MASCOT.size / 2, top: stopY + PATH_GEOMETRY.node / 2 - FULL + FEET }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="lp-mascot">
      <SpeakingCharacter speaker="hevalo" player={null} playing={false} crop="full" height={FULL} flip={flip} reaction={cheer ? 'cheer' : null} onPress={onPress} />
    </View>
  );
}

/** Drawn whole, legs and all, at the scale of the lesson's head-to-waist figure (`PATH_MASCOT.size` to the tops of his legs). */
const FULL = 132;
/** How far below the stop's round his feet stand: on its lip, where the stop itself meets the page. */
const FEET = 12;

/** Narrower than this, the path's sway leaves no room beside it for him. */
export const MASCOT_MIN_WIDTH = 340;

const styles = StyleSheet.create({
  spot: { position: 'absolute', width: PATH_MASCOT.size, alignItems: 'center' },
});
