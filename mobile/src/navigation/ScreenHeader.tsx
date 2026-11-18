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
 * The bar at the top of a screen that is not a tab.
 *
 * Twenty-five screens wrote their own, and no two agreed. The titles came in
 * five sizes — the display face at 20, at 26 and at 34, plus the system face at
 * 16 bold and at 26 bold — and eight of the twenty-five centred the title while
 * seventeen did not. The way back came in four: `‹ Back`, a bare chevron glyph,
 * an `✕`, and nothing at all. The top padding came in five, and two screens had
 * none, so their first row sat under the status bar on a notched phone.
 *
 * Worse, the ones that did centre the title mostly did not. They put a
 * `<View style={{ width: 40 }} />` on the trailing side to balance the back
 * button — and "‹ Back" is 53pt wide in English, so the title sat 13pt left of
 * centre. In German the label is "Zurück" and it sits further still. Centring a
 * title by guessing the width of the thing opposite it only works in the
 * language you guessed in.
 *
 * So the two sides are `flex: 1` and the title is between them: equal shares of
 * whatever is left means the middle is the middle, whatever either side holds
 * and whatever language it holds it in. That is what UINavigationBar does.
 *
 * And each side is at least as wide as what it holds, measured, so a long
 * title is cut short with an ellipsis instead of running over the way back —
 * a club's name beside "گەڕانەوە" and two buttons was drawn straight across
 * both. A title that fits is centred, because the two sides share what is
 * left equally. One that does not fit between two equal sides takes the room
 * the narrower side is not using, and sits a little off centre rather than
 * being cut short: beside search and the bell, which are wider than the way
 * back, that is the difference between "Buchstaben und Wörter" and
 * "Buchstaben un…".
 *
 * The bar itself is 44pt tall — the same minimum a fingertip needs, which is
 * not a coincidence, because the back button is the thing in it — and it sits
 * just under the status bar, where the system's own bar sits. It used to
 * start 16pt lower, which on every pushed screen pushed the page down by that
 * much and put the way back further from the thumb than anywhere else.
 *
 * The way back is a disc with a chevron in it (`BackButton`), at the side
 * reading starts from: the first thing at the top of every pushed page, the
 * same shape and in the same place, so leaving a page never has to be looked
 * for. A "Back" beside the chevron took 53pt in English and more in German
 * and Soranî, and that was the room a club's name needed — "Hevalên Kur…"
 * was cut short on every phone. The title is the system's: 17pt, semibold,
 * the face of the text under it, not a display serif one size short of a
 * heading.
 *
 * Opposite the way back is what the page can do. A page with actions of its
 * own shows those. A page to browse that has none (`browse`) keeps search
 * and the bell there, in the pill the tabs have, so they are where they were
 * a moment ago. A page where something is being done — a game in play, a
 * form, a setting — keeps that corner empty: the page is the task, and the
 * only way off it is the way back.
 *
 * In Soranî and Arabic the bar is mirrored: the way back is on the right and
 * its chevron points right, which is the direction "back" is for a reader of
 * those languages.
 *
 * The way back and the actions answer a fingertip past their edges, since
 * nothing else in the bar is pressable. Where the title is (a conversation's
 * face and name, a way into whoever it names), it stands one gap from each
 * side, and the three share those gaps: each answers up to the middle, so a
 * tap a little wide of the name opens the profile and one a little wide of
 * the chevron goes back. The title answers the same way from the first time
 * it is drawn, before it can be pressed (a group's people arrive with the
 * group), because a reach that arrived later would be cut off at the bar's
 * edge.
 */
/**
 * How far a title may be set smaller to fit between the two sides before it
 * is cut short. A game's name is Kurmancî in every language, and the longer
 * ones ("Pêşbaziya Nivîsandinê") are a little wider than the room a narrow
 * phone leaves beside a trailing action: a name a few points smaller reads
 * better than a name with its end missing.
 */
const TITLE_FIT = 0.8;

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
  /**
   * `back` on a screen that was pushed, `close` on one that was presented over
   * what you were doing. iOS makes the same distinction and so should we: a
   * chevron says "the thing behind this is where you came from", an ✕ says
   * "this is on top of what you were doing".
   */
  leading?: 'back' | 'close';
  /**
   * What a screen reader should call the way back, when "Back" is vaguer
   * than it needs to be — the dictionary entry's says "Back to search".
   * The visible word does not change; iOS keeps that short on purpose.
   */
  backLabel?: string;
  /** A trailing action, if the screen has one. */
  right?: ReactNode;
  /**
   * A page to browse rather than a task: with no action of its own, it
   * keeps search and the bell at its far end, as the tabs do.
   */
  browse?: boolean;
  /**
   * A hairline under the bar, for screens whose content scrolls beneath it.
   *
   * Drawn with `separator`, not `glassBorder`: this is a line between two
   * regions of a screen, which is the same job the composer line at the bottom
   * of a chat does. Chat had one of each, and they were two different greys.
   */
  hairline?: boolean;
  /**
   * A face before the title, where the screen is about one person or one
   * group: a conversation's header shows who it is with, as every messaging
   * app's does.
   */
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
  // what stands opposite the way back: the page's own action, or search and the bell on a page to browse
  const trailing = right ?? (browse && onBack && leading === 'back' ? <GlobalActions /> : null);
  // a title that is a way in is a third control in the bar, one gap from each side
  const titleControl = !!title && !!(titleAvatar || onTitlePress);
  // how wide the way back and the trailing actions are, so neither side is squeezed under the title; until they are
  // measured, a fingertip each, so a long title does not jump on the first frame
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
      {/* always the group, so the bar is never drawn afresh; with no title to press it caps nothing */}
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
              // as far above and below as the way back, and its half of each gap beside it (the group's cap)
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
            {/* the trailing slot runs to the far edge whichever side that is */}
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
  // the way back and the actions are shapes of their own now, and a shape lines up with the page's gutter by its edge
  wrap: { paddingHorizontal: layout.gutter, paddingBottom: spacing.sm },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET, gap: BAR_GAP },
  // equal shares of what the title does not use, so the title is centred
  // without anybody having to guess how wide the way back is
  side: { flex: 1, alignItems: 'center' },
  sideFill: { flex: 1 },
  trailing: { alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: pressedDim },
  title: { fontSize: typography.ios.row, fontWeight: typography.weights.semibold, flexShrink: 1, textAlign: 'center' },
  // the face and the name together, centred as the title alone is, a fingertip tall
  titleRow: { flexShrink: 1, alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
});
