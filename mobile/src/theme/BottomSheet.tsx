import { useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useI18n } from '../i18n/I18nContext';
import { useDirection } from '../reports/direction';
import { springTo, timing } from './animate';
import { Icon } from './Icon';
import { duration } from './motion';
import { useTheme } from './ThemeProvider';
import { layout, radii, spacing, typography } from './tokens';

/** How far down a sheet has to be dragged, as a share of its height, before letting go closes it. */
const CLOSE_AT = 0.25;
/** …or how fast it has to be flicked down, in points per millisecond. */
const CLOSE_SPEED = 0.5;

/**
 * A sheet that rises from the bottom edge: the one shape every sheet in the
 * app takes.
 *
 * The grabber at the top is a handle, not a picture of one. Drag the sheet
 * down by it, or by the title, and it follows the finger; let go past a
 * quarter of its height, or flick it, and it goes; let go sooner and it
 * springs back. A tap on the dimmed page above, the ✕, or the system's back
 * gesture closes it too.
 *
 * It keeps its last line clear of the home indicator, and moves up out of
 * the keyboard's way while a field in it is being typed into. It is never
 * taller than nine tenths of the screen; what does not fit scrolls inside it
 * (give it a ScrollView as its child when the content can run long).
 *
 * Under Reduce Motion it fades in and out and does not spring.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  icon,
  children,
  contentStyle,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  /** the sheet's heading, beside the ✕ */
  title?: string;
  /** a glyph before the title, when it says what kind of sheet this is (a flag for a report) */
  icon?: React.ComponentProps<typeof Icon>['name'];
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
  const y = useRef(new Animated.Value(0)).current;
  const sheetHeight = useRef(0);
  const closing = useRef(false);

  // up from below on the spring each time it opens
  useEffect(() => {
    if (!visible) return;
    closing.current = false;
    if (reduce) {
      y.setValue(0);
      return;
    }
    y.setValue(Math.round(screen * 0.6));
    const run = springTo(y, 0, 'standard');
    run.start();
    return () => run.stop();
  }, [visible, reduce, screen, y]);

  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    if (reduce) {
      onClose();
      return;
    }
    timing(y, sheetHeight.current || screen, duration.base).start(() => onClose());
  };

  // the latest dismiss, for the responder made once below
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const drag = useRef(
    PanResponder.create({
      // a drag that is mostly downward; a tap on the ✕ stays a tap
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        // down follows the finger; up gives a little and no more
        y.setValue(g.dy > 0 ? g.dy : g.dy / 6);
      },
      onPanResponderRelease: (_e, g) => {
        const far = g.dy > sheetHeight.current * CLOSE_AT;
        if (far || g.vy > CLOSE_SPEED) dismissRef.current();
        else springTo(y, 0, 'standard').start();
      },
      onPanResponderTerminate: () => springTo(y, 0, 'standard').start(),
    }),
  ).current;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable
          style={[styles.scrim, { backgroundColor: colors.scrim }]}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={t('social.close')}
        />
        <Animated.View
          testID={testID}
          accessibilityViewIsModal
          onLayout={(e) => {
            sheetHeight.current = e.nativeEvent.layout.height;
          }}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              maxHeight: Math.round(screen * 0.9),
              paddingBottom: insets.bottom + spacing.md,
              transform: [{ translateY: y }],
            },
          ]}
        >
          {/* the handle: the grabber and the header are where the sheet is dragged from */}
          <View {...drag.panHandlers}>
            <View style={styles.grabberBox}>
              <View style={[styles.grabber, { backgroundColor: colors.separator }]} />
            </View>
            {title ? (
              <View style={[styles.header, { flexDirection: dir.row }]}>
                {icon ? <Icon name={icon} size={18} color={colors.textSecondary} /> : null}
                <Text style={[styles.title, dir.text, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={2}>
                  {title}
                </Text>
                <Pressable
                  onPress={dismiss}
                  style={({ pressed }) => [styles.close, { backgroundColor: colors.controlTrack, opacity: pressed ? 0.6 : 1 }]}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={t('social.close')}
                >
                  <Icon name="close" size={16} color={colors.textSecondary} />
                </Pressable>
              </View>
            ) : null}
          </View>
          <View style={[styles.content, contentStyle]}>{children}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: StyleSheet.absoluteFill,
  sheet: {
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
  // a 30pt circle, reaching 44 with its slop and the header's height
  close: { width: 30, height: 30, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: layout.gutter, gap: spacing.sm },
});
