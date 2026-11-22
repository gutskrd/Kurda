import { createContext, useContext, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Pressable, ReachGroup } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon, type IconName } from '../theme/Icon';
import { useRing } from '../theme/animate';
import { PressableScale } from '../theme/MotionParts';
import { usePressOrigin } from '../theme/origin';
import { useTheme } from '../theme/ThemeProvider';
import { radii } from '../theme/tokens';
import { useDirection } from '../reports/direction';
import { GlassFill, useGlassShape } from '../theme/LiquidGlass';

/** The glyph in a header control: a little under the tab bar's, since it sits in a shape of its own. */
const GLYPH = 22;

/**
 * A button's share of a pill: a little wider than a fingertip, so the pill's ends belong to its buttons rather than to
 * padding that takes no taps.
 */
const PILL_BUTTON = 46;

/** How far a pill button's centre sits from where a lone button's does, so the dot stays over the glyph. */
const PILL_NUDGE = (PILL_BUTTON - MIN_TOUCH_TARGET) / 2;

/** Whether a header button is inside a pill of them: the pill is the shape then, and the button draws none of its own. */
const InPill = createContext(false);

/**
 * An icon button at the top of a page (the "+" on Home, the bell, the profile's menu): a 44pt disc of glass
 * with a 22pt glyph. Buttons that belong together stand in one `ActionPill` and draw no disc of their own.
 *
 * `dot` marks something new without a number; `label` must say it too, since a screen reader cannot see the dot. `ring`
 * is a count that swings the glyph once each time it goes up, as a rung bell does.
 *
 * It reaches a fingertip past its edge (`reach="open"`); in a pill, neighbours meet exactly at the pill's middle.
 */
export function HeaderButton({
  icon,
  label,
  onPress,
  dot = false,
  ring = 0,
  testID,
}: {
  icon: IconName;
  /** What a screen reader says, including whatever the dot means. */
  label: string;
  onPress: () => void;
  dot?: boolean;
  ring?: number;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const grouped = useContext(InPill);
  const swing = useRing(ring);
  // A page this opens grows out of the button, inside a pill too.
  const origin = usePressOrigin();
  const glass = useGlassShape('control');
  const marks = (
    <>
      {/* Swung from its top, where a bell hangs. */}
      <Animated.View style={{ transformOrigin: 'top center', transform: [{ rotate: swing.rotate }] }}>
        <Icon name={icon} size={GLYPH} color={colors.textPrimary} />
      </Animated.View>
      {dot ? (
        <View
          style={[styles.dot, grouped && styles.dotInPill, { backgroundColor: colors.primary, borderColor: colors.barFill }]}
          pointerEvents="none"
          testID={testID ? `${testID}-dot` : undefined}
        />
      ) : null}
    </>
  );
  if (grouped) {
    return (
      <Pressable
        ref={origin.ref}
        onPress={onPress}
        onPressIn={origin.note}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID={testID}
        // Above and below as far as a lone button; sideways the pill's group stops it at its neighbour and the pill's ends.
        reach="open"
        style={({ pressed }) => [styles.button, styles.inPill, pressed && { backgroundColor: colors.controlTrack }]}
      >
        {marks}
      </Pressable>
    );
  }
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      reach="open"
      style={[styles.button, ...glass]}
    >
      <GlassFill interactive />
      {marks}
    </PressableScale>
  );
}

/**
 * Header buttons that belong together, in one rounded shape: search and the bell, or a group's people and its menu. One
 * shape reads as one thing in the corner. The buttons touch, so their group gives neither any sideways reach.
 */
export function ActionPill({ children }: { children: ReactNode }): React.JSX.Element {
  const dir = useDirection();
  const glass = useGlassShape('control');
  return (
    <InPill.Provider value>
      <View style={[styles.pill, ...glass, { flexDirection: dir.row }]}>
        <GlassFill />
        <ReachGroup gap={0}>{children}</ReachGroup>
      </View>
    </InPill.Provider>
  );
}

const styles = StyleSheet.create({
  button: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The room at each end is in the wider buttons, where a tap on it counts.
  inPill: { width: PILL_BUTTON },
  pill: { height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center' },
  // Over the glyph's top-end corner, ringed in the shape's colour so it reads as sitting on the icon.
  dot: { position: 'absolute', top: 10, end: 10, width: 10, height: 10, borderRadius: radii.pill, borderWidth: 2 },
  dotInPill: { end: 10 + PILL_NUDGE },
});
