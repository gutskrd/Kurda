import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import {
  Animated,
  BackHandler,
  Dimensions,
  Easing,
  Platform,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../a11y/a11y';
import { useReducedMotion } from '../a11y/useReducedMotion';
import { Icon, type IconName } from '../theme/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { sectionLabel } from '../theme/fonts';
import { radii, spacing, typography } from '../theme/tokens';
import { useI18n } from '../i18n/I18nContext';
import type { TranslationKey } from '../i18n/translations';
import { useDirection } from '../reports/direction';

/**
 * How much of the screen the panel covers, and how long it takes.
 *
 * The strip of the screen left over is not decoration. It is what tells you
 * the app is still behind the panel rather than replaced by it, and it is
 * where you tap to get back.
 */
const WIDTH_RATIO = 0.84;
const DURATION = 250;

/** Quick off the edge and settling gently: a sine ease-out. */
const EASE = Easing.out(Easing.sin);

/** Past this much of the way, a flick opens rather than falls back. */
const COMMIT = 0.4;


export interface MenuLink {
  key: string;
  labelKey: TranslationKey;
  icon: IconName;
  onPress: () => void;
  /**
   * A count on the right of the row, for a destination with something
   * waiting in it.
   *
   * Already a string rather than a number: `unreadBadge` caps it, so what
   * arrives here is "3" or "9+" and this does not have to know which.
   */
  badge?: string;
}

export interface MenuGroup {
  /** Null for the first group, which needs no heading. */
  titleKey: TranslationKey | null;
  links: MenuLink[];
}

/**
 * The menu panel: the places that have no tab of their own.
 *
 * It belongs to Profile and comes in from that screen's menu button, at the
 * end of its header — so it slides in from the end edge, the side the button
 * is on. It slides over the app rather than pushing it: the screen behind
 * stays where it is and a scrim darkens it. The panel itself is a real
 * surface, the app's background colour, not a floating card, because it is
 * attached to the edge of the screen and a card would look like it had come
 * loose.
 *
 * Built on `Animated` and `PanResponder` from React Native itself. The
 * alternative was `@react-navigation/drawer`, which needs Reanimated and
 * Gesture Handler: two native dependencies and a rebuild for one panel.
 */
export function SideMenu({
  open,
  onClose,
  header,
  groups,
  footer,
  side = 'start',
}: {
  open: boolean;
  onClose: () => void;
  /** Who you are, at the top. */
  header?: ReactNode;
  groups: MenuGroup[];
  footer?: ReactNode;
  /** The edge it comes from: the side its button is on. Mirrored in a right-to-left language. */
  side?: 'start' | 'end';
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const { t } = useI18n();
  const dir = useDirection();
  // which physical edge: the end is the right in a left-to-right language
  const fromRight = (side === 'end') !== (dir.row === 'row-reverse');
  const sign = fromRight ? 1 : -1;
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const width = Math.round(Dimensions.get('window').width * WIDTH_RATIO);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      slide.setValue(open ? 1 : 0);
      return;
    }
    const anim = Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: DURATION,
      useNativeDriver: true,
      easing: EASE,
    });
    /*
     * Started and left alone.
     *
     * Stopping it in a cleanup looked tidy and was the bug: the effect re-runs
     * when `open` flips, so the cleanup called stop() on the animation that had
     * just finished — which detaches the value from the view. The next one ran,
     * the number changed, and nothing on screen moved. Animated already
     * supersedes an earlier animation on the same value when a new one starts,
     * so there was never anything to clean up.
     */
    anim.start();
  }, [open, reduceMotion, slide]);

  // the system back gesture closes the panel before it leaves the screen
  useEffect(() => {
    // BackHandler is Android's; the web build logs an error if you touch it
    if (!open || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  /**
   * Drag it shut.
   *
   * Only horizontal movement claims the gesture, so a list inside the panel
   * still scrolls. Letting go past 40% of the way finishes the direction you
   * were already going.
   */
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_e, g) => {
        // towards the edge it came from closes it; the other way does nothing
        const towardsEdge = Math.max(0, signRef.current * g.dx);
        slide.setValue(Math.max(0, Math.min(1, 1 - towardsEdge / width)));
      },
      onPanResponderRelease: (_e, g) => {
        const travelled = Math.max(0, signRef.current * g.dx) / width;
        if (travelled > COMMIT || signRef.current * g.vx > 0.5) onCloseRef.current();
        else Animated.timing(slide, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      },
    }),
  ).current;

  // the responder is built once; these keep what it reads current
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const signRef = useRef(sign);
  signRef.current = sign;

  const renderLink = useCallback(
    (link: MenuLink) => (
      <Pressable
        key={link.key}
        onPress={() => {
          onClose();
          link.onPress();
        }}
        accessibilityRole="button"
        style={({ pressed }) => [styles.link, { flexDirection: dir.row }, pressed && { backgroundColor: colors.controlTrack }]}
      >
        <Icon name={link.icon} size={20} color={colors.textSecondary} />
        <Text style={[styles.linkText, dir.text, { color: colors.textPrimary }]} numberOfLines={1}>
          {t(link.labelKey)}
        </Text>
        {link.badge ? (
          <View style={[styles.badge, { backgroundColor: colors.goldText }]}>
            <Text style={[styles.badgeText, { color: colors.textOnPrimary }]}>{link.badge}</Text>
          </View>
        ) : null}
      </Pressable>
    ),
    [colors.controlTrack, colors.goldText, colors.textOnPrimary, colors.textPrimary, colors.textSecondary, dir, onClose, t],
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={open ? 'box-none' : 'none'}
      // closed, it is not something a screen reader should find its way into
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim, opacity: slide }]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
        />
      </Animated.View>

      <Animated.View
        {...pan.panHandlers}
        accessibilityViewIsModal={open}
        style={[
          styles.panel,
          fromRight ? styles.panelRight : styles.panelLeft,
          {
            width,
            backgroundColor: colors.background,
            paddingTop: insets.top + spacing.md,
            paddingBottom: insets.bottom,
            transform: [
              { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [sign * width, 0] }) },
            ],
          },
        ]}
      >
        {header ? <View style={styles.header}>{header}</View> : null}

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {groups.map((group, i) => (
            <View key={group.titleKey ?? 'group-' + i} style={styles.group}>
              {group.titleKey ? (
                <Text style={[styles.groupTitle, dir.text, { color: colors.textSecondary }]}>{t(group.titleKey)}</Text>
              ) : null}
              {group.links.map(renderLink)}
            </View>
          ))}
        </ScrollView>

        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Animated.View>
    </View>
  );
}

/**
 * A way for a screen to open the panel without being handed a callback.
 *
 * The panel is owned by the tab shell, because it has to cover the tab bar.
 * The button that opens it belongs at the top of whatever screen you are on.
 * One of those is six components away from the other.
 */
const OpenMenu = createContext<() => void>(() => {});

export const MenuProvider = OpenMenu.Provider;

/** Returns a function that opens the side panel, or a no-op outside the tabs. */
export function useOpenMenu(): () => void {
  return useContext(OpenMenu);
}


const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  panelLeft: { left: 0 },
  panelRight: { right: 0 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  body: { paddingBottom: spacing.lg },
  group: { paddingVertical: spacing.xs },
  groupTitle: { ...sectionLabel, paddingHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.xs },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
  },
  linkText: { fontSize: typography.ios.row, flexShrink: 1, flex: 1 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: typography.sizes.xs, fontWeight: typography.weights.bold },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
});
