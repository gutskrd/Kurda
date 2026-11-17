import { createContext, useContext, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable, ReachGroup } from '../theme/Pressable';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { Icon, type IconName } from '../theme/Icon';
import { useRing } from '../theme/animate';
import { PressableScale } from '../theme/MotionParts';
import { usePressOrigin } from '../theme/origin';
import { useTheme } from '../theme/ThemeProvider';
import { fontScaleCap, radii, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';
import { floating } from '../theme/floating';

/** The glyph in a header control: a little under the tab bar's, since it sits in a shape of its own. */
const GLYPH = 22;

/**
 * A button's share of a pill: a little wider than a fingertip, so the pill's
 * two ends belong to its buttons rather than to padding nothing answers on.
 * Two of them are exactly as wide as the pill used to be with its padding.
 */
const PILL_BUTTON = 46;

/** How far a pill button's centre sits from where a lone button's does, so the dot and the count stay over the glyph. */
const PILL_NUDGE = (PILL_BUTTON - MIN_TOUCH_TARGET) / 2;

/** Whether a header button is inside a pill of them: the pill is the shape then, and the button draws none of its own. */
const InPill = createContext(false);

/**
 * An icon at the top of a page: the "+" on Home, the bell, the new-message
 * pencil, the profile's menu.
 *
 * Every one of these was drawn on its own once — a 44pt filled circle for
 * posting, a bare 22pt glyph with a hit slop for the menu, a 20pt icon in a
 * pill for the bell — so the corners of the tabs disagreed about how big a
 * header control is. This is the one shape: a 44pt disc in the bar's own
 * fill, floating a little off the page, with a 22pt glyph in the page's ink.
 * It gives a little under the finger, as every button in the app does.
 *
 * Two or more that belong together stand in one pill (`ActionPill`), and
 * draw no disc of their own inside it: search and the bell are one shape at
 * the top of every tab.
 *
 * `dot` marks something new without a number (the bell); `badge` is a count
 * where the number matters. The label says either in words, because the dot
 * alone is colour and a screen reader cannot see it.
 *
 * `ring` is for a button that has news: a number that goes up as news
 * arrives, and each time it does the glyph swings once, as a bell that has
 * been rung does. It is how the bell says "just now" where its dot says
 * "since you last looked".
 *
 * Nothing stands close to a header control, so it answers a fingertip past
 * its edge on every side (`reach="open"`): a thumb reaching for the corner of
 * the screen lands a little short or a little wide, and still opens the bell.
 * In a pill the buttons answer above and below the same way, and meet each
 * other exactly at the pill's middle, so neither takes a tap meant for the
 * other.
 */
export function HeaderButton({
  icon,
  label,
  onPress,
  dot = false,
  badge,
  ring = 0,
  testID,
}: {
  icon: IconName;
  /** What a screen reader says, including whatever the dot means. */
  label: string;
  onPress: () => void;
  dot?: boolean;
  badge?: string | null;
  ring?: number;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const grouped = useContext(InPill);
  const swing = useRing(ring);
  // a page this opens grows out of the button, in a pill as much as on its own
  const origin = usePressOrigin();
  const marks = (
    <>
      {/* swung from its top, where a bell hangs */}
      <Animated.View style={{ transformOrigin: 'top center', transform: [{ rotate: swing.rotate }] }}>
        <Icon name={icon} size={GLYPH} color={colors.textPrimary} />
      </Animated.View>
      {badge ? (
        <View style={[styles.badge, grouped && styles.badgeInPill, { backgroundColor: colors.primary, borderColor: colors.barFill }]} pointerEvents="none">
          <Text style={[styles.badgeText, { color: colors.textOnPrimary }]} numberOfLines={1} maxFontSizeMultiplier={fontScaleCap.fixedBox}>
            {badge}
          </Text>
        </View>
      ) : dot ? (
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
        // above and below as far as a lone one; side to side the pill's group stops it at its neighbour and at the pill's ends
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
      style={[styles.button, floating.control, { backgroundColor: colors.barFill, shadowColor: colors.softShadow }]}
    >
      {marks}
    </PressableScale>
  );
}

/**
 * Header buttons that belong together, in one rounded shape: search and the
 * bell at the top of every tab, a group's people and its menu at the top of
 * its thread. One shape with two glyphs in it is read as one thing in the
 * corner, where two discs side by side are two things to choose between.
 *
 * The buttons touch, with no gap between them, so their group lets neither
 * reach sideways at all: the seam is the pill's middle, and its ends are the
 * ends of the outer buttons. A disc beside the pill (a tab's own action)
 * reaches across the gap to the pill's edge and no further.
 */
export function ActionPill({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }): React.JSX.Element {
  const { colors } = useTheme();
  const dir = useDirection();
  return (
    <InPill.Provider value>
      <View style={[styles.pill, floating.control, { backgroundColor: colors.barFill, shadowColor: colors.softShadow, flexDirection: dir.row }, style]}>
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
  // the room at each end, so the first and last glyphs are not hard against the pill's curve, is in the wider buttons, where a tap on it counts
  inPill: { width: PILL_BUTTON },
  pill: { height: MIN_TOUCH_TARGET, borderRadius: radii.pill, alignItems: 'center' },
  // over the glyph's top-end corner, ringed in the shape's own colour so it reads as
  // sitting on the icon rather than touching it
  dot: { position: 'absolute', top: 10, end: 10, width: 10, height: 10, borderRadius: radii.pill, borderWidth: 2 },
  dotInPill: { end: 10 + PILL_NUDGE },
  badge: {
    position: 'absolute',
    top: 4,
    end: 2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInPill: { end: 2 + PILL_NUDGE },
  badgeText: { fontSize: typography.ios.tabLabel, fontWeight: typography.weights.bold },
});
