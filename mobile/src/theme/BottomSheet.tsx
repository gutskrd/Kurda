import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderGestureState,
  type ScrollViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Pressable, ReachReset } from './Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { SHEET_MAX_WIDTH } from '../reports/sheet';
import { DragSamples, releaseSpring, timing } from './animate';
import { Icon } from './Icon';
import { DRAG_SLOP, duration, pressedDim } from './motion';
import { SHEET_MAX, detentHeights, dragOffset, leaveMs, restingOffsets, settleSheet, type SheetDetent } from './sheetMotion';
import { useTheme } from './ThemeProvider';
import { layout, radii, spacing, typography } from './tokens';
import { heldDim } from './MotionParts';

export type { SheetDetent } from './sheetMotion';

/**
 * What a scroll view inside a sheet and the sheet share: the content's scroll offset, so the sheet knows when a drag is
 * its own, and whether the sheet is being dragged, so the content holds still.
 */
interface SheetScroll {
  /** Registers a scroll view; returns its unregister. */
  attach: () => () => void;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEnabled: boolean;
}

const SheetScrollContext = createContext<SheetScroll | null>(null);

/**
 * The grabber's box is 17 points tall with its top at the sheet's edge, which clips anything above, so it reaches
 * down only, 8 into the header, where the ‹ and ✕ are drawn later and win where they meet.
 */
const GRABBER_SLOP = { top: 0, bottom: 8, left: 0, right: 0 };
/** The ✕ and ‹ are small circles with nothing beside them, so each reaches past its edges (`reach="open"`): 9 a side, to 48. */
const ROUND = 30;
/**
 * How far above the sheet's top edge a tap on the dimmed page is ignored: a finger aiming for the grabber or header
 * and landing high is not asking to close the sheet and lose its content.
 */
const SCRIM_GUARD = 12;

/**
 * A ScrollView for content that may outgrow its sheet. The sheet reads its scroll offset: a downward drag with the
 * content at its top moves the sheet, any other drag scrolls the content, as in a system sheet. It does not bounce
 * at the top, since the sheet gives there. Outside a sheet it is a plain ScrollView.
 */
export function SheetScrollView({ onScroll, scrollEnabled = true, ref, ...props }: ScrollViewProps & { ref?: Ref<ScrollView> }): React.JSX.Element {
  const sheet = useContext(SheetScrollContext);
  const attach = sheet?.attach;
  useEffect(() => attach?.(), [attach]);
  const [atTop, setAtTop] = useState(true);
  return (
    <ScrollView
      ref={ref}
      scrollEventThrottle={16}
      {...props}
      bounces={sheet ? props.bounces !== false && !atTop : props.bounces}
      scrollEnabled={scrollEnabled && (sheet?.scrollEnabled ?? true)}
      onScroll={(e) => {
        sheet?.onScroll(e);
        const top = e.nativeEvent.contentOffset.y <= 0;
        if (top !== atTop) setAtTop(top);
        onScroll?.(e);
      }}
    />
  );
}

/**
 * The one sheet shape in the app, rising from the bottom edge. The whole sheet is a handle: it follows the finger
 * one to one from anywhere, with a rubber band past its top, unless the drag starts in content scrolled away from
 * its top (`SheetScrollView`), which scrolls instead. On release it goes if the projected flick passes half of what
 * shows, else settles at its nearest height carrying the finger's speed. A tap on the dimmed page, the ✕ (shown
 * with or without a title) or the system back gesture also closes it.
 *
 * It opens on the interface spring within 300 ms and leaves in the standard exit time, sooner after a fast flick
 * (`leaveMs`), and reports closed as soon as it has left so the page behind takes taps at once.
 *
 * By default it fits its content up to nine tenths of the screen. With `detents` it rests at those heights
 * (`medium`, `large`, or screen fractions), opening at the shortest; flicks move between them, the grabber cycles
 * them, and each change gets a light haptic, with content laid out in what shows. It stays clear of the home
 * indicator, moves above the keyboard while typing, and is never wider than a tablet sheet. Under Reduce Motion it
 * fades instead of springing, and a release lands at once.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  titleLanguage,
  icon,
  onBack,
  dismissible = true,
  detents,
  children,
  contentStyle,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  /** The sheet's heading, beside the ✕. */
  title?: string;
  /** A title in its own language (a story's): the language VoiceOver reads it in, and its starting side. */
  titleLanguage?: { accessibilityLanguage: string; style?: StyleProp<TextStyle> };
  /** A glyph before the title saying what kind of sheet this is (a flag for a report). */
  icon?: React.ComponentProps<typeof Icon>['name'];
  /** For a sheet in steps: a ‹ in the icon's place, back to the previous step. */
  onBack?: () => void;
  /** False while something the sheet started is in flight (a delete); nothing closes it until that answers. */
  dismissible?: boolean;
  /** The heights it rests at, `['medium', 'large']` or screen fractions; without, it fits its content. */
  detents?: readonly SheetDetent[];
  children: ReactNode;
  /** Padding and gaps inside the sheet, under the header. */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}): React.JSX.Element {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { height: screen } = useWindowDimensions();
  const cap = Math.round(screen * SHEET_MAX);
  // The detents by value, not by the array a caller builds afresh each render.
  const detentKey = detents?.join(',') ?? '';
  const heights = useMemo(() => detentHeights(detents, screen), [detentKey, screen]);
  const stops = useMemo(() => restingOffsets(heights), [heights]);
  const lowest = stops[stops.length - 1]!;
  const tallest = heights[heights.length - 1];

  const y = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState(0);
  const height = tallest ?? measured;
  // Where it rests now: the offset it last settled at, or is settling at.
  const rest = useRef(lowest);
  // How much of the sheet is below the screen's edge at rest, so content is laid out in what shows.
  const [hidden, setHidden] = useState(lowest);
  const closing = useRef(false);
  const [dragging, setDragging] = useState(false);

  // Springs up from below to its shortest height each time it opens.
  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    rest.current = lowest;
    setHidden(lowest);
    if (reduce) {
      y.setValue(lowest);
      return;
    }
    y.setValue(screen);
    const run = releaseSpring(y, lowest, 0, { kind: 'chrome' });
    run.start();
    return () => run.stop();
  }, [visible, reduce, screen, lowest, y]);

  /** Closes unless it may not close yet, and returns whether it is going. `velocity` is a flick's, `from` where the finger let go. */
  const dismiss = (velocity = 0, from = rest.current): boolean => {
    if (closing.current) return true;
    if (!dismissible) return false;
    closing.current = true;
    if (reduce) {
      onClose();
      return true;
    }
    const gone = (height || screen) + insets.bottom;
    // A timing rather than a spring, so it reports closed as it leaves the screen, not most of a second later (`leaveMs`).
    timing(y, gone, leaveMs(gone - from, velocity, duration.base, duration.quick)).start(() => onClose());
    return true;
  };

  /** Rests at `offset` after a release at `velocity`; a change of height gets a haptic as it lands. */
  const settle = (offset: number, velocity: number): void => {
    if (offset !== rest.current) haptic('tap');
    rest.current = offset;
    // Growing, the content gets the room at once; shrinking, once it is down.
    if (offset < hidden) setHidden(offset);
    if (reduce) {
      y.setValue(offset);
      setHidden(offset);
      return;
    }
    releaseSpring(y, offset, velocity).start(({ finished }) => finished && setHidden(offset));
  };

  // The content's scroll, as a SheetScrollView reports it.
  const scroll = useRef({ attached: 0, offset: 0 });
  const attach = useCallback(() => {
    scroll.current.attached += 1;
    scroll.current.offset = 0;
    return () => {
      scroll.current.attached -= 1;
    };
  }, []);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scroll.current.offset = e.nativeEvent.contentOffset.y;
  }, []);
  const bridge = useMemo<SheetScroll>(() => ({ attach, onScroll, scrollEnabled: !dragging }), [attach, onScroll, dragging]);

  // What the responders below (created once) read: always the latest.
  const latest = { stops, height: height || screen, dismissible, cap, sized: tallest !== undefined, measured, dismiss, settle };
  const now = useRef(latest);
  now.current = latest;

  const responders = useRef<{ whole: ReturnType<typeof PanResponder.create>; handle: ReturnType<typeof PanResponder.create> } | null>(null);
  if (responders.current === null) {
    const drag = { from: 0, dy0: 0, at: 0 };
    const samples = new DragSamples();
    const vertical = (g: PanResponderGestureState) => Math.abs(g.dy) > DRAG_SLOP && Math.abs(g.dy) > Math.abs(g.dx);
    const release = () => {
      setDragging(false);
      const v = samples.velocity();
      const to = settleSheet(drag.at, v, now.current);
      // A sheet that may not close yet settles as if released too soon.
      if (to === 'close' && now.current.dismiss(v, drag.at)) return;
      now.current.settle(to === 'close' ? Math.max(...now.current.stops) : to, v);
    };
    const shared = {
      onPanResponderGrant: (_e: unknown, g: PanResponderGestureState) => {
        // From where the finger caught it, even mid-flight.
        drag.dy0 = g.dy;
        drag.from = rest.current;
        drag.at = rest.current;
        y.stopAnimation((v) => {
          drag.from = v;
        });
        samples.add(g.dy);
        setDragging(true);
      },
      onPanResponderMove: (_e: unknown, g: PanResponderGestureState) => {
        samples.add(g.dy);
        drag.at = dragOffset(drag.from, g.dy - drag.dy0, now.current);
        y.setValue(drag.at);
      },
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
      // Once the sheet has a drag, it keeps it.
      onPanResponderTerminationRequest: () => false,
    };
    responders.current = {
      // Anywhere on the sheet, captured before the content, when the drag is the sheet's to take.
      whole: PanResponder.create({
        ...shared,
        onMoveShouldSetPanResponderCapture: (_e, g) => {
          if (!vertical(g)) return false;
          const s = scroll.current;
          if (s.attached > 0) return s.offset <= 0 && (g.dy > 0 || rest.current > Math.min(...now.current.stops));
          // Without a scroll view reporting its offset, only safe while nothing can scroll, which is while it fits.
          return now.current.sized || now.current.measured < now.current.cap - 1;
        },
      }),
      // The grabber and the header, always.
      handle: PanResponder.create({ ...shared, onMoveShouldSetPanResponder: (_e, g) => vertical(g) }),
    };
  }
  const { whole, handle } = responders.current;

  // The backdrop dims less as the sheet is pulled down towards closing.
  const shown = (height || screen) - lowest;
  const dim = y.interpolate({ inputRange: [lowest, lowest + Math.max(1, shown)], outputRange: [1, 0], extrapolate: 'clamp' });
  const growing = hidden > 0;
  const cycle = () => {
    const at = stops.indexOf(rest.current);
    settle(at > 0 ? stops[at - 1]! : lowest, 0);
  };

  // The sheet's layout position, in the same frame the scrim starts from (both fill from the top left).
  const laidOut = useRef<{ x: number; y: number; width: number } | null>(null);
  /*
   * A tap on the dimmed page closes the sheet, unless it lands in the `SCRIM_GUARD` band just above the sheet's
   * resting top edge (its laid-out top, lowered by any part kept below the screen), across the sheet's width. A tap
   * beside a narrower tablet sheet still closes it, as does one with no known position (screen reader, keyboard).
   */
  const onScrim = (e: GestureResponderEvent): void => {
    const { pageX, pageY } = e.nativeEvent;
    const box = laidOut.current;
    const placed = box !== null && typeof pageX === 'number' && typeof pageY === 'number';
    if (placed && pageX >= box.x && pageX <= box.x + box.width && pageY >= box.y + rest.current - SCRIM_GUARD) return;
    dismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => dismiss()} statusBarTranslucent>
      {/* The sheet is not beside its opener's controls, so their reach group caps nothing here. */}
      <ReachReset>
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[styles.scrim, { backgroundColor: colors.scrim, opacity: dim }]}>
            <Pressable style={styles.fill} onPress={onScrim} accessibilityRole="button" accessibilityLabel={t('social.close')} />
          </Animated.View>
          <Animated.View
            testID={testID}
            accessibilityViewIsModal
            onAccessibilityEscape={() => dismiss()}
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              laidOut.current = { x, y, width };
              setMeasured(height);
            }}
            {...whole.panHandlers}
            style={[
              styles.sheet,
              {
                // The floating chrome's neutral grey, with its line of light along the top, as the website's sheets.
                backgroundColor: colors.panel,
                borderTopColor: colors.glassRim,
                ...(tallest !== undefined ? { height: tallest } : { maxHeight: cap }),
                paddingBottom: insets.bottom + spacing.md + hidden,
                transform: [{ translateY: y }],
              },
            ]}
          >
            {/* The handle: the sheet can always be dragged from the grabber and header. */}
            <View {...handle.panHandlers}>
              {stops.length > 1 ? (
                // With detents, the grabber is a control: a tap moves to the next one.
                <Pressable
                  onPress={cycle}
                  style={({ pressed }) => [styles.grabberBox, pressed && heldDim]}
                  hitSlop={GRABBER_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={t(growing ? 'sheet.expand' : 'sheet.collapse')}
                  testID={testID ? `${testID}-grabber` : undefined}
                >
                  <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
                </Pressable>
              ) : (
                <View style={styles.grabberBox}>
                  <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
                </View>
              )}
              <View style={[styles.header, { flexDirection: dir.row }]}>
                {onBack ? (
                  <Pressable
                    onPress={onBack}
                    style={({ pressed }) => [styles.round, { backgroundColor: colors.controlTrack, opacity: pressed ? pressedDim : 1 }]}
                    reach="open"
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back')}
                  >
                    <Icon name="chevron-left" size={16} color={colors.textSecondary} style={dir.flip} />
                  </Pressable>
                ) : icon ? (
                  <Icon name={icon} size={18} color={colors.textSecondary} />
                ) : null}
                {title ? (
                  <Text
                    style={[styles.title, dir.text, { color: colors.textPrimary }, titleLanguage?.style]}
                    accessibilityRole="header"
                    accessibilityLanguage={titleLanguage?.accessibilityLanguage}
                    numberOfLines={2}
                  >
                    {title}
                  </Text>
                ) : (
                  // No title: the content has its own heading, and the ✕ stays on the closing side.
                  <View style={styles.spacer} />
                )}
                <Pressable
                  onPress={() => dismiss()}
                  disabled={!dismissible}
                  style={({ pressed }) => [
                    styles.round,
                    { backgroundColor: colors.controlTrack, opacity: !dismissible ? 0.4 : pressed ? pressedDim : 1 },
                  ]}
                  reach="open"
                  accessibilityRole="button"
                  accessibilityLabel={t('social.close')}
                  accessibilityState={{ disabled: !dismissible }}
                  aria-disabled={!dismissible}
                >
                  <Icon name="close" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            </View>
            <SheetScrollContext.Provider value={bridge}>
              <View style={[styles.content, contentStyle]}>{children}</View>
            </SheetScrollContext.Provider>
          </Animated.View>
        </KeyboardAvoidingView>
      </ReachReset>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: StyleSheet.absoluteFill,
  sheet: {
    // Centred on a tablet too, rather than a band across the screen.
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    alignSelf: 'center',
    // And shorter than its content when the keyboard leaves less room; its ScrollView absorbs the difference.
    flexShrink: 1,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  // A fingertip of room round the grabber, so it can be caught.
  grabberBox: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  grabber: { width: 36, height: 5, borderRadius: radii.pill },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  title: { flex: 1, fontSize: typography.sizes.text, fontWeight: typography.weights.semibold },
  spacer: { flex: 1 },
  // The ✕ and ‹: small circles reaching 48 past their edges.
  round: { width: ROUND, height: ROUND, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  // Shrinks under the 90% cap, so a ScrollView inside scrolls instead of being cut off.
  content: { flexShrink: 1, paddingHorizontal: layout.gutter, gap: spacing.sm },
});
