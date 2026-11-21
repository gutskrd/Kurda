import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable, ReachGroup } from '../theme/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useTheme } from '../theme/ThemeProvider';
import { layout, spacing, typography } from '../theme/tokens';
import { useDirection } from '../reports/direction';
import { pressedDim } from '../theme/motion';
import { BackButton } from './BackButton';
import { GlobalActions } from './TopBar';

/**
 * The bar at the top of a screen that is not a tab: the way back at the side reading starts from, a centred title, and
 * opposite them the page's actions (or search and the bell on a `browse` page). Mirrored in right-to-left languages.
 *
 * Both sides are `flex: 1` and at least as wide as their measured content, so the title is centred in any language and
 * a long one is cut short rather than drawn over the way back; one that does not fit takes the room the narrower side
 * leaves. A pressable title reaches to the middle of each gap from its first draw, since a reach added later would be
 * cut off at the bar's edge.
 */
/**
 * How far a title may shrink to fit before it is cut short: the longer Kurmancî game names, and any title on a folded
 * phone's narrow cover screen, are wider than the room beside the actions. At the floor it is the text size.
 */
const TITLE_FIT = 0.6;

/** The room between the way back, the title and the actions; a title that can be pressed shares it with each neighbour. */
const BAR_GAP = spacing.sm;

export function ScreenHeader({
  title,
  onBack,
  leading = 'back',
  backLabel,
  right,
  browse = false,
  hairline = false,
  titleAvatar,
  onTitlePress,
  titleHint,
  style,
}: {
  /** Centred, one line, truncated rather than wrapped — a bar is one line tall. */
  title?: string;
  /** Omitted on a screen you cannot leave upwards (a lesson in progress, a game). */
  onBack?: () => void;
  /** `back` on a pushed screen (a chevron), `close` on one presented over the app (an ✕). */
  leading?: 'back' | 'close';
  /** What a screen reader calls the way back when "Back" is too vague, e.g. "Back to search". */
  backLabel?: string;
  /** A trailing action, if the screen has one. */
  right?: ReactNode;
  /** A page to browse rather than a task: with no action of its own, it keeps search and the bell at its far end. */
  browse?: boolean;
  /**
   * A hairline under the bar, for screens whose content scrolls beneath it. Drawn in `separator`, the colour of lines
   * between regions of a screen.
   */
  hairline?: boolean;
  /** A face before the title, on a screen about one person or group. */
  titleAvatar?: ReactNode;
  /** Makes the title (and its face) a way into whoever it names — their profile, the group's people. */
  onTitlePress?: () => void;
  /** What a screen reader says a tap on the title does. */
  titleHint?: string;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dir = useDirection();
  // What stands opposite the way back: the page's own action, or search and the bell on a page to browse.
  const trailing = right ?? (browse && onBack && leading === 'back' ? <GlobalActions /> : null);
  // A title that is a way in is a third control in the bar, one gap from each side.
  const titleControl = !!title && !!(titleAvatar || onTitlePress);
  // Both sides' measured widths, so neither is squeezed under the title; a fingertip each until measured, so a long
  // title does not jump on the first frame.
  const [ends, setEnds] = useState(() => ({ start: onBack ? MIN_TOUCH_TARGET : 0, end: trailing ? MIN_TOUCH_TARGET : 0 }));
  const measure = useCallback(
    (key: 'start' | 'end') => (e: LayoutChangeEvent) => {
      const width = Math.ceil(e.nativeEvent.layout.width);
      setEnds((was) => (was[key] === width ? was : { ...was, [key]: width }));
    },
    [],
  );

  return (
    <View
      style={[
        styles.wrap,
        { paddingTop: insets.top + spacing.xs },
        hairline && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator },
        style,
      ]}
    >
      {/* Always the group, so the bar is never remounted; with no title to press it caps nothing. */}
      <ReachGroup gap={titleControl ? BAR_GAP : undefined}>
        <View style={[styles.bar, { flexDirection: dir.row }]}>
          <View style={[styles.side, { minWidth: ends.start, flexDirection: dir.row }]}>
            {onBack ? (
              <View onLayout={measure('start')}>
                <BackButton onPress={onBack} kind={leading} label={backLabel} />
              </View>
            ) : null}
          </View>

          {titleControl ? (
            <Pressable
              onPress={onTitlePress}
              disabled={!onTitlePress}
              accessibilityRole={onTitlePress ? 'button' : 'header'}
              accessibilityLabel={title}
              accessibilityHint={titleHint}
              // As far above and below as the way back, and its half of each gap beside it (the group's cap).
              reach="open"
              style={({ pressed }) => [styles.titleRow, { flexDirection: dir.row }, pressed && styles.pressed]}
            >
              {titleAvatar}
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={TITLE_FIT}>
                {title}
              </Text>
            </Pressable>
          ) : title ? (
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={TITLE_FIT} accessibilityRole="header">
              {title}
            </Text>
          ) : null}

          <View style={[styles.side, { minWidth: ends.end, flexDirection: dir.row, justifyContent: 'flex-start' }]}>
            {/* The trailing slot runs to the far edge, whichever side that is. */}
            <View style={styles.sideFill} />
            {trailing ? (
              <View onLayout={measure('end')} style={[styles.trailing, { flexDirection: dir.row }]}>
                {trailing}
              </View>
            ) : null}
          </View>
        </View>
      </ReachGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  // The way back and the actions are shapes of their own, so they line up with the gutter by their edge.
  wrap: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET, gap: BAR_GAP },
  // Equal shares of what the title leaves, so it is centred without guessing either side's width.
  side: { flex: 1, alignItems: 'center' },
  sideFill: { flex: 1 },
  trailing: { alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: pressedDim },
  title: { fontSize: typography.sizes.text, fontWeight: typography.weights.semibold, flexShrink: 1, textAlign: 'center' },
  // The face and the name together, centred as the title alone is, a fingertip tall.
  titleRow: { flexShrink: 1, alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
});
