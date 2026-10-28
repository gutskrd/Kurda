import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderGestureState,
  type ScrollViewProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { haptic } from '../feedback/haptics';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { SHEET_MAX_WIDTH } from '../reports/sheet';
import { DragSamples, releaseSpring } from './animate';
import { Icon } from './Icon';
import { DRAG_SLOP, SHEET_MAX, detentHeights, dragOffset, restingOffsets, settleSheet, type SheetDetent } from './sheetMotion';
import { useTheme } from './ThemeProvider';
import { layout, radii, spacing, typography } from './tokens';

export type { SheetDetent } from './sheetMotion';

/**
 * What a scroll view inside a sheet and the sheet tell each other: how far
 * the content is scrolled, so the sheet knows when a drag is its own, and
 * whether the sheet is being dragged, so the content holds still meanwhile.
 */
interface SheetScroll {
  /** a scroll view arrives; returns its leaving */
  attach: () => () => void;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEnabled: boolean;
}

const SheetScrollContext = createContext<SheetScroll | null>(null);

/** The grabber is drawn 17 points tall; its touch reaches a fingertip's 44. */
const GRABBER_SLOP = { top: 14, bottom: 14 };

/**
 * The ScrollView for content that can run longer than its sheet. The sheet
 * reads how far it is scrolled: a drag down with the content at its top moves
 * the sheet, any other drag scrolls the content, as in a system sheet. At its
 * top it does not bounce — the sheet is what gives there. Outside a sheet it
 * is a plain ScrollView.
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
 * A sheet that rises from the bottom edge: the one shape every sheet in the
 * app takes.
 *
 * The whole sheet is a handle, as a system sheet is. It follows the finger
 * one to one from wherever the drag starts — the grabber, the header, the
 * content — and gives with the rubber band past its top. A drag that starts
 * in content scrolled away from its top scrolls the content instead (that
 * content goes in a `SheetScrollView`, which tells the sheet how far it is
 * scrolled). Let go, it decides by where the flick would have carried it:
 * past half of what shows and it goes, otherwise it settles at its nearest
 * height, carrying the finger's speed into the spring. A tap on the dimmed
 * page above, the ✕, or the system's back gesture closes it too. The ✕ is
 * there with or without a title, so a sheet whose content carries its own
 * heading (an item, a letter) still has it.
 *
 * By default it is as tall as its content, never more than nine tenths of
 * the screen. With `detents` it rests at those heights instead — iOS's
 * medium, about half the screen, and large, or shares of the screen — opening
 * at the shortest; a flick moves between them, the grabber cycles them, and
 * landing on another one is felt as a light knock. At a shorter one the rest
 * of the sheet waits below the screen's edge, and the content is laid out in
 * what shows.
 *
 * It keeps its last line clear of the home indicator, and moves up out of
 * the keyboard's way while a field in it is being typed into. It is never
 * wider than a sheet on a tablet.
 *
 * Under Reduce Motion it fades in and out and does not spring; a drag still
 * follows the finger, and a release lands where it is going at once.
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
  /** the sheet's heading, beside the ✕ */
  title?: string;
  /** a title in a language of its own (a story's): the voice VoiceOver reads it in, and the side it starts from */
  titleLanguage?: { accessibilityLanguage: string; style?: StyleProp<TextStyle> };
  /** a glyph before the title, when it says what kind of sheet this is (a flag for a report) */
  icon?: React.ComponentProps<typeof Icon>['name'];
  /** a sheet in steps: a ‹ before the title, in the icon's place, back to the step before */
  onBack?: () => void;
  /** false while something the sheet started is on its way (a delete): nothing closes it until it has answered */
  dismissible?: boolean;
  /** the heights it rests at, `['medium', 'large']` or shares of the screen; without, it is as tall as its content */
  detents?: readonly SheetDetent[];
  children: ReactNode;
  /** padding and gaps inside the sheet, under the header */
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
  // the detents by value, not by the array a caller builds afresh each render
  const detentKey = detents?.join(',') ?? '';
  const heights = useMemo(() => detentHeights(detents, screen), [detentKey, screen]);
  const stops = useMemo(() => restingOffsets(heights), [heights]);
  const lowest = stops[stops.length - 1]!;
  const tallest = heights[heights.length - 1];

  const y = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState(0);
  const height = tallest ?? measured;
  // where it rests now: the resting offset it last settled at, or is settling at
  const rest = useRef(lowest);
  // how much of the sheet is below the screen's edge at rest, so its content is laid out in what shows
  const [hidden, setHidden] = useState(lowest);
  const closing = useRef(false);
  const [dragging, setDragging] = useState(false);

  // up from below on the spring each time it opens, to its shortest height
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
    const run = releaseSpring(y, lowest, 0, { kind: 'standard' });
    run.start();
    return () => run.stop();
  }, [visible, reduce, screen, lowest, y]);

  /** Close, unless it may not be closed yet; says whether it is going. `velocity` is a flick's, carried down. */
  const dismiss = (velocity = 0): boolean => {
    if (closing.current) return true;
    if (!dismissible) return false;
    closing.current = true;
    if (reduce) {
      onClose();
      return true;
    }
    releaseSpring(y, (height || screen) + insets.bottom, velocity, { kind: 'standard', clamp: true }).start(() => onClose());
    return true;
  };

  /** Rest at `offset`, from a finger let go at `velocity`; a different height than before is felt as it lands. */
  const settle = (offset: number, velocity: number): void => {
    if (offset !== rest.current) haptic('tap');
    rest.current = offset;
    // growing, its content has the room at once; shrinking, once it is down
    if (offset < hidden) setHidden(offset);
    if (reduce) {
      y.setValue(offset);
      setHidden(offset);
      return;
    }
    releaseSpring(y, offset, velocity).start(({ finished }) => finished && setHidden(offset));
  };

  // the content's scroll, as a SheetScrollView reports it
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

  // what the responders below (made once) read: always the latest
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
      // a sheet that may not close yet settles as one let go too soon does
      if (to === 'close' && now.current.dismiss(v)) return;
      now.current.settle(to === 'close' ? Math.max(...now.current.stops) : to, v);
    };
    const shared = {
      onPanResponderGrant: (_e: unknown, g: PanResponderGestureState) => {
        // from where the finger caught it, even mid-flight
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
      // a drag, once the sheet has it, stays the sheet's
      onPanResponderTerminationRequest: () => false,
    };
    responders.current = {
      // anywhere on the sheet, caught before the content can take it, when the drag is the sheet's to take
      whole: PanResponder.create({
        ...shared,
        onMoveShouldSetPanResponderCapture: (_e, g) => {
          if (!vertical(g)) return false;
          const s = scroll.current;
          if (s.attached > 0) return s.offset <= 0 && (g.dy > 0 || rest.current > Math.min(...now.current.stops));
          // no scroll view says how far it is scrolled: safe while nothing in it can scroll, which is while it fits
          return now.current.sized || now.current.measured < now.current.cap - 1;
        },
      }),
      // the grabber and the header, always
      handle: PanResponder.create({ ...shared, onMoveShouldSetPanResponder: (_e, g) => vertical(g) }),
    };
  }
  const { whole, handle } = responders.current;

  // the page behind dims less as the sheet is pulled down towards closing
  const shown = (height || screen) - lowest;
  const dim = y.interpolate({ inputRange: [lowest, lowest + Math.max(1, shown)], outputRange: [1, 0], extrapolate: 'clamp' });
  const growing = hidden > 0;
  const cycle = () => {
    const at = stops.indexOf(rest.current);
    settle(at > 0 ? stops[at - 1]! : lowest, 0);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => dismiss()} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[styles.scrim, { backgroundColor: colors.scrim, opacity: dim }]}>
          <Pressable style={styles.fill} onPress={() => dismiss()} accessibilityRole="button" accessibilityLabel={t('social.close')} />
        </Animated.View>
        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          onAccessibilityEscape={() => dismiss()}
          onLayout={(e) => setMeasured(e.nativeEvent.layout.height)}
          {...whole.panHandlers}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              ...(tallest !== undefined ? { height: tallest } : { maxHeight: cap }),
              paddingBottom: insets.bottom + spacing.md + hidden,
              transform: [{ translateY: y }],
            },
          ]}
        >
          {/* the handle: the grabber and the header are where the sheet can always be dragged from */}
          <View {...handle.panHandlers}>
            {stops.length > 1 ? (
              // with heights to move between, the grabber is a control: a tap moves to the next one
              <Pressable
                onPress={cycle}
                style={styles.grabberBox}
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
                  style={({ pressed }) => [styles.round, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.6 : 1 }]}
                  hitSlop={6}
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
                // no title: the content carries its own heading, and the ✕ stays on the closing side
                <View style={styles.spacer} />
              )}
              <Pressable
                onPress={() => dismiss()}
                disabled={!dismissible}
                style={({ pressed }) => [
                  styles.round,
                  { backgroundColor: colors.controlTrack, opacity: !dismissible ? 0.4 : pressed ? 0.6 : 1 },
                ]}
                hitSlop={6}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: StyleSheet.absoluteFill,
  sheet: {
    // a sheet on a tablet too, centred, rather than a band across the screen
    width: '100%',
    maxWidth: SHEET_MAX_WIDTH,
    alignSelf: 'center',
    // and shorter than its content when the keyboard leaves it less room: its ScrollView takes up the difference
    flexShrink: 1,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
  },
  // a fingertip of room round the grabber, so it can be caught
  grabberBox: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
  grabber: { width: 36, height: 5, borderRadius: radii.pill },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.gutter,
    paddingBottom: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
  },
  title: { flex: 1, fontSize: typography.ios.row, fontWeight: typography.weights.semibold },
  spacer: { flex: 1 },
  // the ✕ and the ‹: 30pt circles, reaching 44 with their slop and the header's height
  round: { width: 30, height: 30, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  // gives way under the 90% cap, so a ScrollView inside scrolls instead of being cut off
  content: { flexShrink: 1, paddingHorizontal: layout.gutter, gap: spacing.sm },
});
